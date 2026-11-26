import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { Console } from 'node:console';
import { AsyncLocalStorage } from 'node:async_hooks';
const sourceScope = new AsyncLocalStorage();

const [, , pluginEntry, pluginId, pluginTitle, pluginDataRoot] = process.argv;
const write = process.stdout.write.bind(process.stdout);
globalThis.console = new Console(process.stderr);
const send = (frame) => write(JSON.stringify(frame) + '\n');
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let nextId = 0;
let stopping = false;
let start;
const started = new Promise(resolve => { start = resolve; });
const pending = new Map();
const events = new Map();
const subscriptions = new Map();
const latestEvents = new Map();
let listening = '';
function syncEvents() {
    const names = new Set(subscriptions.keys());
    if (events.size > 0) names.add('playback.changed');
    const ordered = [...names].sort();
    const key = ordered.join(',');
    if (stopping || key === listening) return;
    listening = key;
    send({ type: 'listen', enabled: ordered.length > 0, events: ordered });
}

function coalescedEvents(listener) {
    let active = true;
    let running = false;
    const pendingEvents = new Map();
    const deliver = async (event, value) => {
        if (!active || stopping) return;
        const key = event === 'library.changed' ? event + ':' + value.source : event;
        pendingEvents.set(key, [event, value]);
        if (running) return;
        running = true;
        while (active && !stopping && pendingEvents.size > 0) {
            const [key, next] = pendingEvents.entries().next().value;
            pendingEvents.delete(key);
            try { await listener(...next); }
            catch (error) { console.error(error); }
        }
        running = false;
    };
    return { deliver, close() { active = false; pendingEvents.clear(); } };
}

function subscribe(event, listener) {
    if (typeof listener !== 'function') throw new TypeError('Expected an event callback');
    let handlers = subscriptions.get(event);
    if (!handlers) subscriptions.set(event, handlers = new Set());
    const delivery = coalescedEvents((_, value) => listener(value));
    const deliver = value => delivery.deliver(event, value);
    handlers.add(deliver);
    const initial = latestEvents.get(event);
    if (initial) {
        for (const value of initial.values()) queueMicrotask(() => void deliver(value));
    }
    syncEvents();
    return () => {
        delivery.close();
        handlers.delete(deliver);
        if (handlers.size === 0 && subscriptions.get(event) === handlers) {
            subscriptions.delete(event);
            latestEvents.delete(event);
        }
        syncEvents();
    };
}
const hostInvoke = (method, input) => {
    if (stopping) return Promise.reject(new Error('Plugin is stopping'));
    if (pending.size >= 32) return Promise.reject(new Error('Too many pending host calls'));
    return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        try { send({ type: 'host', id, method, input }); }
        catch (error) { pending.delete(id); reject(error); }
    });
};
const tagProviders = {
    metadata: new Map(),
    covers: new Map(),
};
function tagProviderApi(kind) {
    const providers = tagProviders[kind];
    return Object.freeze({
        registerProvider(id, options, handler) {
            if (!registrationOpen) throw new Error('Register contributions during activation');
            if (typeof options === 'function') {
                handler = options;
                options = undefined;
            }
            if (typeof id !== 'string' || !/^[a-z0-9_.-]{1,128}$/i.test(id)
                || typeof handler !== 'function' || providers.has(id) || providers.size >= 16) {
                throw new TypeError('Invalid or duplicate tag provider');
            }
            const provider = { id, title: String(options?.title ?? id).slice(0, 160), handler };
            providers.set(id, provider);
            return () => providers.delete(id);
        },
    });
}

async function queryTagProviders(input, signal) {
    const groups = await Promise.all(Object.entries(tagProviders).flatMap(([kind, providers]) =>
        Array.from(providers.values(), async ({ id, title, handler }) => {
            const timeout = new AbortController();
            const deadline = setTimeout(() => timeout.abort(new Error('Provider timed out')), 2500);
            const providerSignal = AbortSignal.any([signal, timeout.signal]);
            let abort;
            try {
                const result = await Promise.race([
                    Promise.resolve().then(() => {
                        providerSignal.throwIfAborted();
                        return handler({
                            track: structuredClone(input.track),
                            provider: { pluginId, providerId: id },
                            signal: providerSignal,
                        });
                    }),
                    new Promise((_, reject) => {
                        abort = () => reject(providerSignal.reason);
                        if (providerSignal.aborted) abort();
                        else providerSignal.addEventListener('abort', abort, { once: true });
                    }),
                ]);
                const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
                return candidates.slice(0, 12).filter(item => item && typeof item === 'object').map(item => {
                    const candidate = { kind, provider: title };
                    for (const key of ['title', 'artist', 'album', 'albumArtist', 'genre', 'source', 'description', 'imageUrl']) {
                        if (typeof item[key] === 'string') candidate[key] = item[key].slice(0, key === 'imageUrl' ? 4096 : 512);
                    }
                    for (const key of ['year', 'trackNo', 'discNo', 'bpm', 'confidence']) {
                        if (Number.isFinite(item[key])) candidate[key] = item[key];
                    }
                    return candidate;
                });
            } catch (error) {
                if (!signal.aborted) console.error(`Tag provider ${id}: ${errorText(error)}`);
                return [];
            } finally {
                clearTimeout(deadline);
                providerSignal.removeEventListener('abort', abort);
            }
        })
    ));
    return groups.flat().sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 24);
}
const pages = new Map();
const pageActions = new Map();
const commands = new Map();
const playerBarActions = new Map();
const playerBarLayouts = new Map();
const playerBarItems = new Set([
    'track', 'previous', 'playPause', 'next', 'seek', 'like', 'lyrics',
    'queue', 'volume', 'connect', 'spacer',
]);
const playerBarIcons = new Set(['listMusic', 'bookmark', 'heart', 'radio', 'clock', 'star']);
const trackMenuActions = new Map();
const sources = new Map();
const lyricsProviders = new Map();
const artistArtworkProviders = new Map();
const mvProviders = new Map();
const invocations = new Map();
let registrationOpen = true;

function register(registry, id, options, callbacks) {
    const title = options?.title ?? id;
    if (!registrationOpen) throw new Error('Register contributions during activate');
    if (typeof id !== 'string' || !/^[a-z0-9_.-]{1,128}$/i.test(id) || registry.has(id)
        || typeof title !== 'string' || !title.trim()
        || Object.values(callbacks).some(callback => typeof callback !== 'function')) {
        throw new TypeError('Invalid or duplicate contribution');
    }
    registry.set(id, { title, ...callbacks });
}

function descriptors(registry) {
    return Array.from(registry, ([id, { title }]) => ({ id, title }));
}

function registerSurfaceAction(registry, id, options, run) {
    if (registry.size >= 16 || typeof options?.title !== 'string'
        || Buffer.byteLength(options.title) > 512) throw new TypeError('Invalid surface action');
    register(registry, id, options, { run });
    registry.get(id).localOnly = options.localOnly === true;
}

