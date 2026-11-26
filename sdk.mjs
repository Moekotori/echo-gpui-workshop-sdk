import { spawnSync } from 'node:child_process';
import { lstat, mkdir, open, readFile, realpath, rmdir, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs, TextDecoder } from 'node:util';

const MANIFEST = 'echo.workshop.json';
const MAX_MANIFEST = 256 * 1024;
const sdkFile = path => new URL(path, import.meta.url);
const templates = new Map([
    ['page', 'starter'],
    ['cover-browser', 'cover-browser'],
    ['live-library', 'live-library'],
    ['playlist-service', 'playlist-service'],
    ['stream-library', 'stream-library'],
    ['navidrome', 'navidrome'],
    ['lrc-source', 'lrc-source'],
    ['mv-source', 'mv-source'],
]);
const help = `ECHO GPUI Workshop SDK
  node sdk.mjs templates
  node sdk.mjs init <directory> [plugin-id] [--template <name>]
  node sdk.mjs check [project-directory-or-manifest]
  node sdk.mjs check-original <directory-or-package> [--action <id>] [--event <id>] [--json]
  node sdk.mjs capabilities [--original-catalog <path>]
  node sdk.mjs preview [project-directory-or-manifest] [--page <id>] [--action <method> | --command <id>] [--input <json>] [--fields <json>] [--lyrics <provider-id> --track <json> [--automatic]]
  node sdk.mjs preview <project> --mv <provider-id> --track <json> [--query <text> [--candidate <id>]]
  node sdk.mjs preview <project> [--player-action <id> | --track-action <id>]
  node sdk.mjs preview <project> --player-layout <id>

check reads a native GPUI manifest and checks its entry syntax without starting the plugin.
preview runs trusted native plugins with a temporary data folder and example host data.
Use ECHO GPUI's --workshop test for runtime validation and --workshop pack for distribution.
`;

