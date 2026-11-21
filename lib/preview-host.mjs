import { previewRecordCommands } from './preview-records.mjs';

export function createPreviewHost(pluginId) {
    const artist = 'Echo Workshop';
    const tracks = [
        { id: 'demo-1', title: 'First Light', duration: 180, liked: true },
        { id: 'demo-2', title: 'Night Drive', duration: 240, liked: false },
    ].map(track => ({
        ...track, artist, subtitle: artist, kind: 'Track', playable: true, count: 1,
        album: 'Demo Sessions', album_artist: artist,
    }));
    const playlist = {
        id: 'demo-playlist', title: 'Demo Sessions', subtitle: artist, kind: 'Playlist',
        duration: 420, count: 2, playable: true, liked: false, album: null, album_artist: null,
    };
    const playlistTracks = [...tracks];
    let archived = false;
    let nextRecovery = 1;
    const removals = new Map();
    let revision = 1;
    let favoriteRevision = 0;
    const idleTimer = { isActive: false, remainingMs: 0, durationMinutes: 0, action: 'pause', fadeOutEnabled: false };
    let timer = idleTimer;
    let playback = {
        status: 'paused', title: tracks[0].title, artist, position: 12, duration: tracks[0].duration,
        volume: 50, rate: 1, mode: 'Sequential', queueId: 1, queuePosition: 1, queueLength: 1,
    };
    const previewCover = { width: 12, height: 12, dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAMAAwDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIgBEY//2Q==' };
    const savedQueues = new Map();
    let nextSnapshot = 1;
    let deletedSnapshot = null;
    const summaries = () => Array.from(savedQueues.values(), record => record.summary)
        .sort((a, b) => Number(b.id) - Number(a.id));
    let nextOccurrence = 1;
    const queueEntry = track => ({ ...track, occurrenceId: String(nextOccurrence++) });
    let queue = [queueEntry(tracks[0])];
    let sequence = 1;
    let current = queue[0];
    let contributions = { commands: [], sources: [] };
    const fixtureSource = { plugin: 'fixture.music', provider: 'catalog', title: 'Demo Sessions', browse: true };
    const catalogRef = track => ({ providerTrackId: track.id, title: track.title, artist, album: track.album, duration: track.duration });
    const sourceList = () => [fixtureSource, ...(contributions.sources ?? []).map(s => ({
        plugin: pluginId, provider: s.id, title: s.title, browse: s.browse ?? false,
    }))];
    const fixturePage = ({ source, page, pageSize, query, collectionId }, browse) => {
        if (source.plugin !== fixtureSource.plugin || source.provider !== fixtureSource.provider) throw new Error('Unknown preview source.');
        if (browse && collectionId == null) return { tracks: [], collections: page === 1 ? [{kind:'album', id:'demo-album', title:'Demo Sessions'}] : [], hasMore:false };
        const list = browse ? (collectionId === 'demo-album' ? tracks : []) : tracks.filter(t =>
            [t.title, artist, t.album].some(v => v.toLowerCase().includes(query.toLowerCase())));
        const start = (page - 1) * pageSize;
        return { tracks: list.slice(start, start + pageSize).map(catalogRef), collections: [], hasMore: start + pageSize < list.length };
    };
    let events = new Set();
    const reference = track => track.source
        ? { kind: 'source', source: { plugin: track.source.plugin, provider: track.source.provider },
            track: { providerTrackId: track.id, title: track.title, artist: track.artist, album: track.album, duration: track.duration } }
        : { kind: 'catalog', source: 'Local', id: track.id };
    const currentTrack = () => ({
        sequence, reference: reference(current), title: current.title, artist: current.artist, catalog: current.source ? null : { source: 'Local', id: current.id },
    });
    const eventData = {
        'library.changed': () => ({ source: 'Local', revision }),
        'library.likedChanged': () => ({ source: 'Local', revision: favoriteRevision }),
        'playback.changed': () => playback,
        'playback.trackChanged': currentTrack,
        'queue.saved.changed': () => ({ snapshots: summaries(), undoRemoveId: deletedSnapshot?.summary.id ?? null }),
        'queue.changed': () => ({ queueId: playback.queueId, position: playback.queuePosition, total: queue.length }),
        'audio.analysis': () => null,
        'sleepTimer.tick': () => ({ remainingMs: timer.remainingMs }),
    };
    const frame = event => ({ type: 'event', event, value: eventData[event]() });
    const emit = (...topics) => topics.filter(topic => events.has(topic)).map(frame);
    const find = id => {
        const track = tracks.find(track => track.id === id);
        if (!track) throw new Error(`Unknown preview track: ${id}`);
        return track;
    };
    const page = (entries, number = 1) => ({
        entries: number === 1 ? entries : [], page: number, hasNext: false, total: entries.length,
    });
    const requirePlaylist = (id, expectedArchived = false) => {
        if (id !== playlist.id || archived !== expectedArchived) throw new Error('Preview playlist is unavailable.');
    };
    const libraryChanged = send => {
        revision++;
        emit('library.changed').forEach(send);
        return null;
    };
    const itemId = track => `track:${playlist.id}:${track.id}`;
    const movePlaylistItem = (from, to, send) => {
        if (from < 0 || !Number.isInteger(to) || to < 0 || to >= playlistTracks.length) {
            throw new Error('Invalid preview playlist item or position.');
        }
        const [track] = playlistTracks.splice(from, 1);
        playlistTracks.splice(to, 0, track);
        return libraryChanged(send);
    };
    const requireQueue = id => {
        if (id !== playback.queueId) throw new Error('Queue changed. Read it again.');
    };
    const selectQueueTrack = (index, status, position, send) => {
        current = queue[index];
        sequence++;
        Object.assign(playback, { title: current.title, artist: current.artist, duration: current.duration, status,
            position, queuePosition: index + 1, queueLength: queue.length });
        emit('playback.changed', 'playback.trackChanged', 'queue.changed').forEach(send);
    };
    const handlers = {
        ...previewRecordCommands(),
        'host.describe': () => ({
            protocol: 1, features: ['mv.session', 'pages.layout', 'pages.window', 'sources.catalog', 'commands.core', 'queue.references'], commands: Object.keys(handlers), events: Object.keys(eventData), maxQueueItems: 256, queueCapacity: 10_000,
        }),
        'sources.list': sourceList,
        'sources.search': request => fixturePage(request, false),
        'sources.browse': request => fixturePage(request, true),
        'commands.core.list': () => [{ pluginId: 'fixture.toolbox', commandId: 'echo', title: 'Echo input' }],
        'commands.core.invoke': ({ pluginId, commandId, input }) => {
            if (pluginId !== 'fixture.toolbox' || commandId !== 'echo') throw new Error('Unknown preview Core command.');
            return input ?? null;
        },
        'commands.list': () => contributions.commands.map(command => ({
            pluginId, commandId: command.id, title: command.title,
        })),
        'library.query': (input = {}) => {
            if (input.source === 'Legacy') return page([], input.page);
            const entries = ({
                Songs: tracks, Liked: tracks.filter(track => track.liked), Playlists: archived ? [] : [playlist],
                Albums: [{ ...playlist, kind: 'Album', id: 'demo-album' }], Artists: [], LikedAlbums: [],
            })[input.category ?? 'Songs'];
            if (!Array.isArray(entries)) throw new Error('Unknown preview catalog category');
            const query = (input.search ?? '').toLocaleLowerCase();
            return page(entries.filter(entry => `${entry.title} ${entry.subtitle}`.toLocaleLowerCase().includes(query)), input.page);
        },
        'library.track': ({ id }) => find(id),
        'library.playlistTracks': ({ id, page: number }) => page(id === playlist.id ? playlistTracks : [], number),
        'library.playlistItems': ({ id, page: number = 1, pageSize = 50 }) => {
            requirePlaylist(id);
            const page = Math.max(1, number);
            const size = Math.max(1, Math.min(pageSize, 100));
            const offset = (page - 1) * size;
            return {
                page, pageSize: size, total: playlistTracks.length, hasMore: offset + size < playlistTracks.length,
                items: playlistTracks.slice(offset, offset + size).map((track, index) => ({
                    id: itemId(track), playlistId: id, position: offset + index, unavailable: false,
                    title: track.title, artist,
                    track: {
                        id: track.id, title: track.title, artist, album: track.album, albumArtist: track.album_artist,
                        mediaType: 'local', durationSeconds: track.duration, unavailable: false,
                        trackNo: null, discNo: null, year: null, genre: null, codec: null,
                        sampleRate: null, bitDepth: null, bitrate: null, coverUrl: null,
                    },
                })),
            };
        },
        'library.removePlaylistItems': ({ id, itemIds }, send) => {
            requirePlaylist(id);
            const selected = new Set(itemIds);
            const removed = playlistTracks.map((track, position) => ({ track, position }))
                .filter(({ track }) => selected.has(itemId(track)));
            if (!removed.length || removed.length !== itemIds.length) throw new Error('Invalid preview playlist items.');
            for (const { position } of removed.slice().reverse()) playlistTracks.splice(position, 1);
            const recoveryId = String(nextRecovery++);
            removals.set(recoveryId, removed);
            libraryChanged(send);
            return { affectedCount: removed.length, recoveryId };
        },
        'library.setLiked': ({ id, liked }, send) => {
            find(id).liked = Boolean(liked);
            favoriteRevision++;
            emit('library.likedChanged').forEach(send);
            return libraryChanged(send);
        },
        'library.updatePlaylist': ({ id, title, description }, send) => {
            requirePlaylist(id);
            if (title === undefined && description === undefined) throw new Error('Specify a playlist title or description.');
            if (title !== undefined) playlist.title = title.trim();
            if (description !== undefined) playlist.subtitle = description.trim();
            return libraryChanged(send);
        },
        'library.movePlaylistTrack': ({ id, trackId, position }, send) => {
            requirePlaylist(id);
            const from = playlistTracks.findIndex(track => track.id === trackId);
            const target = Number.isInteger(position) ? position - 1 : -1;
            return movePlaylistItem(from, target, send);
        },
        'library.movePlaylistItem': ({ id, itemId: target, position }, send) => {
            requirePlaylist(id);
            return movePlaylistItem(playlistTracks.findIndex(track => itemId(track) === target), position, send);
        },
        'library.archivePlaylist': ({ id }, send) => {
            requirePlaylist(id);
            archived = true;
            return libraryChanged(send);
        },
        'library.playlistRecovery': ({ page: number = 1 } = {}) => {
            const entries = Array.from(removals, ([id, removed]) => ({
                id, kind: 'items', action: 'remove', title: playlist.title,
                count: removed.length, createdAt: '2026-01-01T00:00:00Z',
            }));
            if (archived) entries.unshift({
                id: playlist.id, kind: 'playlist', action: 'delete', title: playlist.title,
                count: playlistTracks.length, createdAt: '2026-01-01T00:00:00Z',
            });
            return page(entries, number);
        },
        'library.restorePlaylistRecovery': ({ id, kind }, send) => {
            if (kind === 'playlist') {
                requirePlaylist(id, true);
                archived = false;
            } else if (kind === 'items' && !archived && removals.has(id)) {
                for (const { track, position } of removals.get(id)) {
                    playlistTracks.splice(position, 0, track);
                }
                removals.delete(id);
            } else {
                throw new Error('Preview recovery record is unavailable.');
            }
            return libraryChanged(send);
        },
        'sleepTimer.getStatus': () => timer,
        'sleepTimer.start': ({ durationMinutes, action, fadeOut } = {}, send) => {
            if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 720 ||
                !['pause', 'stop', 'quit'].includes(action) || typeof fadeOut !== 'boolean') {
                throw new Error('invalid-payload');
            }
            timer = { isActive: true, remainingMs: durationMinutes * 60_000, durationMinutes, action, fadeOutEnabled: fadeOut };
            emit('sleepTimer.tick').forEach(send);
            return timer;
        },
        'sleepTimer.cancel': (_, send) => {
            const active = timer.isActive;
            timer = idleTimer;
            if (active) emit('sleepTimer.tick').forEach(send);
            return timer;
        },
        'playback.get': () => playback,
        'playback.getRate': () => playback.rate,
        'playback.setRate': ({ rate: speed }, send) => {
            if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error('Playback rate must be 0.5–2.');
            playback.rate = Math.round(speed * 100) / 100;
            emit('playback.changed').forEach(send);
            return playback.rate;
        },
        'playback.control': (change, send) => {
            const { action, enabled, mode, seconds, volume } = change;
            if (action === 'pause' || action === 'resume' || action === 'toggle' || action === 'stop') {
                playback.status = action === 'stop' ? 'stopped'
                    : (action === 'pause' || (action === 'toggle' && playback.status === 'playing')) ? 'paused' : 'playing';
            } else if ((action === 'seek' || action === 'seekBy') && Number.isFinite(seconds)) {
                playback.position = Math.min(playback.duration, Math.max(0, action === 'seekBy' ? playback.position + seconds : seconds));
            } else if (action === 'setVolume' && Number.isInteger(volume) && volume >= 0 && volume <= 100) {
                playback.volume = volume;
            } else if (action === 'setMode' && ['Sequential', 'Shuffle', 'RepeatOne', 'RepeatAll'].includes(mode)) {
                playback.mode = mode;
            } else if (action === 'toggleShuffle' || (action === 'setShuffle' && typeof enabled === 'boolean')) {
                const shuffle = playback.mode === 'Shuffle';
                playback.mode = (action === 'toggleShuffle' ? !shuffle : enabled) ? 'Shuffle'
                    : shuffle ? 'Sequential' : playback.mode;
            } else if (action === 'setRepeat' && ['off', 'one', 'all'].includes(mode)) {
                playback.mode = { off: playback.mode === 'Shuffle' ? 'Shuffle' : 'Sequential', one: 'RepeatOne', all: 'RepeatAll' }[mode];
            } else if (action === 'cycleRepeat') {
                playback.mode = { RepeatAll: 'RepeatOne', RepeatOne: 'Sequential' }[playback.mode] ?? 'RepeatAll';
            } else {
                throw new Error(`Offline preview cannot apply playback action ${action}.`);
            }
            emit('playback.changed').forEach(send);
            return null;
        },
        'playback.getCurrentTrack': currentTrack,
        'lyrics.get': () => ({ lines: [], trackOffsetMs: 0 }),
        'artwork.track': ({ id, source = 'Local' }) => {
            if (source !== 'Local') throw new Error('Unknown preview track.');
            return find(id) === tracks[0] ? previewCover : null;
        },
        'artwork.album': ({ id, source = 'Local' }) => source === 'Local' && id === 'demo-album' ? previewCover : null,
        'artwork.current': ({ sequence: expected }) => {
            if (expected !== undefined && expected !== sequence) throw new Error('track-changed');
            return !current.source && current.id === tracks[0].id ? previewCover : null;
        },
        'queue.get': ({ offset = 0, limit = 256, queueId } = {}) => {
            if (queueId !== undefined) requireQueue(queueId);
            if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 256)
                throw new Error('Invalid queue page.');
            offset = Math.min(offset, queue.length);
            return { queueId: playback.queueId, position: playback.queuePosition, offset,
                total: queue.length, hasNext: offset + limit < queue.length,
                items: queue.slice(offset, offset + limit).map(track => ({
                    title: track.title, artist: track.artist, occurrenceId: track.occurrenceId, reference: reference(track), catalog: track.source ? null : { source: 'Local', id: track.id },
                })) };
        },
        'queue.search': ({ query, source = 'Local', remoteId }) => {
            if (typeof query !== 'string' || Buffer.byteLength(query) > 1024) throw new Error('Invalid queue query.');
            query = query.trim().toLowerCase();
            if (!query || source !== 'Local' || remoteId) return [];
            return queue.flatMap((track, index) => [track.title, track.artist, track.album].some(value =>
                value.toLowerCase().includes(query)) ? [{ queueId: playback.queueId, index, title: track.title, artist: track.artist }] : []).slice(0, 16);
        },
        'queue.playItem': ({ queueId, occurrenceId }, send) => {
            requireQueue(queueId);
            const index = queue.findIndex(track => track.occurrenceId === occurrenceId);
            if (index < 0) throw new Error('Unknown queue occurrence.');
            selectQueueTrack(index, 'playing', 0, send);
            return null;
        },
        'queue.playAt': ({ queueId, index }, send) => {
            requireQueue(queueId);
            if (!Number.isInteger(index) || !queue[index]) throw new Error('Invalid queue index.');
            selectQueueTrack(index, 'playing', 0, send);
            return null;
        },
        'queue.saved.list': summaries,
        'queue.saved.save': ({ queueId }, send) => {
            requireQueue(queueId);
            if (!queue.length) throw new Error('Cannot save an empty queue.');
            const id = String(nextSnapshot++);
            savedQueues.set(id, { summary: { id, name: current.title + ' 等 ' + queue.length + ' 首', tracks: queue.length },
                items: [...queue], index: playback.queuePosition - 1, position: playback.position });
            if (savedQueues.size > 12) savedQueues.delete(summaries().at(-1).id);
            deletedSnapshot = null;
            emit('queue.saved.changed').forEach(send);
            return null;
        },
        'queue.saved.restore': ({ queueId, snapshotId }, send) => {
            requireQueue(queueId);
            const snapshot = savedQueues.get(snapshotId);
            if (!snapshot) throw new Error('Unknown queue snapshot.');
            queue = [...snapshot.items];
            playback.queueId++;
            const index = queue.indexOf(current);
            const keep = ['playing', 'paused'].includes(playback.status) && index >= 0;
            selectQueueTrack(keep ? index : snapshot.index, keep ? playback.status : 'stopped',
                keep ? playback.position : snapshot.position, send);
            return null;
        },
        'queue.saved.remove': ({ snapshotId }, send) => {
            if (typeof snapshotId !== 'string' || !/^\d+$/.test(snapshotId)) throw new Error('Invalid snapshot ID.');
            const record = savedQueues.get(snapshotId);
            if (!record) throw new Error('Unknown queue snapshot.');
            deletedSnapshot = record;
            savedQueues.delete(snapshotId);
            emit('queue.saved.changed').forEach(send);
            return null;
        },
        'queue.saved.undoRemove': ({ snapshotId }, send) => {
            if (!deletedSnapshot || deletedSnapshot.summary.id !== snapshotId) throw new Error('Cannot undo this removal.');
            savedQueues.set(snapshotId, deletedSnapshot);
            deletedSnapshot = null;
            emit('queue.saved.changed').forEach(send);
            return null;
        },
        'queue.submit': ({ mode, tracks: items, index = 0 }, send) => {
            if (!['play', 'append', 'playNext'].includes(mode) || !Array.isArray(items)
                || !items.length || items.length > 256) {
                throw new Error('Offline queue preview accepts example catalog tracks.');
            }
            const selected = items.map(item => {
                if (item.kind === 'catalog' && item.source === 'Local') return queueEntry(find(item.id));
                if (item.kind === 'source' && sourceList().some(s => s.plugin === item.source.plugin && s.provider === item.source.provider)
                    && item.track?.providerTrackId && item.track.title) {
                    return queueEntry({ ...item.track, album: item.track.album ?? '', artist: item.track.artist ?? '', source: item.source, id: item.track.providerTrackId, duration: item.track.duration ?? 0 });
                }
                throw new Error('Unknown queue item or source.');
            });
            if (mode === 'play') {
                if (!selected[index]) throw new Error('Preview queue index is out of range.');
                current = selected[index];
                sequence++;
                queue = selected;
                playback = {
                    ...playback, status: 'playing', title: current.title, artist: current.artist, duration: current.duration,
                    position: 0, queueId: playback.queueId + 1, queuePosition: index + 1, queueLength: queue.length,
                };
                emit('playback.changed', 'playback.trackChanged', 'queue.changed').forEach(send);
            } else {
                queue.splice(mode === 'playNext' ? playback.queuePosition : queue.length, 0, ...selected);
                playback.queueId++;
                playback.queueLength = queue.length;
                emit('playback.changed', 'queue.changed').forEach(send);
            }
            return null;
        },
    };
    return {
        ready(value) { contributions = value; },
        listen(names, send) {
            const next = new Set(names.filter(name => Object.hasOwn(eventData, name)));
            for (const name of next) {
                if (!events.has(name) && (name !== 'sleepTimer.tick' || timer.isActive)) send(frame(name));
            }
            events = next;
        },
        invoke(method, input, send) {
            if (!Object.hasOwn(handlers, method)) {
                throw new Error(`Offline preview does not provide ${method}. Use GPUI --workshop test.`);
            }
            return handlers[method](input, send);
        },
    };
}