function surfaceDescriptors(registry) {
    return Array.from(registry, ([commandId, { title, localOnly, layoutOnly, icon }]) =>
        ({ commandId, title, localOnly, layoutOnly, icon }));
}

function registerPlayerBarAction(id, options, run) {
    const { icon, layoutOnly } = options ?? {};
    if ((icon !== undefined && !playerBarIcons.has(icon))
        || (layoutOnly !== undefined && typeof layoutOnly !== 'boolean')) {
        throw new TypeError('Invalid player bar action options');
    }
    registerSurfaceAction(playerBarActions, id, options, run);
    Object.assign(playerBarActions.get(id), { icon, layoutOnly });
}

function registerPlayerBarLayout(id, options) {
    const { title, items } = options ?? {};
    if (playerBarLayouts.size >= 4 || typeof title !== 'string' || Buffer.byteLength(title) > 128
        || !Array.isArray(items) || items.length > 12) {
        throw new TypeError('Invalid player bar layout');
    }
    const keys = new Set();
    const normalized = Array.from(items, item => {
        const type = item?.type;
        const action = type === 'action';
        if ((!action && !playerBarItems.has(type))
            || (action && (typeof item.id !== 'string' || !/^[a-z0-9_.-]{1,128}$/i.test(item.id)))
            || Object.keys(item).some(key => key !== 'type' && !(action && key === 'id'))) {
            throw new TypeError('Invalid player bar item');
        }
        const key = action ? 'action:' + item.id : type;
        if (keys.has(key)) throw new TypeError('Duplicate player bar item');
        keys.add(key);
        return action ? { type, id: item.id } : { type };
    });
    if (!keys.has('playPause')) throw new TypeError('Player bar layouts require playPause');
    register(playerBarLayouts, id, { title }, {});
    playerBarLayouts.get(id).items = normalized;
}

async function runSurfaceAction({ id, track }, signal) {
    const action = (track ? trackMenuActions : playerBarActions).get(id);
    if (!action) throw new Error('Surface action does not exist');
    const selected = track ?? await hostInvoke('playback.getCurrentTrack');
    signal.throwIfAborted();
    const result = await action.run({ track: selected, signal });
    if (result == null) return {};
    const { page, notice } = result;
    if (typeof result !== 'object' || Array.isArray(result)
        || (page !== undefined && !pages.has(page))
        || (notice !== undefined && (typeof notice !== 'string' || Buffer.byteLength(notice) > 512))) {
        throw new TypeError('Invalid surface action result');
    }
    return { page, notice };
}

async function readCatalog(method, source, { page = 1, pageSize = 24, query, collectionId }) {
    if (!Number.isInteger(page) || page < 1 || page > 4294967295 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 24)
        throw new Error('Invalid source page');
    if (method === 'search' && (typeof query !== 'string' || Buffer.byteLength(query) > 1024))
        throw new Error('Invalid source query');
    if (collectionId != null && (typeof collectionId !== 'string' || !collectionId.trim() || Buffer.byteLength(collectionId) > 512))
        throw new Error('Invalid source collection ID');
    const input = { page, pageSize, ...(method === 'search' ? { query } : { collectionId }) };
    if (source.plugin !== pluginId) return hostInvoke('sources.' + method, { source, ...input });
    const handler = sources.get(source.provider)?.[method];
    if (!handler) throw new Error('Source does not support this operation');
    const timeout = AbortSignal.timeout(12000);
    const parent = sourceScope.getStore();
    const signal = parent ? AbortSignal.any([parent, timeout]) : timeout;
    const result = await handler({ ...input, signal });
    signal.throwIfAborted();
    const { tracks, collections = [], hasMore = false } = result;
    if (!Array.isArray(tracks) || !Array.isArray(collections) || tracks.length + collections.length > pageSize)
        throw new Error('Invalid source page');
    return { tracks, collections, hasMore };
}

async function invokeContribution(method, input, signal, handle, progress) {
    switch (method) {
        case 'contribution.page': {
            const page = pages.get(input.id);
            if (!page) throw new Error('Plugin page does not exist');
            return page.open({ signal, windowId: page.window ? input.id : null,
                lyricsView: page.placement === 'lyrics-view' ? input.lyricsView ?? null : null });
        }
        case 'contribution.search':
        case 'contribution.browse':
        case 'contribution.resolve': {
            const provider = sources.get(input.id);
            if (!provider) throw new Error('Search source does not exist');
            const { id, ...request } = input;
            const fn = provider[method.slice('contribution.'.length)];
            if (!fn) throw new Error('Source does not support this operation');
            return fn({ ...request, signal });
        }
        case 'contribution.command': {
            const command = commands.get(input.id);
            if (!command) throw new Error('Plugin command does not exist');
            return command.run(input.input, { callerPluginId: input.callerPluginId, signal });
        }
        case 'contribution.surfaceAction': return runSurfaceAction(input, signal);
        case 'provider.mv': return dispatchMv(mvProviders, input, signal);
        case 'tags.lookup': return queryTagProviders(input, signal);
        case 'artistArtwork.lookup': {
            const provider = artistArtworkProviders.get(input.id);
            if (!provider) throw new Error('Artist artwork provider does not exist');
            const candidate = await provider.lookup({ artist: input.artist, signal });
            signal.throwIfAborted();
            if (candidate == null) return null;
            const { artistName, imageUrl, dataUrl } = candidate;
            const validImage = dataUrl == null && typeof imageUrl === 'string'
                && imageUrl.startsWith('https://') && Buffer.byteLength(imageUrl) <= 4096;
            const validData = imageUrl == null && typeof dataUrl === 'string'
                && /^data:image\/(png|jpeg);base64,/.test(dataUrl)
                && dataUrl.length <= Math.ceil(256 * 1024 / 3) * 4 + 'data:image/jpeg;base64,'.length;
            if (typeof artistName !== 'string' || !artistName.trim() || Buffer.byteLength(artistName) > 4096
                || !(validImage || validData)) {
                throw new TypeError('Invalid artist artwork candidate');
            }
            return { artistName, imageUrl, dataUrl };
        }
        case 'lyrics.lookup': {
            const provider = lyricsProviders.get(input.id);
            if (!provider) throw new Error('Lyrics provider does not exist');
            const exact = input.exact === true;
            return provider.lookup(input.track, signal, { timeoutMs: 6000, collectAllCandidates: !input.automatic, exact });
        }
        case 'lyrics.match': return matchOriginalLyrics(input.track, signal, progress);
        default:
            if (method.startsWith('page.action.')) {
                const action = pageActions.get(method.slice('page.action.'.length));
                if (action) return action.run({ fields: input?.fields ?? {}, data: input?.data ?? null,
                    windowId: input?.windowId ?? null, lyricsView: input?.lyricsView ?? null, signal });
            }
            if (handle) return handle({ method, input, signal }, context);
            if (method === 'page.open') return { title: pluginTitle ?? pluginId };
            throw new Error('Plugin action does not exist');
    }
}