async function manifestIn(path) {
    if (!(await stat(path)).isDirectory()) return path;
    const root = await realpath(path);
    const direct = join(root, MANIFEST);
    try {
        await lstat(direct);
        return direct;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const nested = join(root, 'content', MANIFEST);
    if (await realpath(dirname(nested)) !== dirname(nested)) {
        throw new Error('The project content directory must be inside the project.');
    }
    return nested;
}

async function packageFile(root, path) {
    const file = await realpath(path);
    const fromRoot = relative(root, file);
    if (isAbsolute(fromRoot) || fromRoot.split(sep)[0] === '..' || !(await stat(file)).isFile()) {
        throw new Error(`Expected a file inside the package: ${path}`);
    }
    return file;
}

function matches(value, rule) {
    return typeof value === 'string' && new RegExp(rule).exec(value)?.[0] === value;
}

async function readPackage(path, schema) {
    const manifest = await manifestIn(path);
    const root = await realpath(dirname(manifest));
    const file = await packageFile(root, manifest);
    if ((await stat(file)).size > MAX_MANIFEST) throw new Error('Manifest exceeds 256 KiB.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file));
    const data = JSON.parse(text);
    const fields = schema.properties;
    const gpui = fields.gpui.properties;
    if (data?.type !== fields.type.const || data.schemaVersion !== fields.schemaVersion.const
        || data.content?.kind !== fields.content.properties.kind.const || data.gpui?.protocol !== gpui.protocol.const) {
        throw new Error('Expected a native GPUI protocol 1 plugin manifest.');
    }
    if (!matches(data.id, fields.id.pattern)) {
        throw new Error('Plugin ID must contain 1–80 ASCII letters, digits, dots, underscores, or hyphens.');
    }
    for (const field of ['title', 'version']) {
        if (typeof data[field] !== 'string' || !data[field].trim()) throw new Error(`Set a nonempty ${field}.`);
    }
    if (!matches(data.gpui.entry, gpui.entry.pattern)) {
        throw new Error('Set gpui.entry to a package-relative .mjs file with forward slashes.');
    }
    if (data.gpui.updateFeed != null) {
        const feed = data.gpui.updateFeed;
        const url = typeof feed === 'string' ? URL.canParse(feed) && new URL(feed) : null;
        if (!url || !matches(feed, gpui.updateFeed.pattern) || url.href.length > gpui.updateFeed.maxLength
            || url.port || url.username || url.password) {
            throw new Error('Set gpui.updateFeed to a public HTTPS release URL without credentials, fragment, or a custom port.');
        }
    }
    if (Object.hasOwn(data.gpui, 'requires')) {
        const { capabilities, checkRequirements } = await import('./lib/capabilities.mjs');
        checkRequirements(data.gpui.requires, await capabilities());
    }
    const entry = await packageFile(root, join(root, data.gpui.entry));
    return { root, entry, id: data.id, title: data.title, version: data.version };
}

function checkSyntax(entry) {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const syntax = spawnSync(process.execPath, ['--check', entry], { encoding: 'utf8', env, windowsHide: true });
    if (syntax.error) throw syntax.error;
    if (syntax.status !== 0) throw new Error(syntax.stderr.trim() || 'Entry syntax check failed.');
}

async function init(directory, id, templateName, schema) {
    const template = templates.get(templateName);
    if (!template) throw new Error(`Unknown template: ${templateName}`);
    const name = basename(directory);
    const slug = name.split(/[^A-Za-z0-9]+/).filter(Boolean).join('-').toLowerCase();
    id ??= slug && `community.${slug}`;
    if (!matches(id, schema.properties.id.pattern)) {
        throw new Error('Provide a plugin ID with 1–80 ASCII letters, digits, dots, underscores, or hyphens.');
    }
    const manifest = JSON.parse(await readFile(sdkFile(`${template}/${MANIFEST}`), 'utf8'));
    manifest.$schema = schema.$id;
    manifest.id = id;
    manifest.title = templateName === 'page' ? id : manifest.title;
    manifest.version = '0.1.0';
    const files = new Map([
        [join('content', MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`],
        [join('content', 'plugin.mjs'), await readFile(sdkFile(`${template}/plugin.mjs`))],
        [join('content', 'echo-workshop.d.ts'), await readFile(sdkFile('starter/echo-workshop.d.ts'))],
        [join('content', 'LICENSE'), await readFile(sdkFile('LICENSE'))],
        ['README.md', await readFile(sdkFile('starter/README.md'))],
    ]);
    if (template === 'cover-browser') {
        for (const name of ['sleeve-1.jpg', 'sleeve-2.jpg', 'sleeve-3.jpg']) {
            files.set(join('content', name), await readFile(sdkFile(template + '/' + name)));
        }
    }
    await mkdir(directory);
    const written = [];
    const content = join(directory, 'content');
    try {
        await mkdir(content);
        for (const [path, bytes] of files) {
            const destination = join(directory, path);
            const handle = await open(destination, 'wx');
            written.push(destination);
            try {
                await handle.writeFile(bytes);
            } finally {
                await handle.close();
            }
        }
    } catch (error) {
        await Promise.allSettled(written.map(path => unlink(path)));
        await rmdir(content).catch(() => {});
        await rmdir(directory).catch(() => {});
        throw error;
    }
    console.log(`Created ${join(content, MANIFEST)}`);
}

async function main(args) {
    const [command, ...rest] = args;
    if (!command || command === '--help' || command === 'help') {
        console.log(help);
    } else if (command === 'templates' && rest.length === 0) {
        console.log([...templates.keys()].join('\n'));
    } else if (command === 'capabilities') {
        const { values } = parseArgs({ args: rest, options: { 'original-catalog': { type: 'string' } } });
        const { capabilities, compareOriginal } = await import('./lib/capabilities.mjs');
        const host = await capabilities();
        const path = values['original-catalog'];
        const result = path === undefined ? host : {
            ...host,
            comparison: compareOriginal(JSON.parse(await readFile(path, 'utf8')), host),
        };
        console.log(JSON.stringify(result, null, 2));
    } else if (command === 'check-original') {
        const { positionals, values } = parseArgs({
            args: rest,
            allowPositionals: true,
            options: {
                action: { type: 'string', multiple: true },
                event: { type: 'string', multiple: true },
                json: { type: 'boolean' },
            },
        });
        if (positionals.length !== 1) throw new Error(help);
        const { capabilities } = await import('./lib/capabilities.mjs');
        const { inspectOriginal } = await import('./lib/original-check.mjs');
        const report = await inspectOriginal(await manifestIn(resolve(positionals[0])), await capabilities(),
            { actions: values.action, events: values.event });
        if (values.json) {
            console.log(JSON.stringify(report, null, 2));
        } else {
            console.log(report.ok ? 'Original plugin manifest checks passed.' : 'Original plugin manifest needs changes.');
            for (const issue of report.issues) console.log(issue.level + ' ' + issue.field + ' — ' + issue.message);
            console.log('Use ECHO GPUI --workshop test to verify runtime behavior.');
        }
        if (!report.ok) process.exitCode = 1;
    } else if (command === 'check' && rest.length <= 1) {
        const schema = JSON.parse(await readFile(sdkFile('schemas/manifest.schema.json'), 'utf8'));
        const plugin = await readPackage(resolve(rest[0] ?? '.'), schema);
        checkSyntax(plugin.entry);
        console.log(`Checked ${plugin.title} v${plugin.version} (${plugin.id})`);
    } else if (command === 'preview') {
        const { positionals, values } = parseArgs({
            args: rest,
            allowPositionals: true,
            options: {
                page: { type: 'string' },
                action: { type: 'string' },
                command: { type: 'string' },
                input: { type: 'string' },
                fields: { type: 'string' },
                lyrics: { type: 'string' },
                mv: { type: 'string' },
                query: { type: 'string' },
                candidate: { type: 'string' },
                track: { type: 'string' },
                automatic: { type: 'boolean' },
                'player-action': { type: 'string' },
                'player-layout': { type: 'string' },
                'track-action': { type: 'string' },
            },
        });
        const surfaces = [values['player-action'], values['player-layout'], values['track-action']];
        if (positionals.length > 1 || (values.command && (values.page || values.action || values.fields))
            || (surfaces.some(value => value !== undefined) && [...surfaces, values.command, values.action, values.page, values.mv, values.lyrics]
                .filter(value => value !== undefined).length !== 1)
            || ((values.lyrics !== undefined || values.mv !== undefined) !== (values.track !== undefined))
            || (values.mv && (values.lyrics || values.command))
            || (!values.mv && (values.query !== undefined || values.candidate !== undefined))
            || (values.automatic && !values.lyrics) || (values.lyrics && values.command)
            || (!values.command && !values.action && (values.input !== undefined || values.fields))) {
            throw new Error(help);
        }
        const schema = JSON.parse(await readFile(sdkFile('schemas/manifest.schema.json'), 'utf8'));
        const plugin = await readPackage(resolve(positionals[0] ?? '.'), schema);
        const { preview } = await import('./lib/preview.mjs');
        const report = await preview(plugin, values);
        console.log(JSON.stringify(report, null, 2));
    } else if (command === 'init') {
        const { positionals, values } = parseArgs({
            args: rest,
            allowPositionals: true,
            options: { template: { type: 'string', default: 'page' } },
        });
        if (positionals.length < 1 || positionals.length > 2) throw new Error(help);
        const schema = JSON.parse(await readFile(sdkFile('schemas/manifest.schema.json'), 'utf8'));
        await init(resolve(positionals[0]), positionals[1], values.template, schema);
    } else {
        throw new Error(help);
    }
}

try {
    await main(process.argv.slice(2));
} catch (error) {
    console.error(`Workshop SDK: ${error.message}`);
    process.exitCode = 1;
}
