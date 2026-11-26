import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { createPreviewHost } from './preview-host.mjs';

const inherited = new Set([
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LANGUAGE', 'TZ', 'TMP', 'TEMP', 'TMPDIR',
    'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432',
    'USERNAME', 'USERDOMAIN', 'SYSTEMDRIVE', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
    'XDG_STATE_HOME', 'XDG_RUNTIME_DIR', 'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS',
    'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'NODE_USE_SYSTEM_CA',
]);

async function runnerSource() {
    try {
        return { source: await readFile(new URL('runtime.mjs', import.meta.url), 'utf8'), relay: new URL('mv_relay.mjs', import.meta.url) };
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const workspace = new URL('../../../crates/echo-bridge/src/workshop/', import.meta.url);
    const sources = await Promise.all(['runner.mjs', 'storage.mjs', 'lyrics_candidates.mjs', 'mv_provider.mjs', 'mv_session.mjs'].map(
        file => readFile(new URL(file, workspace), 'utf8'),
    ));
    return { source: sources.join('\n'), relay: new URL('mv_relay.mjs', workspace) };
}

function runPreviewProcess(plugin, runner, data) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => {
        const name = key.toUpperCase();
        return inherited.has(name) || name.startsWith('LC_');
    }));
    const child = spawn(process.execPath, [runner, plugin.entry, plugin.id, plugin.title, data], {
        cwd: plugin.root, env, stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true,
    });
    const host = createPreviewHost(plugin.id);
    let cursor = 0;
    let invalidations = 0;
    const pageInvalidations = new Map();
    let pending;
    let failure;
    const send = frame => child.stdin.write(`${JSON.stringify(frame)}\n`);
    const fail = error => {
        failure ??= error;
        pending?.reject(failure);
        pending = undefined;
    };
    const exited = new Promise(resolve => child.once('close', () => {
        fail(new Error('Plugin process exited.'));
        resolve();
    }));
    child.on('error', fail);
    child.stdin.on('error', fail);
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
        try {
            if (Buffer.byteLength(line) > 1024 * 1024) throw new Error('Plugin reply exceeds 1 MiB.');
            const frame = JSON.parse(line);
            if (frame.type === 'host') {
                let response;
                try {
                    response = { value: host.invoke(frame.method, frame.input, send) };
                } catch (error) {
                    response = { error: error.message };
                }
                send({ type: 'host-result', id: frame.id, ...response });
            } else if (frame.type === 'listen') {
                host.listen(frame.events ?? [], send);
            } else if (frame.type === 'invalidate-page') {
                if (frame.page === undefined) invalidations++;
                else pageInvalidations.set(frame.page, (pageInvalidations.get(frame.page) ?? 0) + 1);
            } else if (frame.type === 'ready') {
                host.ready(frame.contributions);
                pending?.resolve(frame.contributions);
                pending = undefined;
            } else if (frame.type === 'failed' || (frame.type === 'rejected' && frame.id === pending?.id)) {
                fail(new Error(frame.error));
            } else if (frame.type === 'result' && frame.id === pending?.id) {
                pending.resolve(frame.value);
                pending = undefined;
            }
        } catch (error) {
            fail(error);
        }
    });
    const timeout = setTimeout(() => {
        fail(new Error('Offline preview timed out.'));
        child.kill();
    }, 10_000);
    function request(frame) {
        if (failure) return Promise.reject(failure);
        return new Promise((resolve, reject) => {
            pending = { id: frame.id, resolve, reject };
            send(frame);
        });
    }
    return {
        start: () => request({ type: 'start' }),
        invoke: (method, input) => request({ type: 'invoke', id: ++cursor, method, input }),
        pageRevision(id) { return invalidations + (pageInvalidations.get(id) ?? 0); },
        async stop() {
            clearTimeout(timeout);
            if (child.exitCode === null && child.signalCode === null && child.stdin.writable) {
                send({ type: 'shutdown' });
            }
            await Promise.race([exited, delay(750, undefined, { ref: false })]);
            if (child.exitCode === null && child.signalCode === null) child.kill();
            await exited;
            lines.close();
        },
    };
}

