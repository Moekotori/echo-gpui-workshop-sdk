/** @param {import('../starter/echo-workshop').WorkshopContext} ctx */
export function activate({ actions, playerBar }) {
    actions.registerPlayerBar('now-playing', {
        title: 'Show now playing',
        icon: 'star',
        layoutOnly: true,
    }, ({ track }) => ({
        notice: track ? [track.title, track.artist].filter(Boolean).join(' · ').slice(0, 160) : 'Nothing is playing.',
    }));

    playerBar.registerLayout('studio', {
        title: 'Studio',
        items: [
            { type: 'previous' },
            { type: 'playPause' },
            { type: 'next' },
            { type: 'track' },
            { type: 'seek' },
            { type: 'action', id: 'now-playing' },
            { type: 'lyrics' },
            { type: 'queue' },
            { type: 'volume' },
        ],
    });
}
