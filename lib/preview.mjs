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
        return await readFile(new URL('runtime.mjs', import.meta.url), 'utf8');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const workspace = new URL('../../../crates/echo-bridge/src/workshop/', import.meta.url);
    const sources = await Promise.all(['runner.mjs', 'storage.mjs'].map(
        file => readFile(new URL(file, workspace), 'utf8'),
    ));
    return sources.join('\n');
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
                invalidations++;
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
        get pageRevision() { return invalidations; },
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
    const actions = [
        ...(page.actions ?? []), ...(page.headerActions ?? []),
        ...(page.rows ?? []).flatMap(row => row.actions ?? []),
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
    const fields = options.fields === undefined ? {} : JSON.parse(options.fields);
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)
        || Object.values(fields).some(value => typeof value !== 'string')) {
        throw new Error('--fields must be a JSON object of string values.');
    }
    const source = await runnerSource();
    const temp = await mkdtemp(join(tmpdir(), 'echo-workshop-preview-'));
    try {
        const runner = join(temp, 'runner.mjs');
        const data = join(temp, 'data');
        await Promise.all([writeFile(runner, source), mkdir(data)]);
        const process = runPreviewProcess(plugin, runner, data);
        try {
            const contributions = await process.start();
            const report = { fixture: true, pluginId: plugin.id, contributions };
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
            const openPage = async () => previewPage(await (pageId === undefined
                ? process.invoke('page.open', null)
                : process.invoke('contribution.page', { id: pageId })));
            const page = await openPage();
            if (!options.action) return { ...report, page };
            const revision = process.pageRevision;
            const result = await process.invoke(options.action, pageAction(page, options.action, input, fields));
            const updated = result === null
                ? (process.pageRevision === revision ? page : await openPage())
                : previewPage(result);
            return { ...report, page: updated };
        } finally {
            await process.stop();
        }
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
}
