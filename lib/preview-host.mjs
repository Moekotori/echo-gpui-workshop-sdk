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
    let revision = 1;
    let playback = {
        status: 'paused', title: tracks[0].title, artist, position: 12, duration: tracks[0].duration,
        volume: 50, mode: 'Sequential', queueId: 1, queuePosition: 1, queueLength: 1,
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
                Songs: tracks, Liked: tracks.filter(track => track.liked), Playlists: [playlist],
                Albums: [], Artists: [], LikedAlbums: [],
            })[input.category ?? 'Songs'];
            if (!Array.isArray(entries)) throw new Error('Unknown preview catalog category');
            const query = (input.search ?? '').toLocaleLowerCase();
            return page(entries.filter(entry => `${entry.title} ${entry.subtitle}`.toLocaleLowerCase().includes(query)), input.page);
        },
        'library.track': ({ id }) => find(id),
        'library.playlistTracks': ({ id, page: number }) => page(id === playlist.id ? tracks : [], number),
        'library.setLiked': ({ id, liked }, send) => {
            find(id).liked = Boolean(liked);
            revision++;
            emit('library.changed').forEach(send);
            return null;
        },
        'playback.get': () => playback,
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