function previewPage(value) {
    if (typeof value?.title !== 'string'
        || ['fields', 'actions', 'headerActions', 'rows'].some(key => key in value && !Array.isArray(value[key]))
        || (value.rows?.length ?? 0) > 100) {
        throw new Error('Expected a Workshop page with a title and at most 100 rows.');
    }
    return value;
}

function pageAction(page, method, configuredInput, fieldOverrides) {
    const layoutActions = [];
    const nodes = [page.layout?.body, ...(page.layout?.grid?.items ?? [])].filter(Boolean);
    while (nodes.length) {
        const node = nodes.pop();
        if (node.action) layoutActions.push(node.action);
        if (Array.isArray(node.children)) nodes.push(...node.children);
    }
    const actions = [
        ...layoutActions,
        ...(page.actions ?? []), ...(page.headerActions ?? []),
        ...(page.rows ?? []).flatMap(row => row.actions ?? []),
        ...(page.fields ?? []).flatMap(field => field.control?.commit ?? []),
    ].filter(action => action.method === method);
    if (!actions.length) throw new Error(`Action not on this page: ${method}`);
    if (actions.length > 1 && configuredInput === undefined) {
        throw new Error(`More than one action uses ${method}. Pass its JSON data with --input.`);
    }
    const fields = Object.fromEntries((page.fields ?? []).map(field => [field.id, field.value ?? '']));
    return { fields: { ...fields, ...fieldOverrides }, data: configuredInput === undefined ? actions[0].input ?? null : configuredInput };
}

