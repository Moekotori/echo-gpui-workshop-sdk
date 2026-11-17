export function createPreviewHost(pluginId) {
    const artist = 'Echo Workshop';
    const tracks = [
        { id: 'demo-1', title: 'First Light', duration: 180, liked: true },
        { id: 'demo-2', title: 'Night Drive', duration: 240, liked: false },
    ].map(track => ({
        ...track, subtitle: artist, kind: 'Track', playable: true, count: 1,
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
    let playback = {
        status: 'paused', title: tracks[0].title, artist, position: 12, duration: tracks[0].duration,
        volume: 50, rate: 1, mode: 'Sequential', queueId: 1, queuePosition: 1, queueLength: 1,
    };
    let queue = [tracks[0]];
    let sequence = 1;
    let current = tracks[0];
    let contributions = { commands: [] };
    let events = new Set();
    const currentTrack = () => ({
        sequence, title: current.title, artist, catalog: { source: 'Local', id: current.id },
    });
    const eventData = {
        'library.changed': () => ({ source: 'Local', revision }),
        'library.likedChanged': () => ({ source: 'Local', revision: favoriteRevision }),
        'playback.changed': () => playback,
        'playback.trackChanged': currentTrack,
        'queue.changed': () => ({ queueId: playback.queueId, position: playback.queuePosition, total: queue.length }),
        'audio.analysis': () => null,
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
    const handlers = {
        'host.describe': () => ({
            protocol: 1, commands: Object.keys(handlers), events: Object.keys(eventData), maxQueueItems: 256, queueCapacity: 10_000,
        }),
        'commands.list': () => contributions.commands.map(command => ({
            pluginId, commandId: command.id, title: command.title,
        })),
        'library.query': (input = {}) => {
            if (input.source === 'Legacy') return page([], input.page);
            const entries = ({
                Songs: tracks, Liked: tracks.filter(track => track.liked), Playlists: archived ? [] : [playlist],
                Albums: [], Artists: [], LikedAlbums: [],
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
        'queue.get': ({ offset = 0 } = {}) => ({
            queueId: playback.queueId, position: playback.queuePosition, offset, total: queue.length, hasNext: false,
            items: queue.slice(offset).map(track => ({
                title: track.title, artist, catalog: { source: 'Local', id: track.id },
            })),
        }),
        'queue.submit': ({ mode, tracks: items, index = 0 }, send) => {
            if (!['play', 'append', 'playNext'].includes(mode) || !Array.isArray(items)
                || !items.length || items.some(item => item.kind !== 'catalog' || item.source !== 'Local')) {
                throw new Error('Offline queue preview accepts example catalog tracks.');
            }
            const selected = items.map(item => find(item.id));
            if (mode === 'play') {
                if (!selected[index]) throw new Error('Preview queue index is out of range.');
                current = selected[index];
                sequence++;
                queue = selected;
                playback = {
                    ...playback, status: 'playing', title: current.title, duration: current.duration,
                    position: 0, queueId: playback.queueId + 1, queuePosition: index + 1, queueLength: queue.length,
                };
                emit('playback.changed', 'playback.trackChanged', 'queue.changed').forEach(send);
            } else {
                queue.splice(mode === 'playNext' ? playback.queuePosition : queue.length, 0, ...selected);
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
                if (!events.has(name)) send(frame(name));
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
