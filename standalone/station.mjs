// Usage: ECHO_STATION_URL=<audio URL> node station.mjs DATABASE "Station title"
import { createCoreClient } from './core.mjs';

const [database, title] = process.argv.slice(2);
const url = process.env.ECHO_STATION_URL;
if (!database || !title || !url || !['https:', 'http:'].includes(new URL(url).protocol)) {
    throw Error('Supply DATABASE, a station title, and an HTTP(S) audio URL in ECHO_STATION_URL.');
}
const appId = 'example.station';
const source = { plugin: appId, provider: 'radio' };
const track = { providerTrackId: 'live', title };
const core = createCoreClient({ database, appId });
const stop = () => core.close();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
    const registration = await core.provide({
        sources: [{
            id: source.provider, title,
            search: ({ query, page }) => ({
                tracks: page === 1 && title.toLowerCase().includes(query.toLowerCase()) ? [track] : [],
            }),
            browse: ({ collectionId, page }) => ({ tracks: !collectionId && page === 1 ? [track] : [] }),
            resolve: ({ providerTrackId }) => {
                if (providerTrackId !== track.providerTrackId) throw Error('Unknown track.');
                return { title, url };
            },
        }],
        commands: [{
            id: 'playlist', title: 'Station playlist',
            run: () => ({ title, tracks: [{ kind: 'source', source, track }] }),
        }],
    });
    console.log(`Registered ${appId}/radio and ${appId}/playlist. Press Ctrl+C to stop.`);
    await registration.closed;
} finally {
    core.close();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
}