function sourceCollectionActions() {
    return {
        playCollection: (providerId, collectionId, options = {}) => hostInvoke('sources.playCollection', {
            providerId, collectionId, startTrackId: options.startTrackId,
        }),
        cancelCollection: () => hostInvoke('sources.cancelCollection', {}),
        collectionStatus: () => hostInvoke('sources.collectionStatus', {}),
    };
}

const context = Object.freeze({
    contentRoot: process.cwd(),
    dataRoot: pluginDataRoot ?? process.cwd(),
    pluginId,
    hostInvoke,
    storage: Object.freeze({
        ...pluginStorage(true, pluginDataRoot, 'storage.json'),
        ...bucketStorage('.', 'storage'),
    }),
    credentials: Object.freeze({
        get: key => hostInvoke('credentials.get', { key }),
        set: (key, value) => hostInvoke('credentials.set', { key, value }),
        remove: key => hostInvoke('credentials.remove', { key }),
    }),
    network: Object.freeze({
        request: (url, options = {}) => hostInvoke('network.request', { ...options, url }),
    }),
    lyrics: Object.freeze({
        registerProvider(id, options, handler) {
            if (typeof handler !== 'function') throw new TypeError('Expected a lyrics lookup callback');
            register(lyricsProviders, id, options, {
                async lookup(track, signal, lookup) {
                    const rows = await handler({ track, signal, automatic: !lookup.collectAllCandidates, exact: lookup.exact === true });
                    signal.throwIfAborted();
                    return normalizeProviderLyrics(rows, options?.title ?? id, pluginId + ':' + id);
                },
            });
        },
        get: trackId => hostInvoke('lyrics.readTrack', { trackId }),
        getCurrent: (expected = {}) => hostInvoke('lyrics.getCurrent', expected),
        matchAmll: sequence => hostInvoke('lyrics.matchAmll', { sequence }),
        onChanged: listener => subscribe('lyrics.changed', listener),
        fillMissing: (trackId, lyrics) => hostInvoke('lyrics.fillMissing', { trackId, lyrics }),
        applyCustom: (trackId, text, format = 'lrc') => hostInvoke('lyrics.applyCustom', { trackId, text, format }),
        setOffset: (trackId, offsetMs) => hostInvoke('lyrics.setOffset', { trackId, offsetMs }),
        setCurrentOffset: offsetMs => hostInvoke('lyrics.setCurrentOffset', { offsetMs }),
        markInstrumental: trackId => hostInvoke('lyrics.markInstrumental', { trackId }),
        clearOverride: trackId => hostInvoke('lyrics.clearOverride', { trackId }),
    }),
    sleepTimer: Object.freeze({
        getStatus: () => hostInvoke('sleepTimer.getStatus'),
        start: input => hostInvoke('sleepTimer.start', input),
        cancel: () => hostInvoke('sleepTimer.cancel'),
        onTick: listener => subscribe('sleepTimer.tick', listener),
    }),
    library: Object.freeze({
        enrichment: Object.freeze({
            scan: (after = null) => hostInvoke('library.enrichment.scan', { after }),
            fillTags: (trackId, change) => hostInvoke('library.enrichment.fillTags', { ...change, trackId }),
        }),
        onChanged: listener => subscribe('library.changed', listener),
        onFavoritesChanged: listener => subscribe('library.likedChanged', listener),
        query: (options = {}) => hostInvoke('library.query', options),
        track: (id, source = 'Local') => hostInvoke('library.track', { id, source }),
        summary: () => hostInvoke('library.summary'),
        album: id => hostInvoke('library.album', { id }),
        albumForTrack: id => hostInvoke('library.albumForTrack', { id }),
        relatedAlbums: (id, source = 'Local') => hostInvoke('library.relatedAlbums', { id, source }),
        albumVersions: (id, source = 'Local') => hostInvoke('library.albumVersions', { id, source }),
        similarLocalTracks: id => hostInvoke('library.similarLocalTracks', { id }),
        artist: id => hostInvoke('library.artist', { id }),
        artistByName: (name, source = 'Local') => hostInvoke('library.artistByName', { name, source }),
        artistCredits: (name, source = 'Local') => hostInvoke('library.artistCredits', { name, source }),
        albumCredits: (id, source = 'Local') => hostInvoke('library.albumCredits', { id, source }),
        trackArtistCredits: id => hostInvoke('library.trackArtistCredits', { id }),
        albumFavoriteStates: ids => hostInvoke('library.albumFavoriteStates', { ids }),
        searchTracks: (rules, page = {}) => hostInvoke('library.searchTracks', { ...page, rules }),
        tracksByIds: ids => hostInvoke('library.tracksByIds', { ids }),
        trackSkipStats: id => hostInvoke('library.trackSkipStats', { id }),
        trackVersions: (id, source = 'Local') => hostInvoke('library.trackVersions', { id, source }),
        editTrackVersions: (id, revision, edit) => hostInvoke('library.editTrackVersions', { id, revision, edit }),
        linkedTracks: (id, source = 'Local') => hostInvoke('library.linkedTracks', { id, source }),
        albums: (options = {}) => hostInvoke('library.query', { ...options, category: 'Albums' }),
        albumTracks: (id, options = {}) => hostInvoke('library.albumTracks', { ...options, id }),
        artists: (options = {}) => hostInvoke('library.query', { ...options, category: 'Artists' }),
        artistTracks: (id, options = {}) => hostInvoke('library.artistTracks', { ...options, id }),
        artistAlbums: (id, options = {}) => hostInvoke('library.artistAlbums', { ...options, id }),
        albumDetails: (id, source = 'Local') => hostInvoke('library.albumDetails', { id, source }),
        artistDetails: (id, source = 'Local') => hostInvoke('library.artistDetails', { id, source }),
        genres: (options = {}) => hostInvoke('library.genres', options),
        genreAlbums: (id, options = {}) => hostInvoke('library.genreAlbums', { ...options, id }),
        genreTracks: (id, options = {}) => hostInvoke('library.genreTracks', { ...options, id }),
        facets: (facet, source = 'Local') => hostInvoke('library.facets', { facet, source }),
        likedTracks: (options = {}) => hostInvoke('library.query', { ...options, category: 'Liked' }),
        likedAlbums: (options = {}) => hostInvoke('library.query', { ...options, category: 'LikedAlbums' }),
        playlists: (options = {}) => hostInvoke('library.query', { ...options, category: 'Playlists' }),
        playlistTracks: (id, options = {}) => hostInvoke('library.playlistTracks', { ...options, id }),
        playlistItems: (id, options = {}) => hostInvoke('library.playlistItems', { ...options, id }),
        playlistSummary: id => hostInvoke('library.playlistSummary', { id }),
        playlistSummaries: (options = {}) => hostInvoke('library.playlistSummaries', options),
        createPlaylistWithDetails: details => hostInvoke('library.createPlaylistWithDetails', details),
        prependPlaylistTracks: (id, trackIds) => hostInvoke('library.prependPlaylistTracks', { id, trackIds }),
        removePlaylistItems: (id, itemIds) => hostInvoke('library.removePlaylistItems', { id, itemIds }),
        playPlaylist: (id, options = {}) => hostInvoke('library.playPlaylist', { ...options, id }),
        queuePlaylist: (id, options = {}) => hostInvoke('library.queuePlaylist', { ...options, id }),
        createPlaylist: (title, tracks = []) => hostInvoke('library.createPlaylist', { title, tracks }),
        renamePlaylist: (id, title) => hostInvoke('library.renamePlaylist', { id, title }),
        updatePlaylist: (id, change) => hostInvoke('library.updatePlaylist', { ...change, id }),
        movePlaylistTrack: (id, trackId, position) => hostInvoke('library.movePlaylistTrack', { id, trackId, position }),
        movePlaylistItem: (id, itemId, position) => hostInvoke('library.movePlaylistItem', { id, itemId, position }),
        archivePlaylist: id => hostInvoke('library.archivePlaylist', { id }),
        playlistRecovery: (page = 1) => hostInvoke('library.playlistRecovery', { page }),
        restorePlaylistRecovery: ({ kind, id }) => hostInvoke('library.restorePlaylistRecovery', { kind, id }),
        setPlaylistTracks: (id, tracks, present) => hostInvoke('library.setPlaylistTracks', { id, tracks, present }),
        setLiked: (id, liked) => hostInvoke('library.setLiked', { id, liked }),
        toggleTrackLiked: id => hostInvoke('library.toggleTrackLiked', { id }),
        toggleAlbumLiked: id => hostInvoke('library.toggleAlbumLiked', { id }),
        moveLikedTrack: (id, position) => hostInvoke('library.moveLikedTrack', { id, position }),
        setTracksLiked: (ids, liked) => hostInvoke('library.setTracksLiked', { ids, liked }),
        trackFavoriteStates: ids => hostInvoke('library.trackFavoriteStates', { ids }),
        setArtistFavorite: (id, favorite) => hostInvoke('library.setArtistFavorite', { id, favorite }),
        setAlbumLiked: (id, liked, source = 'Local') => hostInvoke('library.setAlbumLiked', { id, liked, source }),
        tags: Object.freeze({
            list: (options = {}) => hostInvoke('library.tags.list', options),
            items: (id, kind, page = 1) => hostInvoke('library.tags.items', { id, kind, page }),
            mixedItems: (id, page = 1) => hostInvoke('library.tags.mixedItems', { id, page }),
            change: change => hostInvoke('library.tags.change', change),
        }),
        smart: Object.freeze({
            rules: (id, source = 'Local') => hostInvoke('library.smart.rules', { id, source }),
            preview: (rules, page = 1) => hostInvoke('library.smart.preview', { rules, page }),
            previewSummary: rules => hostInvoke('library.smart.previewSummary', { rules }),
            create: (title, rules) => hostInvoke('library.smart.save', { title, rules }),
            update: (id, title, rules) => hostInvoke('library.smart.save', { id, title, rules }),
            freeze: (id, options = {}) => hostInvoke('library.smart.freeze', { ...options, id }),
        }),
    }),
    artwork: Object.freeze({
        previewUrl: url => hostInvoke('artwork.previewUrl', { url }),
        track: (id, source = 'Local') => hostInvoke('artwork.track', { id, source }),
        album: (id, source = 'Local') => hostInvoke('artwork.album', { id, source }),
        artist: (id, source = 'Local') => hostInvoke('artwork.artist', { id, source }),
        onArtistChanged: listener => subscribe('artwork.artistChanged', listener),
        registerArtistProvider: (id, options, lookup) => register(artistArtworkProviders, id, options, { lookup }),
        current: sequence => hostInvoke('artwork.current', { sequence }),
        getPalette: sequence => hostInvoke('artwork.getPalette', { sequence }),
    }),
    history: Object.freeze({
        list: (options = {}) => hostInvoke('history.list', options),
        review: (options = {}) => hostInvoke('history.review', options),
    }),
    playback: Object.freeze({
        bookmarks: Object.freeze({
            list: (id, source = 'Local') => hostInvoke('playback.bookmarks.list', { id, source }),
            add: sequence => hostInvoke('playback.bookmarks.edit', { action: 'add', sequence }),
            jump: (sequence, bookmarkId) => hostInvoke('playback.bookmarks.edit', { action: 'jump', sequence, bookmarkId }),
            rename: (track, bookmarkId, label) => hostInvoke('playback.bookmarks.edit', { action: 'rename', track, bookmarkId, label }),
            remove: (track, bookmarkId) => hostInvoke('playback.bookmarks.edit', { action: 'remove', track, bookmarkId }),
        }),
        savedSegments: Object.freeze({
            list: (options = {}) => hostInvoke('playback.savedSegments.list', options),
            edit: edit => hostInvoke('playback.savedSegments.edit', edit),
            play: id => hostInvoke('playback.savedSegments.play', { id }),
        }),
        onChanged: listener => subscribe('playback.changed', listener),
        onTrackChanged: listener => subscribe('playback.trackChanged', listener),
        onClock: listener => subscribe('playback.clock', listener),
        get: () => hostInvoke('playback.get'),
        getClock: () => hostInvoke('playback.getClock'),
        getMusicMetadata: sequence => hostInvoke('playback.getMusicMetadata', { sequence }),
        getCurrentTrack: () => hostInvoke('playback.getCurrentTrack'),
        getRate: () => hostInvoke('playback.getRate'),
        getSpeed: () => hostInvoke('playback.getSpeed'),
        setSpeed: (rate, mode) => hostInvoke('playback.setSpeed', { rate, mode }),
        getSegmentLoop: () => hostInvoke('playback.getSegmentLoop'),
        editSegmentLoop: (trackInstance, edit) => hostInvoke('playback.editSegmentLoop', { trackInstance, edit }),
        setRate: rate => hostInvoke('playback.setRate', { rate }),
        control: command => hostInvoke('playback.control', command),
        setMode: mode => hostInvoke('playback.control', { action: 'setMode', mode }),
        seekBy: seconds => hostInvoke('playback.control', { action: 'seekBy', seconds }),
        setShuffle: enabled => hostInvoke('playback.control', { action: 'setShuffle', enabled }),
        toggleShuffle: () => hostInvoke('playback.control', { action: 'toggleShuffle' }),
        setRepeat: mode => hostInvoke('playback.control', { action: 'setRepeat', mode }),
        cycleRepeat: () => hostInvoke('playback.control', { action: 'cycleRepeat' }),
        getLyrics: () => hostInvoke('lyrics.get'),
    }),
    audio: Object.freeze({
        canvas: Object.freeze({
            start: options => hostInvoke('audio.canvas.start', options),
            status: id => hostInvoke('audio.canvas.status', { id }),
            release: id => hostInvoke('audio.canvas.release', { id }),
        }),
        visualization: Object.freeze({
            open: (options = {}) => hostInvoke('audio.visualization.open', options),
            read: id => hostInvoke('audio.visualization.read', { id }),
            close: id => hostInvoke('audio.visualization.close', { id }),
        }),
        getSignalPath: () => hostInvoke('audio.getSignalPath'),
        onSignalPathChanged: listener => subscribe('audio.signalPathChanged', listener),
        onAnalysis: listener => subscribe('audio.analysis', listener),
        getAnalysis: () => hostInvoke('audio.getAnalysis'),
        dsp: Object.freeze({
            getGraph: () => hostInvoke('audio.dsp.getGraph'),
            applyGraph: graph => hostInvoke('audio.dsp.applyGraph', graph),
            getRackOrder: () => hostInvoke('audio.dsp.getRackOrder'),
            setRackOrder: order => hostInvoke('audio.dsp.setRackOrder', { order }),
        }),
        output: Object.freeze({
            getStatus: () => hostInvoke('audio.output.getStatus'),
            listDevices: () => hostInvoke('audio.output.listDevices'),
            setOutput: change => hostInvoke('audio.output.setOutput', change),
        }),
    }),
    queue: Object.freeze({
        onChanged: listener => subscribe('queue.changed', listener),
        get: (options = {}) => hostInvoke('queue.get', options),
        search: (query, options = {}) => hostInvoke('queue.search', { ...options, query }),
        playAt: (queueId, index) => hostInvoke('queue.playAt', { queueId, index }),
        saved: Object.freeze({
            onChanged: listener => subscribe('queue.saved.changed', listener),
            list: () => hostInvoke('queue.saved.list', {}),
            save: queueId => hostInvoke('queue.saved.save', { queueId }),
            restore: (queueId, snapshotId) => hostInvoke('queue.saved.restore', { queueId, snapshotId }),
            remove: snapshotId => hostInvoke('queue.saved.remove', { snapshotId }),
            undoRemove: snapshotId => hostInvoke('queue.saved.undoRemove', { snapshotId }),
        }),
        playItem: (queueId, occurrenceId) => hostInvoke('queue.playItem', { queueId, occurrenceId }),
        edit: (queueId, edit) => hostInvoke('queue.edit', { queueId, edit }),
        submit: request => hostInvoke('queue.submit', request),
    }),
    commands: Object.freeze({
        register(id, options, run) { register(commands, id, options, { run }); },
        core: Object.freeze({
            list() { return hostInvoke('commands.core.list'); },
            invoke(pluginId, commandId, input) { return hostInvoke('commands.core.invoke', { pluginId, commandId, input }); },
        }),
        list() { return hostInvoke('commands.list'); },
        invoke(pluginId, commandId, input) { return hostInvoke('commands.invoke', { pluginId, commandId, input }); },
    }),
    actions: Object.freeze({
        registerPlayerBar: registerPlayerBarAction,
        registerTrackMenu: (id, options, run) => registerSurfaceAction(trackMenuActions, id, options, run),
    }),
    playerBar: Object.freeze({
        registerLayout: registerPlayerBarLayout,
    }),
    pages: Object.freeze({
        register(id, options, open) {
            const presentation = options?.presentation;
            if (presentation !== undefined && (presentation !== 'lyrics-view' || options.window !== undefined)) {
                throw new TypeError('Lyrics pages cannot open in an independent window');
            }
            let window;
            if (options?.window !== undefined) {
                const spec = options.window;
                if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new TypeError('Invalid page window options');
                const { width = 720, height = 520 } = spec;
                if (!Number.isInteger(width) || width < 240 || width > 1920 ||
                    !Number.isInteger(height) || height < 160 || height > 1200 ||
                    Array.from(pages.values()).filter(page => page.window).length >= 16) {
                    throw new RangeError('Expected at most 16 page windows, each 240–1920 × 160–1200');
                }
                window = { width, height };
            }
            register(pages, id, options, { open });
            if (window) pages.get(id).window = window;
            if (presentation) {
                const permissions = options.permissions ?? [];
                if (!Array.isArray(permissions) || permissions.length > 5 ||
                    permissions.some(value => !['clipboard:write','window:fullscreen','audio:dsp-ui','lyrics:import','ui:system-fonts'].includes(value))) {
                    throw new TypeError('Invalid native lyrics page permissions');
                }
                Object.assign(pages.get(id), { placement: presentation,
                    lyrics_permissions: [...new Set(permissions)], lyrics_transparent: options.transparent === true });
            }
        },
        registerAction(id, run) {
            register(pageActions, id, undefined, { run });
            return 'page.action.' + id;
        },
        invalidate(page) {
            if (page !== undefined && !pages.has(page)) throw new Error('Unknown page to invalidate');
            if (!stopping) send({ type: 'invalidate-page', page });
        },
    }),
    mv: Object.freeze({
        registerSessionProvider: registerMvSession,
        registerProvider(id, descriptor, handlers) {
            if (mvProviders.size >= 16) throw new Error('Too many MV providers');
            const callbacks = { search: handlers?.search, resolve: handlers?.resolve };
            if (handlers?.match !== undefined) callbacks.match = handlers.match;
            register(mvProviders, id, descriptor, callbacks);
        },
    }),
    sources: Object.freeze({
        ...sourceCollectionActions(),
        list: () => hostInvoke('sources.list', {}),
        search: (source, query, options = {}) => readCatalog('search', source, { ...options, query }),
        browse: (source, collectionId = null, options = {}) => readCatalog('browse', source, { ...options, collectionId }),
        registerProvider(id, options, handlers) {
            const callbacks = { search: handlers?.search, resolve: handlers?.resolve };
            if (handlers?.browse !== undefined) callbacks.browse = handlers.browse;
            if (options?.placement === 'playlists' && !callbacks.browse) throw new Error('Playlist sources require browse');
            register(sources, id, options, callbacks);
            sources.get(id).placement = options?.placement === 'playlists' ? 'playlists' : undefined;
        },
    }),
    metadata: tagProviderApi('metadata'),
    covers: tagProviderApi('covers'),
    onEvent(listener) {
        if (typeof listener !== 'function') throw new TypeError('Expected an event callback');
        const delivery = events.get(listener) ?? coalescedEvents(listener);
        events.set(listener, delivery);
        syncEvents();
        return () => {
            delivery.close();
            if (events.get(listener) === delivery) events.delete(listener);
            syncEvents();
        };
    },
});
const errorText = (error) => String(error?.message ?? error).slice(0, 1000);
const runtime = started.then(async (original) => {
    if (original) return startOriginal(original);
    const module = await import(pathToFileURL(pluginEntry).href);
    const handle = module.handle ?? module.default;
    if (handle !== undefined && typeof handle !== 'function') throw new Error('Invalid plugin handler');
    await module.activate?.(context);
    registrationOpen = false;
    for (const { items } of playerBarLayouts.values()) {
        for (const item of items) {
            if (item.type !== 'action') continue;
            const action = playerBarActions.get(item.id);
            if (!action || action.localOnly) throw new TypeError('Unknown player bar action: ' + item.id);
        }
    }
    return { handle, dispose: module.dispose };
});
runtime.then(({ player_bar_actions, track_context_menus }) => send({
    type: 'ready',
    contributions: {
        playerBarActions: player_bar_actions ?? surfaceDescriptors(playerBarActions),
        playerBarLayouts: Array.from(playerBarLayouts, ([id, layout]) => ({ id, ...layout })),
        trackContextMenus: track_context_menus ?? surfaceDescriptors(trackMenuActions),
        pages: Array.from(pages, ([id, { title, window, placement, lyrics_permissions, lyrics_transparent }]) =>
            ({ id, title, window, placement, lyrics_permissions, lyrics_transparent })),
        commands: descriptors(commands),
        sources: Array.from(sources, ([id, provider]) => ({ id, title: provider.title, browse: !!provider.browse, placement: provider.placement })),
        lyrics: descriptors(lyricsProviders),
        artistArtwork: descriptors(artistArtworkProviders),
        mv: Array.from(mvProviders, ([id, p]) => ({id, title:p.title, session:p.session === true})),
        metadata: descriptors(tagProviders.metadata),
        covers: descriptors(tagProviders.covers),
    },
}), error => {
    console.error(error);
    send({ type: 'failed', error: errorText(error) });
});

