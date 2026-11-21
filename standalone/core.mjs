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
    return {
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
            submit: request => invoke('queue.submit', request),
        },
        playback: {
            get: () => invoke('playback.get'),
            getCurrentTrack: () => invoke('playback.getCurrentTrack'),
            control: command => invoke('playback.control', command),
        },
        library: { query: (options = {}) => invoke('library.query', options) },
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
