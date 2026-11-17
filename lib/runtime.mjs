import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { Console } from 'node:console';

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
const events = new Set();
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

function subscribe(event, listener) {
    if (typeof listener !== 'function') throw new TypeError('Expected an event callback');
    let handlers = subscriptions.get(event);
    if (!handlers) subscriptions.set(event, handlers = new Set());
    let active = true;
    let running = false;
    const pendingEvents = new Map();
    const deliver = async value => {
        if (!active || stopping) return;
        pendingEvents.set(event === 'library.changed' ? value.source : event, value);
        if (running) return;
        running = true;
        while (active && !stopping && pendingEvents.size > 0) {
            const [key, next] = pendingEvents.entries().next().value;
            pendingEvents.delete(key);
            try { await listener(next); }
            catch (error) { console.error(error); }
        }
        running = false;
    };
    handlers.add(deliver);
    const initial = latestEvents.get(event);
    if (initial) {
        for (const value of initial.values()) queueMicrotask(() => void deliver(value));
    }
    syncEvents();
    return () => {
        active = false;
        pendingEvents.clear();
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
const commands = new Map();
const sources = new Map();
const lyricsProviders = new Map();
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

async function invokeContribution(method, input, signal, handle, progress) {
    switch (method) {
        case 'contribution.page': {
            const page = pages.get(input.id);
            if (!page) throw new Error('Plugin page does not exist');
            return page.open({ signal });
        }
        case 'contribution.search':
        case 'contribution.resolve': {
            const provider = sources.get(input.id);
            if (!provider) throw new Error('Search source does not exist');
            const { id, ...request } = input;
            return (method === 'contribution.search' ? provider.search : provider.resolve)({ ...request, signal });
        }
        case 'contribution.command': {
            const command = commands.get(input.id);
            if (!command) throw new Error('Plugin command does not exist');
            return command.run(input.input, { callerPluginId: input.callerPluginId, signal });
        }
        case 'tags.lookup': return queryTagProviders(input, signal);
        case 'lyrics.lookup': {
            const provider = lyricsProviders.get(input.id);
            if (!provider) throw new Error('Lyrics provider does not exist');
            return provider.lookup(input.track, signal, { timeoutMs: 6000, collectAllCandidates: !input.automatic });
        }
        case 'lyrics.match': return matchOriginalLyrics(input.track, signal, progress);
        default:
            if (handle) return handle({ method, input, signal }, context);
            if (method === 'page.open') return { title: pluginTitle ?? pluginId };
            throw new Error('Plugin action does not exist');
    }
}

const context = Object.freeze({
    contentRoot: process.cwd(),
    dataRoot: pluginDataRoot ?? process.cwd(),
    pluginId,
    hostInvoke,
    storage: pluginStorage(true, pluginDataRoot, 'storage.json'),
    credentials: Object.freeze({
        get: key => hostInvoke('credentials.get', { key }),
        set: (key, value) => hostInvoke('credentials.set', { key, value }),
        remove: key => hostInvoke('credentials.remove', { key }),
    }),
    library: Object.freeze({
        onChanged: listener => subscribe('library.changed', listener),
        query: (options = {}) => hostInvoke('library.query', options),
        track: (id, source = 'Local') => hostInvoke('library.track', { id, source }),
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
        playPlaylist: (id, options = {}) => hostInvoke('library.playPlaylist', { ...options, id }),
        queuePlaylist: (id, options = {}) => hostInvoke('library.queuePlaylist', { ...options, id }),
        createPlaylist: (title, tracks = []) => hostInvoke('library.createPlaylist', { title, tracks }),
        renamePlaylist: (id, title) => hostInvoke('library.renamePlaylist', { id, title }),
        setPlaylistTracks: (id, tracks, present) => hostInvoke('library.setPlaylistTracks', { id, tracks, present }),
        updatePlaylist: (id, change) => hostInvoke('library.updatePlaylist', { ...change, id }),
        movePlaylistTrack: (id, trackId, position) => hostInvoke('library.movePlaylistTrack', { id, trackId, position }),
        archivePlaylist: id => hostInvoke('library.archivePlaylist', { id }),
        playlistRecovery: (page = 1) => hostInvoke('library.playlistRecovery', { page }),
        restorePlaylistRecovery: ({ kind, id }) => hostInvoke('library.restorePlaylistRecovery', { kind, id }),
        setLiked: (id, liked) => hostInvoke('library.setLiked', { id, liked }),
        setAlbumLiked: (id, liked, source = 'Local') => hostInvoke('library.setAlbumLiked', { id, liked, source }),
        tags: Object.freeze({
            list: (options = {}) => hostInvoke('library.tags.list', options),
            items: (id, kind, page = 1) => hostInvoke('library.tags.items', { id, kind, page }),
            change: change => hostInvoke('library.tags.change', change),
        }),
        smart: Object.freeze({
            rules: (id, source = 'Local') => hostInvoke('library.smart.rules', { id, source }),
            preview: (rules, page = 1) => hostInvoke('library.smart.preview', { rules, page }),
            create: (title, rules) => hostInvoke('library.smart.save', { title, rules }),
            update: (id, title, rules) => hostInvoke('library.smart.save', { id, title, rules }),
            freeze: id => hostInvoke('library.smart.freeze', { id }),
        }),
    }),
    history: Object.freeze({
        list: (options = {}) => hostInvoke('history.list', options),
        review: (options = {}) => hostInvoke('history.review', options),
    }),
    playback: Object.freeze({
        onChanged: listener => subscribe('playback.changed', listener),
        onTrackChanged: listener => subscribe('playback.trackChanged', listener),
        get: () => hostInvoke('playback.get'),
        getCurrentTrack: () => hostInvoke('playback.getCurrentTrack'),
        control: command => hostInvoke('playback.control', command),
        setMode: mode => hostInvoke('playback.control', { action: 'setMode', mode }),
        getLyrics: () => hostInvoke('lyrics.get'),
    }),
    audio: Object.freeze({
        onAnalysis: listener => subscribe('audio.analysis', listener),
        output: Object.freeze({
            getStatus: () => hostInvoke('audio.output.getStatus'),
            listDevices: () => hostInvoke('audio.output.listDevices'),
            setOutput: change => hostInvoke('audio.output.setOutput', change),
        }),
    }),
    queue: Object.freeze({
        onChanged: listener => subscribe('queue.changed', listener),
        get: (options = {}) => hostInvoke('queue.get', options),
        edit: (queueId, edit) => hostInvoke('queue.edit', { queueId, edit }),
        submit: request => hostInvoke('queue.submit', request),
    }),
    commands: Object.freeze({
        register(id, options, run) { register(commands, id, options, { run }); },
        list() { return hostInvoke('commands.list'); },
        invoke(pluginId, commandId, input) { return hostInvoke('commands.invoke', { pluginId, commandId, input }); },
    }),
    pages: Object.freeze({
        register(id, options, open) { register(pages, id, options, { open }); },
        invalidate() {
            if (!stopping) send({ type: 'invalidate-page' });
        },
    }),
    sources: Object.freeze({
        registerProvider(id, options, handlers) {
            register(sources, id, options, { search: handlers?.search, resolve: handlers?.resolve });
        },
    }),
    metadata: tagProviderApi('metadata'),
    covers: tagProviderApi('covers'),
    onEvent(listener) {
        if (typeof listener !== 'function') throw new TypeError('Expected an event callback');
        events.add(listener);
        syncEvents();
        return () => {
            events.delete(listener);
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
    return { handle, dispose: module.dispose };
});
runtime.then(() => send({
    type: 'ready',
    contributions: {
        pages: descriptors(pages),
        commands: descriptors(commands),
        sources: descriptors(sources),
        lyrics: descriptors(lyricsProviders),
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
        for (const listener of events) {
            Promise.resolve().then(() => listener(frame.event, frame.value)).catch(error => console.error(error));
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
        const value = await invokeContribution(frame.method, frame.input, controller.signal, handle, progress);
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