lines.on('line', async (line) => {
    const frame = JSON.parse(line);
    if (frame.type === 'shutdown') {
        if (stopping) return;
        stopping = true;
        resetMvSession();
        for (const p of mvProviders.values()) p.closeStream?.();
        events.clear();
        subscriptions.clear();
        latestEvents.clear();
        for (const controller of invocations.values()) controller.abort();
        for (const callback of pending.values()) callback.reject(new Error('Plugin is stopping'));
        pending.clear();
        try {
            const { dispose } = await runtime;
            await dispose?.(context);
        } catch (error) {
            console.error(error);
        } finally {
            write(JSON.stringify({ type: 'stopped' }) + '\n', () => process.exit(0));
        }
        return;
    }
    if (stopping) return;
    if (frame.type === 'start') {
        start(frame.original);
        return;
    }
    if (frame.type === 'event') {
        const handlers = subscriptions.get(frame.event);
        if (handlers) {
            let latest = latestEvents.get(frame.event);
            if (!latest) latestEvents.set(frame.event, latest = new Map());
            latest.set(frame.event === 'library.changed' ? frame.value.source : frame.event, frame.value);
            for (const listener of handlers) queueMicrotask(() => void listener(frame.value));
        }
        for (const delivery of events.values()) {
            queueMicrotask(() => void delivery.deliver(frame.event, frame.value));
        }
        return;
    }
    if (frame.type === 'host-result') {
        const callback = pending.get(frame.id);
        if (!callback) return;
        pending.delete(frame.id);
        if (frame.error === undefined) callback.resolve(frame.value);
        else callback.reject(new Error(frame.error));
        return;
    }
    if (frame.type === 'cancel') {
        const controller = invocations.get(frame.id);
        if (controller) controller.abort();
        else send({ type: 'cancelled', id: frame.id });
        return;
    }
    if (frame.type !== 'invoke') return;
    if (invocations.size >= 4) {
        send({ type: 'rejected', id: frame.id, error: 'Plugin is still handling cancelled requests' });
        return;
    }
    const controller = new AbortController();
    invocations.set(frame.id, controller);
    try {
        const { handle } = await runtime;
        controller.signal.throwIfAborted();
        const progress = value => {
            if (stopping || controller.signal.aborted) return;
            const message = JSON.stringify({ type: 'progress', id: frame.id, value });
            if (Buffer.byteLength(message) < 1024 * 1024) write(message + '\n');
        };
        const value = await sourceScope.run(controller.signal, () => invokeContribution(frame.method, frame.input, controller.signal, handle, progress));
        if (!stopping && !controller.signal.aborted) send({ type: 'result', id: frame.id, value: value ?? null });
    } catch (error) {
        if (!stopping && !controller.signal.aborted) {
            console.error(error);
            send({ type: 'rejected', id: frame.id, error: errorText(error) });
        }
    } finally {
        invocations.delete(frame.id);
        if (!stopping && controller.signal.aborted) send({ type: 'cancelled', id: frame.id });
    }
});
lines.on('close', () => process.exit(0));


