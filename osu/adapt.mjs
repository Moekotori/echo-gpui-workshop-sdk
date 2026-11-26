import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const [manifestPath, output] = process.argv.slice(2);
if (!manifestPath || !output) {
    throw new Error('Usage: node adapt.mjs <original echo.workshop.json> <output directory>');
}
const item = JSON.parse(await readFile(manifestPath, 'utf8'));
if (item.id !== 'echo.osu' || item.compatibility?.pluginApiVersion !== 2 || item.content?.entry !== 'community.echo') {
    throw new Error('Expected an original osu! Workshop API 2 package');
}
const entry = join(dirname(manifestPath), item.content.entry);
const original = await readFile(entry);
const archiveRecord = item.files.find(file => file.path === item.content.entry);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
if (archiveRecord?.size !== original.length || archiveRecord.sha256 !== sha256(original)) {
    throw new Error('The original osu! package does not match its manifest');
}
const bundle = JSON.parse(original);
if (bundle.manifest.id !== item.id || bundle.manifest.version !== item.version
    || !bundle.manifest.contributes.panels.some(panel => panel.id === 'mania-preview')) {
    throw new Error('Use osu! 1.8.0 or an API 2 package with the mania preview panel');
}
const page = 'gpui-page.mjs';
let source = await readFile(new URL('./page.mjs', import.meta.url), 'utf8');
for (const module of ['view.mjs', 'artwork.mjs', 'mania-dan.mjs']) {
    const moduleSource = await readFile(new URL('./' + module, import.meta.url));
    source = source.replace(`'./${module}'`,
        JSON.stringify('data:text/javascript;base64,' + moduleSource.toString('base64')));
}
bundle.manifest.gpuiPageEntry = page;
bundle.files = bundle.files.filter(file => file.path !== page);
bundle.files.push({ path: page, content: source });
const bytes = Buffer.from(JSON.stringify(bundle, null, 2) + '\n');
Object.assign(archiveRecord, { size: bytes.length, sha256: sha256(bytes) });
const destination = resolve(output);
if (destination === resolve(dirname(manifestPath))) throw new Error('Select a separate output directory');
await mkdir(destination, { recursive: true });
await writeFile(join(destination, item.content.entry), bytes);
await writeFile(join(destination, 'echo.workshop.json'), JSON.stringify(item, null, 2) + '\n');
console.log(join(destination, 'echo.workshop.json'));
