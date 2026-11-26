// Uses the native controller for Core discovery, peer checks, and zone routing.
import { spawn } from 'node:child_process';
import { provide } from './provider.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

function transport(executable, args) {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
    let diagnostic = '';
    child.stderr.setEncoding('utf8').on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4096); });
    child.on('error', error => { diagnostic = error.message; });
    // write() reports errors through its callback. EPIPE also emits an error event.
    child.stdin.on('error', () => {});
    const ended = new Promise(resolve => child.once('close', resolve));
    return {
        async next() {
            const line = await lines.next();
            if (line.done) {
                const code = await ended;
                throw new Error(diagnostic.trim() || `echo-corectl closed (exit ${code})`);
            }
            return JSON.parse(line.value);
        },
        write(line) {
            return new Promise((resolve, reject) => child.stdin.write(line,
                error => error ? reject(error) : resolve()));
        },
        stop() { child.kill(); },
    };
}

function defaultExecutable() {
    if (process.env.ECHO_CORECTL) return process.env.ECHO_CORECTL;
    const name = process.platform === 'win32' ? 'echo-corectl.exe' : 'echo-corectl';
    const bundled = fileURLToPath(new URL(`../bin/${process.platform}-${process.arch}/${name}`, import.meta.url));
    return existsSync(bundled) ? bundled : name;
}