import { open, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const pluginStorageLimit = 512 * 1024;

function pluginStorage(granted, root, filename) {
    const file = join(root, filename);
    let entries;
    let pending = Promise.resolve();
    let pendingCount = 0;
    function enqueue(key, operation) {
        if (!granted) return Promise.reject(new Error('plugin_permission_denied:fs:plugin'));
        if (typeof key !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(key)) {
            return Promise.reject(new Error('invalid-payload'));
        }
        if (pendingCount >= 32) return Promise.reject(new Error('storage-busy'));
        pendingCount++;
        const result = pending.then(async () => {
            entries ??= await loadPluginStorage(file);
            return operation(entries);
        }).finally(() => { pendingCount--; });
        pending = result.catch(() => {});
        return result;
    }
    async function persist(updated) {
        const data = JSON.stringify(updated);
        if (Buffer.byteLength(data) > pluginStorageLimit) throw new Error('storage-quota-exceeded');
        const temporary = join(root, `.${filename}-${randomUUID()}.tmp`);
        try {
            await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
            await rename(temporary, file);
        } finally {
            await unlink(temporary).catch(() => {});
        }
        entries = updated;
    }
    return Object.freeze({
        get: key => enqueue(key, data => structuredClone(data[key] ?? null)),
        isSecure: key => enqueue(key, () => false),
        set: (key, value) => enqueue(key, async data => {
            const encoded = JSON.stringify(value);
            if (encoded === undefined) throw new Error('invalid-payload');
            await persist(Object.assign(Object.create(null), data, { [key]: JSON.parse(encoded) }));
        }),
        remove: key => enqueue(key, async data => {
            if (!Object.hasOwn(data, key)) return;
            const updated = Object.assign(Object.create(null), data);
            delete updated[key];
            await persist(updated);
        }),
    });
}

async function loadPluginStorage(file) {
    const handle = await open(file, 'r').catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
    });
    if (!handle) return Object.create(null);
    try {
        const buffer = Buffer.alloc(pluginStorageLimit + 1);
        let offset = 0;
        while (offset < buffer.length) {
            const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset);
            if (!bytesRead) break;
            offset += bytesRead;
        }
        if (offset > pluginStorageLimit) throw new Error('storage-quota-exceeded');
        const parsed = JSON.parse(buffer.toString('utf8', 0, offset));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-storage');
        return Object.assign(Object.create(null), parsed);
    } finally {
        await handle.close();
    }
}

