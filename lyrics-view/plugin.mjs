let stop;

export function activate({ pages, lyrics, playback }) {
    const id = 'current-lyrics';
    pages.register(id, { title: 'Current lyrics', presentation: 'lyrics-view',
        permissions: ['clipboard:write', 'window:fullscreen'] }, async ({ lyricsView }) => {
        const { document, state } = await lyrics.getCurrent();
        const clock = await playback.getClock();
        const currentTime = clock.trackSequence === state.sequence
            ? clock.positionSeconds * 1000 + (document?.offsetMs ?? 0) : 0;
        const rows = document?.lines ?? [];
        const current = rows.findLastIndex(line => line.timeMs <= currentTime);
        const first = Math.max(0, current - 2);
        const selected = rows.slice(first, first + (lyricsView?.height < 280 ? 5 : 9));
        return {
            title: document?.title || 'Current lyrics',
            description: document?.artist || 'Play a track to browse its lyrics.',
            rows: selected.map(line => ({ title: line.text, detail: line.translation ?? '' })),
            actions: document?.plainText ? [{
                method: 'lyricsView.copyText', label: 'Copy lyrics', input: document.plainText,
            }] : [],
        };
    });
    stop = lyrics.onChanged(() => pages.invalidate(id));
}

export function dispose() { stop?.(); }
