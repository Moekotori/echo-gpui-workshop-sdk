const id = 'designer-stage';
const title = 'Custom lyric stage';
const timeline = { x: 0.1, width: 0.8 };

function lineAt(lines, ms) {
    let first = 0;
    let end = lines.length;
    while (first < end) {
        const middle = (first + end) >>> 1;
        if (lines[middle].timeMs <= ms) first = middle + 1;
        else end = middle;
    }
    return Math.max(0, first - 1);
}

const rectangle = (x, y, width, height, color, keyframes) => ({
    draw: { type: 'shape', command: { type: 'rect', x, y, width, height, color } }, keyframes,
});
const text = (runs, y, size, ink, highlight = ink, keyframes) => ({
    draw: { type: 'text', x: 0.5, y, align: 'center', size, ink, highlight, runs }, keyframes,
});

export function registerDesignerStage({ pages, lyrics, playback }, settingsPage) {
    let stageLines;
    let stopClock;
    const click = pages.registerAction('stage-seek', async ({ data, lyricsView }) => {
        const fraction = Math.max(0, Math.min(1, (data.x - timeline.x) / timeline.width));
        const seconds = data.hotspot === 'timeline' ? fraction * data.input.duration : data.input.seconds;
        await playback.seekTrack(data.sequence, seconds);
        return open({ lyricsView });
    });

    async function open({ lyricsView }) {
        const { state, clock } = await playback.getTransport();
        if (clock.trackSequence === null) return { title, description: 'Play a track to open the stage.' };
        const { document } = await lyrics.getCurrent({ sequence: clock.trackSequence });
        const lines = (document?.lines ?? []).filter(line => Number.isFinite(line.timeMs) && line.text.trim());
        const offsetMs = document?.offsetMs ?? 0;
        const index = lineAt(lines, clock.positionSeconds * 1000 + offsetMs);
        stageLines = { sequence: clock.trackSequence, lines, offsetMs, index };
        if (!stopClock) stopClock = playback.onClock(next => {
            if (stageLines?.sequence !== next.trackSequence) return;
            const index = lineAt(stageLines.lines, next.positionSeconds * 1000 + stageLines.offsetMs);
            if (index !== stageLines.index) {
                stageLines.index = index;
                pages.invalidate(id);
            }
        });
        const current = lines[index];
        const next = lines[index + 1];
        const durationMs = Math.max(1, Math.round(clock.durationSeconds * 1000));
        const size = Math.max(25, Math.min(52, Math.floor((lyricsView?.width ?? 950) / 23)));
        const layers = [
            rectangle(0, 0, 1, 1, '#122226'),
            rectangle(0.1, 0.177, 0.8, 0.003, '#2D4849'),
            text(lyrics.stageRuns({ text: state.title || title }), 0.08, 18, '#9BB8B6'),
            rectangle(timeline.x, 0.85, timeline.width, 0.006, '#365354'),
            rectangle(timeline.x, 0.838, 0.009, 0.030, '#8DF1D2', [
                { atMs: 0, x: 0 }, { atMs: durationMs, x: timeline.width - 0.009 },
            ]),
        ];
        const hotspots = state.canSeek ? [
            { id: 'timeline', rect: [timeline.x, 0.79, timeline.width, 0.13], action: {
                label: 'Seek on stage timeline', method: click, input: { duration: clock.durationSeconds },
            } },
        ] : [];
        if (current) {
            const start = Math.max(0, Math.trunc(current.timeMs));
            layers.push(text(lyrics.stageRuns(current).slice(0, 128), 0.36, size, '#748F8D', '#CEFBE8', [
                { atMs: start, y: 0.045, opacity: 0.55 },
                { atMs: start + 320, y: 0, opacity: 1, easing: 'easeOut' },
            ]));
            if (current.translation) layers.push(text(lyrics.stageRuns({ text: current.translation }), 0.55, 20, '#A8C2BE'));
            if (next) layers.push(text(lyrics.stageRuns({ text: next.text }), 0.68, 18, '#557475'));
            if (state.canSeek) hotspots.push({ id: 'current-line', rect: [0.08, 0.31, 0.84, 0.26], action: {
                label: 'Jump to this lyric line', method: click, input: { seconds: Math.max(0, (start - offsetMs) / 1000) },
            } });
        }
        const height = Math.round(Math.max(230, Math.min(560, (lyricsView?.height ?? 520) - 45)));
        return { title, layout: { body: { type: 'lyricsStage', height, sequence: clock.trackSequence, offsetMs, layers, hotspots } } };
    }

    pages.register(id, { title, presentation: 'lyrics-view', settingsPage }, open);
    const stopLyrics = lyrics.onChanged(() => pages.invalidate(id));
    return () => { stopLyrics(); stopClock?.(); };
}