export async function preview(plugin, options) {
    const input = options.input === undefined ? undefined : JSON.parse(options.input);
    const track = options.track === undefined ? undefined : JSON.parse(options.track);
    if (track !== undefined && (typeof track?.title !== 'string' || !track.title.trim()
        || typeof track.artist !== 'string' || !track.artist.trim()
        || (track.album != null && typeof track.album !== 'string')
        || (track.trackId != null && typeof track.trackId !== 'string')
        || (track.durationSeconds != null && (!Number.isFinite(track.durationSeconds) || track.durationSeconds <= 0)))) {
        throw new Error('Use a track with title and artist, and optional album, trackId and positive durationSeconds.');
    }
    const fields = options.fields === undefined ? {} : JSON.parse(options.fields);
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)
        || Object.values(fields).some(value => typeof value !== 'string')) {
        throw new Error('--fields must be a JSON object of string values.');
    }
    const { source, relay } = await runnerSource();
    const temp = await mkdtemp(join(tmpdir(), 'echo-workshop-preview-'));
    try {
        const runner = join(temp, 'runner.mjs');
        const data = join(temp, 'data');
        await Promise.all([writeFile(runner, source), writeFile(join(temp, 'mv_relay.mjs'), await readFile(relay)), mkdir(data)]);
        const process = runPreviewProcess(plugin, runner, data);
        try {
            const contributions = await process.start();
            const report = { fixture: true, pluginId: plugin.id, contributions };
            if (options['player-layout'] !== undefined) {
                const id = options['player-layout'];
                const layout = contributions.playerBarLayouts?.find(layout => layout.id === id);
                if (!layout) throw new Error(`Plugin player bar layout not found: ${id}`);
                return { ...report, playerBarLayout: layout };
            }
            const playerAction = options['player-action'];
            const trackAction = options['track-action'];
            if (playerAction !== undefined || trackAction !== undefined) {
                const id = playerAction ?? trackAction;
                const actions = playerAction !== undefined ? contributions.playerBarActions : contributions.trackContextMenus;
                if (!actions?.some(action => action.commandId === id)) throw new Error(`Plugin action not found: ${id}`);
                const track = playerAction !== undefined ? null : {
                    id: 'demo-1', source: 'Local', title: 'First Light', artist: 'Echo Workshop', album: 'Demo Sessions', durationSeconds: 180,
                };
                const result = await process.invoke('contribution.surfaceAction', { id, track });
                return { ...report, surfaceAction: { id, result } };
            }
            if (options.command) {
                if (!contributions.commands.some(command => command.id === options.command)) {
                    throw new Error(`Plugin command not found: ${options.command}`);
                }
                const result = await process.invoke('contribution.command', {
                    id: options.command, input: input ?? null, callerPluginId: plugin.id,
                });
                return { ...report, command: { id: options.command, result } };
            }
            if (options.page && !contributions.pages.some(page => page.id === options.page)) {
                throw new Error(`Plugin page not found: ${options.page}`);
            }
            const pageId = options.page ?? contributions.pages[0]?.id;
            const descriptor = contributions.pages.find(page => page.id === pageId);
            const lyricsTarget = { 'lyrics-view': 'main', 'desktop-lyrics': 'desktop', 'companion-lyrics': 'companion', 'lyrics-settings': 'settings' }[descriptor?.placement];
            const lyricsView = lyricsTarget ? {
                target: lyricsTarget,
                externalPlayback: lyricsTarget === 'companion' ? { title: 'External audio', artist: 'Echo Workshop', album: 'Demo Sessions',
                    playing: true, durationMs: 180000, line: { timeMs: 0, text: 'First light', translation: '晨光', romanization: null, words: [] } } : null,
                width: 960, height: 500, insetTop: 48, insetBottom: 92, fullscreen: false,
                focused: true, minRefreshIntervalMs: 150,
                visible: true, reducedMotion: false, frameIntervalMs: 150, preferences: null, appearance: null, systemFonts: null,
                bundledFonts: [],
            } : undefined;
            const openPage = async () => previewPage(await (pageId === undefined
                ? process.invoke('page.open', null)
                : process.invoke('contribution.page', { id: pageId, lyricsView })));
            const page = await openPage();
            let updated = page;
            if (options.action) {
                const revision = process.pageRevision(pageId);
                const payload = pageAction(page, options.action, input, fields);
                if (descriptor?.window) payload.windowId = pageId;
                if (lyricsView) payload.lyricsView = lyricsView;
                const result = await process.invoke(options.action, payload);
                if (result !== null) updated = previewPage(result);
                else if (process.pageRevision(pageId) !== revision) updated = await openPage();
            }
            if (options.mv) {
                const call = (operation, args) => process.invoke('provider.mv', { providerId: options.mv, operation, args });
                const current = { ...track, id: track.trackId ?? 'preview', durationSeconds: track.durationSeconds ?? 0 };
                await call('observe', { track: current, enabled: options.query === undefined, active:true, state:'playing', matching:{} });
                if (options.query !== undefined) await call('search', {trackId:current.id, query:options.query});
                if (options.candidate) await call('select', {trackId:current.id, candidateId:options.candidate});
                const { automatic, video } = await call('status', {});
                const selected = video ? { id:video.sourceLabel, title:video.title, startSeconds:video.startSeconds } : null;
                return { ...report, page: updated, mv: { provider:options.mv, ...automatic, selected } };
            }
            if (options.lyrics) {
                if (!contributions.lyrics.some(provider => provider.id === options.lyrics)) {
                    throw new Error(`Lyrics provider not found: ${options.lyrics}`);
                }
                const candidates = await process.invoke('lyrics.lookup', {
                    id: options.lyrics, automatic: options.automatic === true,
                    track: { trackId: null, album: null, durationSeconds: null, ...track },
                });
                return { ...report, page: updated, lyrics: { provider: options.lyrics, candidates } };
            }
            return { ...report, page: updated };
        } finally {
            await process.stop();
        }
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
}