/** Open a local Core from a standalone Node application. Processes are started lazily. */
export function createCoreClient({ database, appId, zone = 1, executable = defaultExecutable() }) {
    if (typeof database !== 'string' || !database || ![1, 2].includes(zone)
        || typeof appId !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(appId)) {
        throw new TypeError('Expected a database path, an application ID, and zone 1 or 2.');
    }
    const args = [database, '--zone', String(zone), 'sdk', appId];
    const watchers = new Set();
    const registrations = new Set();
    let closed = false;
    let session;
    let queued = 0;
    let tail = Promise.resolve();

    async function invoke(method, input = null) {
        if (closed) throw new Error('Core client closed.');
        if (queued >= 32) throw new Error('Core client busy.');
        if (typeof method !== 'string' || !method) throw new TypeError('Expected a Core method name.');
        const line = JSON.stringify({ method, input }) + '\n';
        if (Buffer.byteLength(line) > 512 * 1024) throw new RangeError('Core request exceeds 512 KiB.');
        queued++;
        const operation = tail.then(async () => {
            if (closed) throw new Error('Core client closed.');
            session ??= transport(executable, [...args, 'session']);
            let reply;
            try {
                await session.write(line);
                reply = await session.next();
            } catch (error) {
                session.stop();
                session = undefined;
                throw error;
            }
            if ('error' in reply) throw new Error(reply.error);
            return reply.value;
        }).finally(() => { queued--; });
        tail = operation.catch(() => {});
        return operation;
    }

    function watchStream(mode, { signal, reconnect = false } = {}) {
        let reader;
        let stopped = false;
        function stop() {
            if (stopped) return;
            stopped = true;
            signal?.removeEventListener('abort', stop);
            watchers.delete(stop);
            reader?.stop();
        }
        async function* snapshots() {
            if (closed) throw new Error('Core client closed.');
            if (stopped || signal?.aborted) return;
            const flags = mode === 'watch-discovery' && reconnect ? ['--reconnect'] : [];
            reader = transport(executable, [...args, mode, ...flags]);
            watchers.add(stop);
            signal?.addEventListener('abort', stop, { once: true });
            try {
                while (!closed && !stopped) {
                    if (mode === 'watch-discovery') await reader.write('\n');
                    const value = await reader.next();
                    if (!closed && !stopped) yield value;
                }
            } catch (error) {
                if (!closed && !stopped) throw error;
            } finally {
                stop();
            }
        }
        const iterator = snapshots();
        return {
            next: () => iterator.next(),
            return() { stop(); return iterator.return(); },
            [Symbol.asyncIterator]() { return this; },
        };
    }
    const sourcePage = ({ page = 1, pageSize = 24 } = {}) => ({ page, pageSize });
    const catalogItem = method => (id, source = 'Local') => invoke(method, { id, source });
    return {
        zone,
        forZone: nextZone => createCoreClient({ database, appId, zone: nextZone, executable }),
        invoke,
        watch: options => watchStream('watch', options),
        watchDiscovery: options => watchStream('watch-discovery', options),
        async provide(contributions) {
            if (closed) throw new Error('Core client closed.');
            return provide(contributions, () => transport(executable, [...args, 'provide']), registrations);
        },
        describe: () => invoke('host.describe'),
        sources: {
            list: () => invoke('sources.list'),
            browse: (source, collectionId = null, options) => invoke('sources.browse', { source, collectionId, ...sourcePage(options) }),
            search: (source, query, options) => invoke('sources.search', { source, query, ...sourcePage(options) }),
        },
        queue: {
            get: (options = {}) => invoke('queue.get', options),
            search: (query, options = {}) => invoke('queue.search', { ...options, query }),
            playAt: (queueId, index) => invoke('queue.playAt', { queueId, index }),
            playItem: (queueId, occurrenceId) => invoke('queue.playItem', { queueId, occurrenceId }),
            edit: (queueId, edit) => invoke('queue.edit', { queueId, edit }),
            submit: request => invoke('queue.submit', request),
            saved: {
                list: () => invoke('queue.saved.list'),
                save: queueId => invoke('queue.saved.save', { queueId }),
                restore: (queueId, snapshotId) => invoke('queue.saved.restore', { queueId, snapshotId }),
                remove: snapshotId => invoke('queue.saved.remove', { snapshotId }),
                undoRemove: snapshotId => invoke('queue.saved.undoRemove', { snapshotId }),
            },
        },
        playback: {
            getClock: () => invoke('playback.getClock'),
            getMusicMetadata: sequence => invoke('playback.getMusicMetadata', { sequence }),
            get: () => invoke('playback.get'),
            getCurrentTrack: () => invoke('playback.getCurrentTrack'),
            control: command => invoke('playback.control', command),
            getRate: () => invoke('playback.getRate'),
            setRate: rate => invoke('playback.setRate', { rate }),
            getSpeed: () => invoke('playback.getSpeed'),
            setSpeed: (rate, mode) => invoke('playback.setSpeed', { rate, mode }),
            getSegmentLoop: () => invoke('playback.getSegmentLoop'),
            editSegmentLoop: (trackInstance, edit) => invoke('playback.editSegmentLoop', { trackInstance, edit }),
            setMode: mode => invoke('playback.control', { action: 'setMode', mode }),
            seekBy: seconds => invoke('playback.control', { action: 'seekBy', seconds }),
            setShuffle: enabled => invoke('playback.control', { action: 'setShuffle', enabled }),
            toggleShuffle: () => invoke('playback.control', { action: 'toggleShuffle' }),
            setRepeat: mode => invoke('playback.control', { action: 'setRepeat', mode }),
            cycleRepeat: () => invoke('playback.control', { action: 'cycleRepeat' }),
            getLyrics: () => invoke('lyrics.get'),
            bookmarks: {
                list: catalogItem('playback.bookmarks.list'),
                add: sequence => invoke('playback.bookmarks.edit', { action: 'add', sequence }),
                jump: (sequence, bookmarkId) => invoke('playback.bookmarks.edit', { action: 'jump', sequence, bookmarkId }),
                rename: (track, bookmarkId, label) => invoke('playback.bookmarks.edit', { action: 'rename', track, bookmarkId, label }),
                remove: (track, bookmarkId) => invoke('playback.bookmarks.edit', { action: 'remove', track, bookmarkId }),
            },
            savedSegments: {
                list: (options = {}) => invoke('playback.savedSegments.list', options),
                edit: edit => invoke('playback.savedSegments.edit', edit),
                play: id => invoke('playback.savedSegments.play', { id }),
            },
        },
        library: {
            query: (options = {}) => invoke('library.query', options),
            track: catalogItem('library.track'),
            summary: () => invoke('library.summary'),
            album: id => invoke('library.album', { id }),
            albumForTrack: id => invoke('library.albumForTrack', { id }),
            relatedAlbums: catalogItem('library.relatedAlbums'),
            albumVersions: catalogItem('library.albumVersions'),
            similarLocalTracks: id => invoke('library.similarLocalTracks', { id }),
            artist: id => invoke('library.artist', { id }),
            artistByName: (name, source = 'Local') => invoke('library.artistByName', { name, source }),
            artistCredits: (name, source = 'Local') => invoke('library.artistCredits', { name, source }),
            albumCredits: catalogItem('library.albumCredits'),
            trackArtistCredits: id => invoke('library.trackArtistCredits', { id }),
            albums: (options = {}) => invoke('library.query', { ...options, category: 'Albums' }),
            artists: (options = {}) => invoke('library.query', { ...options, category: 'Artists' }),
            trackVersions: catalogItem('library.trackVersions'),
            editTrackVersions: (id, revision, edit) => invoke('library.editTrackVersions', { id, revision, edit }),
            linkedTracks: catalogItem('library.linkedTracks'),
            searchTracks: (rules, page = {}) => invoke('library.searchTracks', { ...page, rules }),
            playlistItems: (id, options = {}) => invoke('library.playlistItems', { ...options, id }),
            findTrackInPlaylists: (trackId, options = {}) => invoke('library.findTrackInPlaylists', { ...options, trackId }),
            appendPlaylistTracks: (id, trackIds, duplicates = 'ask') => invoke('library.appendPlaylistTracks', { id, trackIds, duplicates }),
            transferPlaylistItems: (id, targetId, itemIds, mode = 'copy') => invoke('library.transferPlaylistItems', { id, targetId, itemIds, mode }),
            playlistGroups: (options = {}) => invoke('library.playlistGroups', options),
            playlistsInGroup: (groupId, options = {}) => invoke('library.playlistsInGroup', { ...options, groupId }),
            editPlaylistGroup: change => invoke('library.editPlaylistGroup', change),
            playlistRecovery: (page = 1) => invoke('library.playlistRecovery', { page }),
            restorePlaylistRecovery: ({ kind, id }) => invoke('library.restorePlaylistRecovery', { kind, id }),
        },
        audio: {
            canvas: {
                start: options => invoke('audio.canvas.start', options),
                status: id => invoke('audio.canvas.status', { id }),
                release: id => invoke('audio.canvas.release', { id }),
            },
            visualization: {
                open: (options = {}) => invoke('audio.visualization.open', options),
                read: id => invoke('audio.visualization.read', { id }),
                close: id => invoke('audio.visualization.close', { id }),
            },
            getSignalPath: () => invoke('audio.getSignalPath'),
            getAnalysis: () => invoke('audio.getAnalysis'),
            dsp: {
                getGraph: () => invoke('audio.dsp.getGraph'),
                applyGraph: graph => invoke('audio.dsp.applyGraph', graph),
                getRackOrder: () => invoke('audio.dsp.getRackOrder'),
                setRackOrder: order => invoke('audio.dsp.setRackOrder', { order }),
            },
            output: {
                getStatus: () => invoke('audio.output.getStatus'),
                listDevices: () => invoke('audio.output.listDevices'),
                setOutput: change => invoke('audio.output.setOutput', change),
            },
        },
        artwork: {
            track: catalogItem('artwork.track'),
            album: catalogItem('artwork.album'),
            artist: catalogItem('artwork.artist'),
            current: sequence => invoke('artwork.current', { sequence }),
            getPalette: sequence => invoke('artwork.getPalette', { sequence }),
        },
        history: {
            list: (options = {}) => invoke('history.list', options),
            review: (options = {}) => invoke('history.review', options),
        },
        lyrics: {
            get: trackId => invoke('lyrics.readTrack', { trackId }),
            getCurrent: (expected = {}) => invoke('lyrics.getCurrent', expected),
            matchAmll: sequence => invoke('lyrics.matchAmll', { sequence }),
            fillMissing: (trackId, lyrics) => invoke('lyrics.fillMissing', { trackId, lyrics }),
            applyCustom: (trackId, text, format = 'lrc') => invoke('lyrics.applyCustom', { trackId, text, format }),
            setOffset: (trackId, offsetMs) => invoke('lyrics.setOffset', { trackId, offsetMs }),
            setCurrentOffset: offsetMs => invoke('lyrics.setCurrentOffset', { offsetMs }),
            markInstrumental: trackId => invoke('lyrics.markInstrumental', { trackId }),
            clearOverride: trackId => invoke('lyrics.clearOverride', { trackId }),
        },
        sleepTimer: {
            getStatus: () => invoke('sleepTimer.getStatus'),
            start: input => invoke('sleepTimer.start', input),
            cancel: () => invoke('sleepTimer.cancel'),
        },
        commands: {
            list: () => invoke('commands.core.list'),
            invoke: (pluginId, commandId, input) => invoke('commands.core.invoke', { pluginId, commandId, input }),
        },
        close() {
            closed = true;
            session?.stop();
            for (const stop of watchers) stop();
            for (const stop of registrations) stop();
        },
    };
}
