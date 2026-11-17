import { spawnSync } from 'node:child_process';
import { lstat, mkdir, open, readFile, realpath, rmdir, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs, TextDecoder } from 'node:util';

const MANIFEST = 'echo.workshop.json';
const MAX_MANIFEST = 256 * 1024;
const sdkFile = path => new URL(path, import.meta.url);
const templates = new Map([
    ['page', 'starter'],
    ['live-library', 'live-library'],
    ['navidrome', 'navidrome'],
]);
const help = `ECHO GPUI Workshop SDK
  node sdk.mjs templates
  node sdk.mjs init <directory> [plugin-id] [--template <name>]
  node sdk.mjs check [project-directory-or-manifest]
  node sdk.mjs preview [project-directory-or-manifest] [--page <id>] [--action <method> | --command <id>] [--input <json>] [--fields <json>]

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
            },
        });
        if (positionals.length > 1 || (values.command && (values.page || values.action || values.fields))
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
