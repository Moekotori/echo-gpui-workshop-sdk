// Example standalone player controller. Pass --append N or --play N to select a result.
import { parseArgs } from 'node:util';
import { createCoreClient } from './core.mjs';

const { values, positionals: [database, plugin, provider, query, ...extra] } = parseArgs({
    allowPositionals: true, options: {
        zone: { type: 'string', default: '1' }, page: { type: 'string', default: '1' },
        play: { type: 'string' }, append: { type: 'string' }, watch: { type: 'boolean' },
    },
});
if (!database || extra.length || (values.watch && (plugin || values.append !== undefined || values.play !== undefined)) || ((plugin || provider) && (!provider || query === undefined))
    || (values.play !== undefined && values.append !== undefined)) {
    throw Error('Usage: node player.mjs DATABASE [PLUGIN PROVIDER QUERY] [--page N] [--zone 1|2] [--append N | --play N | --watch]');
}
const client = createCoreClient({ database, appId: 'example.standalone-player', zone: Number(values.zone) });
try {
    if (values.watch) {
        for await (const { revision, sources, commands } of client.watchDiscovery({ reconnect: true })) {
            console.log(JSON.stringify({ revision, sources, commands }));
        }
    } else if (!plugin) {
        for (const source of await client.sources.list()) console.log(source.plugin, source.provider, source.title);
    } else {
        const source = { plugin, provider };
        const page = await client.sources.search(source, query, { page: Number(values.page) });
        page.tracks.forEach((track, i) => console.log(`${i + 1}. ${track.title} · ${track.artist || ''}`));
        const selected = values.play ?? values.append;
        if (selected !== undefined) {
            const track = page.tracks[Number(selected) - 1];
            if (!track) throw Error('Choose a result number from this page.');
            await client.queue.submit({ mode: values.play === undefined ? 'append' : 'play', tracks: [{ kind: 'source', source, track }] });
        }
    }
} finally {
    client.close();
}