function bucketStorage(separator, prefix, invoke = hostInvoke) {
    const call = (domain, operation, input) => invoke([prefix, domain, operation].join(separator), input);
    return {
        records: Object.freeze({
            get: (bucket, key) => call('records', 'get', { bucket, key }),
            list: (bucket, { limit, before } = {}) => call('records', 'list', { bucket, limit, before }),
            set: (bucket, key, value, summary, limits, expectedRevision) =>
                call('records', 'set', { bucket, key, value, summary, limits, expectedRevision }),
            remove: (bucket, key, expectedRevision) =>
                call('records', 'remove', { bucket, key, expectedRevision }),
        }),
        cache: Object.freeze({
            get: (bucket, key) => call('cache', 'get', { bucket, key }),
            set: (bucket, key, value, limits) => call('cache', 'set', { bucket, key, value, limits }),
            remove: (bucket, key) => call('cache', 'remove', { bucket, key }),
        }),
    };
}

const lyricTextFields = ['syncedLyrics', 'plainLyrics', 'karaokeLyrics', 'translationLyrics', 'romanizationLyrics'];

function normalizeProviderLyrics(rows, provider, sourceId) {
    if (!Array.isArray(rows)) throw new TypeError('Expected an array of lyrics candidates');
    const candidates = [];
    let budget = 768 * 1024;
    for (const row of rows.slice(0, 24)) {
        if (typeof row?.title !== 'string' || row.title.length > 512 || !row.title.trim()
            || typeof row.artist !== 'string' || row.artist.length > 512 || !row.artist.trim()) continue;
        const candidate = {
            provider, sourceId, title: row.title.trim(), artist: row.artist.trim(),
            album: typeof row.album === 'string' ? row.album.slice(0, 512) : '',
            durationSeconds: Number.isFinite(row.durationSeconds) && row.durationSeconds > 0
                ? row.durationSeconds : null,
            instrumental: row.instrumental === true,
        };
        if (!candidate.instrumental) {
            for (const key of lyricTextFields) {
                const text = row[key];
                if (typeof text === 'string' && text.length <= 512 * 1024 && text.trim()
                    && Buffer.byteLength(text) <= 512 * 1024) candidate[key] = text;
            }
            if (!candidate.syncedLyrics && !candidate.karaokeLyrics && !candidate.plainLyrics) continue;
        }
        const bytes = Buffer.byteLength(JSON.stringify(candidate)) + 1;
        if (bytes > budget) continue;
        budget -= bytes;
        candidates.push(candidate);
    }
    return candidates;
}

