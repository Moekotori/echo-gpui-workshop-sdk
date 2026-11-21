// One registration owns one callback channel. Control calls use a separate session.
const frameLimit = 512 * 1024;

function collect(entries, kind) {
    const result = new Map();
    for (const entry of entries) {
        if (typeof entry?.id !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(entry.id)
            || typeof entry.title !== 'string' || !entry.title.trim() || result.has(entry.id)) {
            throw new TypeError(`Invalid or duplicate ${kind} descriptor.`);
        }
        const required = kind === 'source' ? ['search', 'resolve'] : ['run'];
        if (required.some(method => typeof entry[method] !== 'function')
            || (kind === 'source' && entry.browse !== undefined && typeof entry.browse !== 'function')) {
            throw new TypeError(`Invalid handlers for ${kind} ${entry.id}.`);
        }
        result.set(entry.id, entry);
    }
    return result;
}

function replyLine(id, value, error) {
    try {
        const line = JSON.stringify(error === undefined ? { id, value: value ?? null } : { id, error }) + '\n';
        if (Buffer.byteLength(line) <= frameLimit) return line;
    } catch { /* Return a terminal error for a non-JSON callback result. */ }
    return JSON.stringify({ id, error: 'Provider reply is not encodable within the Core frame limit.' }) + '\n';
}

export async function provide({ sources = [], commands = [] }, connect, registrations) {
    const music = collect(sources, 'source');
    const services = collect(commands, 'command');
    if (!music.size && !services.size) throw new TypeError('Register at least one source or command.');
    const manifest = JSON.stringify({
        sources: Array.from(music.values(), ({ id, title, browse }) => ({ id, title, browse: !!browse })),
        commands: Array.from(services.values(), ({ id, title }) => ({ id, title })),
    }) + '\n';
    if (Buffer.byteLength(manifest) > frameLimit) throw new RangeError('Provider manifest exceeds 512 KiB.');

    const channel = connect();
    let closing = false;
    let active;
    let writeFailure;
    function cancel() {
        const request = active;
        active = undefined;
        request?.abort.abort();
    }
    function stop() {
        closing = true;
        cancel();
        channel.stop();
    }
    registrations.add(stop);
    try {
        await channel.write(manifest);
        if ((await channel.next()).type !== 'ready') throw new Error('Core did not acknowledge registration.');
    } catch (error) {
        registrations.delete(stop);
        stop();
        throw error;
    }

    function respond(request, value, error) {
        if (active !== request) return;
        active = undefined;
        channel.write(replyLine(request.id, value, error)).catch(cause => {
            writeFailure = cause;
            channel.stop();
        });
    }
    async function dispatch({ method, input }, signal) {
        const { id, ...args } = input;
        if (method === 'command') {
            const command = services.get(id);
            if (!command) throw Error('Unknown provider command.');
            return command.run(args.input, { signal, callerPluginId: args.callerPluginId });
        }
        const source = music.get(id);
        if (!['search', 'browse', 'resolve'].includes(method) || !source?.[method]) throw Error('Unknown source operation.');
        return source[method]({ ...args, signal });
    }
    async function serve() {
        try {
            for (;;) {
                const event = await channel.next();
                if (event.type === 'released') return;
                if (closing) continue;
                if (event.type === 'cancel') {
                    if (active?.id === event.id) {
                        const request = active;
                        request.abort.abort();
                        respond(request, null, 'Provider call cancelled.');
                    }
                    continue;
                }
                if (event.type !== 'call' || active) throw Error('Unexpected provider callback.');
                const request = { id: event.id, abort: new AbortController() };
                active = request;
                dispatch(event, request.abort.signal).then(
                    value => respond(request, value),
                    error => respond(request, null, String(error?.message ?? error)),
                );
            }
        } catch (error) {
            if (!closing) throw writeFailure ?? error;
        } finally {
            registrations.delete(stop);
            stop();
        }
    }
    const closed = serve();
    closed.catch(() => {}); // A caller can choose to observe termination later.
    return { closed, async close() {
        if (!closing) {
            closing = true;
            cancel();
            try { await channel.write('{"type":"release"}\n'); }
            catch { channel.stop(); }
        }
        await closed;
    } };
}
