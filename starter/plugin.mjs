// @ts-check

/** @typedef {import('./echo-workshop.js').WorkshopContext} WorkshopContext */
/** @typedef {import('./echo-workshop.js').WorkshopRequest} WorkshopRequest */

/** @param {WorkshopContext} context */
export function activate(context) {
    console.info(`Activating ${context.pluginId}`);
    context.pages.register('home', { title: 'My plugin' }, () => home(context));
    context.commands.register('now-playing', { title: 'Now playing' }, async () => {
        const { title, artist } = await context.playback.get();
        return { title, artist };
    });
}

/** @param {WorkshopRequest} request @param {WorkshopContext} context */
export async function handle({ method }, context) {
    if (method === 'demo.refresh') return home(context);
    if (method === 'demo.remember') {
        const { title } = await context.playback.get();
        await context.storage.set('last-track', title || null);
        return home(context);
    }
    throw new Error(`Unknown action: ${method}`);
}

/** @param {WorkshopContext} context @returns {Promise<import('./echo-workshop.js').WorkshopPage>} */
async function home(context) {
    const [playback, playlists, lastTrack] = await Promise.all([
        context.playback.get(),
        context.library.playlists(),
        context.storage.get('last-track'),
    ]);
    return {
        title: 'My plugin',
        description: `Now playing: ${playback.title || '—'}\nRemembered: ${lastTrack ?? '—'}`,
        actions: [
            { label: 'Refresh', method: 'demo.refresh' },
            { label: 'Remember track', method: 'demo.remember' },
        ],
        rows: playlists.entries.map(playlist => ({ title: playlist.title, detail: `${playlist.count} tracks` })),
    };
}