import { createMvRelay } from './mv_relay.mjs';

let mvSession;
function resetMvSession() {
    mvSession?.relay?.close();
    mvSession = undefined;
}

function mvCandidates(rows) {
    if (!Array.isArray(rows)) throw new TypeError('Expected an array of MV candidates');
    const ids = new Set();
    const results = [];
    for (const row of rows.slice(0, 24)) {
        if (typeof row?.id !== 'string' || !row.id.trim() || row.id.length > 256 || ids.has(row.id)
            || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 512) continue;
        ids.add(row.id);
        results.push({ id: row.id, title: row.title.trim(), artist: String(row.artist ?? '').slice(0, 512),
            durationSeconds: Number.isFinite(row.durationSeconds) ? Math.max(0, row.durationSeconds) : 0 });
    }
    return results;
}

function mvStreamHeaders(input) {
    const headers = Object.create(null);
    if (input === undefined) return headers;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid MV headers');
    for (const [name, value] of Object.entries(input)) {
        const key = name.toLowerCase();
        if (!['authorization', 'referer', 'user-agent'].includes(key) || typeof value !== 'string'
            || value.length > 8192 || /[\x00-\x1f\x7f]/u.test(value)) throw new TypeError('Invalid MV header');
        headers[key] = value;
    }
    return headers;
}

function mvStatus(session) {
    return { loggedIn: false, username: '', video: session?.video ?? null,
        automatic: { trackId: session?.track?.id ?? null, phase: session?.phase ?? 'idle',
            message: session?.message ?? '', candidates: session?.candidates ?? [] } };
}

async function dispatchMv(providers, { providerId, operation, args }, signal) {
    const provider = providers.get(providerId);
    if (!provider) throw new Error('MV provider unavailable');
    if (provider.session) return dispatchMvSession(provider, providerId, operation, args, signal);
    if (operation === 'deactivate') {
        if (mvSession?.providerId === providerId) resetMvSession();
        return;
    }
    if (operation === 'status') return mvStatus(mvSession?.providerId === providerId ? mvSession : null);
    if (operation === 'observe') {
        if (!args.track) { resetMvSession(); return; }
        if (mvSession?.providerId !== providerId || mvSession.track.id !== args.track.id
            || mvSession.track.title !== args.track.title || mvSession.track.artist !== args.track.artist) {
            resetMvSession();
            mvSession = { providerId, track: args.track, candidates: [], attempted: false, phase: 'idle' };
        }
    }
    const session = mvSession;
    if (!session || session.providerId !== providerId || (args?.trackId && session.track.id !== args.trackId)) {
        throw new Error('MV track changed');
    }
    const track = { ...session.track };
    const check = () => {
        signal.throwIfAborted();
        if (mvSession !== session) throw new Error('MV track changed');
    };
    async function select(candidate) {
        const stream = await provider.resolve({ track, candidate: { ...candidate }, signal });
        check();
        const url = new URL(stream.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Expected an HTTPS video URL');
        const headers = mvStreamHeaders(stream.headers);
        if (!session.relay) {
            const relay = await createMvRelay();
            if (signal.aborted || mvSession !== session) { relay.close(); check(); }
            session.relay = relay;
        }
        session.video = { url: session.relay.publish(url, headers), title: candidate.title, trackId: track.id,
            sourceLabel: candidate.id, timingKey: pluginId + '/' + providerId + '/' + candidate.id, quality: String(stream.quality ?? '').slice(0, 64),
            startSeconds: Number.isFinite(stream.startSeconds) ? Math.max(0, Math.min(86400, stream.startSeconds)) : 0,
            durationSeconds: candidate.durationSeconds };
        session.phase = 'ready';
    }
    try {
        switch (operation) {
            case 'observe':
            case 'retry': {
                if (operation === 'observe' && (!args.enabled || session.attempted)) return;
                session.attempted = true;
                const query = [track.artist, track.title].filter(Boolean).join(' ');
                let candidates, selected;
                if (provider.match) {
                    const match = await provider.match({ track, signal });
                    candidates = mvCandidates(match ? [match] : []);
                    selected = candidates[0];
                } else {
                    candidates = mvCandidates(await provider.search({ query, track, automatic: true, signal }));
                    const norm = text => text.trim().normalize('NFKC').toLowerCase();
                    const exact = candidates.filter(c => norm(c.title) === norm(track.title)
                        && !!track.artist.trim() && norm(c.artist) === norm(track.artist));
                    if (exact.length === 1) selected = exact[0];
                }
                check();
                session.candidates = candidates;
                if (selected) await select(selected);
                session.message = selected ? '已自动匹配' : '没有确定匹配，可手动搜索';
                if (!selected) session.phase = 'idle';
                return;
            }
            case 'search': {
                const candidates = mvCandidates(await provider.search({ query: args.query, track, automatic: false, signal }));
                check();
                session.candidates = candidates;
                session.message = candidates.length ? '请选择候选视频' : '未找到候选视频';
                return;
            }
            case 'select': {
                const candidate = session.candidates.find(item => item.id === args.candidateId);
                if (!candidate) throw new Error('MV candidate unavailable');
                await select(candidate);
                session.message = '已选择视频';
                return;
            }
            case 'clear':
                session.relay?.clear();
                session.video = null;
                session.message = '';
                session.phase = 'idle';
                return;
            default: throw new Error('Unsupported MV action');
        }
    } catch (error) {
        if (mvSession === session) {
            if (signal.aborted && operation === 'observe') session.attempted = false;
            else if (!signal.aborted) {
                session.phase = 'error';
                session.message = String(error?.message ?? error).slice(0, 240);
            }
        }
        throw error;
    }
}

function registerMvSession(id, descriptor, handlers) {
    if (mvProviders.size >= 16) throw new Error('Too many MV providers');
    const callbacks = {};
    for (const key of ['observe', 'status', 'search', 'select', 'retry', 'clear', 'deactivate']) callbacks[key] = handlers?.[key];
    for (const key of ['login', 'closeLogin', 'logout', 'load', 'skip', 'quality', 'lowerQuality', 'playbackFailed', 'searchUrl']) {
        if (handlers?.[key] !== undefined) callbacks[key] = handlers[key];
    }
    if ((callbacks.login || callbacks.logout || callbacks.closeLogin)
        && !(callbacks.login && callbacks.logout && callbacks.closeLogin)) throw new Error('Incomplete MV account handlers');
    const qualities = descriptor?.qualities ?? [];
    if (!Array.isArray(qualities) || qualities.length > 16 || qualities.some(q =>
        typeof q?.value !== 'string' || !q.value || q.value.length > 64 ||
        typeof q.label !== 'string' || !q.label || q.label.length > 80) ||
        new Set(qualities.map(q => q.value)).size !== qualities.length ||
        (!!qualities.length !== !!callbacks.quality)) throw new TypeError('Invalid MV quality options');
    register(mvProviders, id, descriptor, callbacks);
    const provider = mvProviders.get(id);
    provider.session = true;
    provider.qualities = qualities.map(({value,label}) => ({value,label}));
    provider.capabilities = Object.keys(callbacks);
    if (descriptor?.matchPreferences) provider.capabilities.push('matchPreferences');
    let relay, opening, generation = 0;
    function clear() {
        generation++;
        provider.streamUrl = null;
        relay?.clear();
    }
    provider.clearStream = clear;
    provider.closeStream = () => { clear(); relay?.close(); relay = undefined; opening = undefined; };
    return Object.freeze({
        async publish({ trackId, url, headers }) {
            const current = generation;
            const address = new URL(url);
            if (address.protocol !== 'https:' || address.username || address.password) throw new Error('Expected an HTTPS video URL');
            const forwarded = mvStreamHeaders(headers);
            if (!trackId || trackId !== provider.trackId || stopping) throw new Error('MV track changed');
            if (!opening) {
                const pending = createMvRelay();
                opening = pending;
                pending.then(created => {
                    if (opening === pending) relay = created;
                    else created.close();
                }, () => { if (opening === pending) opening = undefined; });
            }
            const target = await opening;
            if (trackId !== provider.trackId || current !== generation || stopping) throw new Error('MV track changed');
            return provider.streamUrl = target.publish(address, forwarded);
        },
        clear,
        accessDenied: () => relay?.accessDenied() === true,
    });
}

async function dispatchMvSession(provider, providerId, operation, args, signal) {
    if (!provider.capabilities.includes(operation) || operation === 'matchPreferences') throw new Error('Unsupported MV action');
    if (operation === 'observe' && provider.trackId !== args.track?.id) {
        provider.clearStream();
        provider.trackId = args.track?.id;
    }
    if (operation === 'deactivate') provider.trackId = undefined;
    if (args?.trackId && args.trackId !== provider.trackId) throw new Error('MV track changed');
    try {
        if (operation === 'quality' && !provider.qualities.some(q => q.value === args?.quality)) {
            args = {quality:provider.qualities[0].value};
        }
        const result = await provider[operation](args, {signal});
        signal.throwIfAborted();
        if (operation !== 'status') return result ?? null;
        const video = result.video;
        const matching = result.automatic;
        const candidates = matching.candidates.slice(0, 24).map(candidate => ({
            id:candidate.id, title:candidate.title, artist:candidate.artist ?? '',
            durationSeconds:candidate.durationSeconds ?? 0, score:candidate.score ?? 0,
            reasons:(candidate.reasons ?? []).slice(0, 8).map(reason => String(reason).slice(0, 240)),
        }));
        return { loggedIn:result.loggedIn === true, username:result.username ?? '',
            qrUrl:result.qrUrl, loginMessage:result.loginMessage, credentialsError:result.credentialsError,
            searchRestricted:result.searchRestricted === true, automatic:{ trackId:matching.trackId,
                phase:matching.phase, message:matching.message, candidates },
            capabilities:provider.capabilities, qualities:provider.qualities,
            video: video && typeof provider.streamUrl === 'string' && video.trackId === provider.trackId && video.url === provider.streamUrl
                ? {...video, timingKey:pluginId + '/' + providerId + '/' + video.sourceLabel,
                    previousTimingKey:typeof video.previousTimingKey === 'string' && video.previousTimingKey.length <= 256
                        && !video.previousTimingKey.includes('/') ? video.previousTimingKey : undefined} : null };
    } finally {
        if (operation === 'deactivate') provider.closeStream();
    }
}
