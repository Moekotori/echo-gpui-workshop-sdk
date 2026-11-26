let stop;

export function activate({ pages, lyrics, playback, storage, artwork }) {
    const id = 'current-lyrics';
    const settingsId = 'lyrics-settings';
    const showTranslation = async () => await storage.get('translation') !== false;
    const toggleTranslation = pages.registerAction('toggle-translation', async () => {
        await storage.set('translation', !await showTranslation());
        pages.invalidate(id);
        return settings();
    });
    async function settings() {
        return { title: 'Lyrics view settings', actions: [
            { method: toggleTranslation, label: await showTranslation() ? 'Hide translation' : 'Show translation' },
            { method: 'lyricsView.openVst3Manager', label: 'Installed VST3 plug-ins' },
        ] };
    }
    pages.register('home', { title: 'Lyrics view example' }, () => ({
        title: 'Lyrics view example',
        layout: { body: { type: 'column', children: [
            ['current-lyrics', 'Current lyrics'], ['desktop-lyrics', 'Desktop lyrics'],
            ['companion-lyrics', 'Companion lyrics'], [settingsId, 'Lyrics view settings'],
        ].map(([page, label]) => ({ type: 'pageLink', page, label })) } },
    }));
    pages.register(id, { title: 'Current lyrics', presentation: 'lyrics-view',
        settingsPage: settingsId, permissions: ['clipboard:write', 'window:fullscreen'] }, async ({ lyricsView }) => {
        const { document, state } = await lyrics.getCurrent();
        const clock = await playback.getClock();
        const currentTime = clock.trackSequence === state.sequence
            ? clock.positionSeconds * 1000 + (document?.offsetMs ?? 0) : 0;
        const rows = document?.lines ?? [];
        const current = rows.findLastIndex(line => line.timeMs <= currentTime);
        const first = Math.max(0, current - 2);
        const selected = rows.slice(first, first + (lyricsView?.height < 280 ? 5 : 9));
        const translation = await showTranslation();
        return {
            title: document?.title || 'Current lyrics',
            description: document?.artist || 'Play a track to browse its lyrics.',
            rows: selected.map(line => ({ title: line.text, detail: translation ? line.translation ?? '' : '' })),
            actions: document?.plainText ? [{
                method: 'lyricsView.copyText', label: 'Copy lyrics', input: document.plainText,
            }] : [],
        };
    });
    pages.register(settingsId, { title: 'Lyrics view settings', presentation: 'lyrics-settings',
        permissions: ['audio:dsp-ui'] }, settings);
    pages.register('desktop-lyrics', { title: 'Desktop lyrics', presentation: 'desktop-lyrics',
        settingsPage: settingsId, transparent: true }, async () => {
        const [{ document }, clock, palette] = await Promise.all([lyrics.getCurrent(), playback.getClock(), artwork.getPalette()]);
        const progress = clock.durationSeconds > 0 ? Math.max(0, Math.min(1, clock.positionSeconds / clock.durationSeconds)) : 0;
        return { title: 'Desktop lyrics', layout: { body: { type: 'column', children: [
            { type: 'text', text: document?.lines.findLast(line => line.timeMs <= clock.positionSeconds * 1000)?.text ?? document?.title ?? '', size: 24 },
            { type: 'canvas', height: 20, commands: [{ type: 'rect', x: 0, y: 0.45, width: progress, height: 0.1, color: palette?.colors[0] ?? '#6495ed' }] },
        ] } } };
    });
    pages.register('companion-lyrics', { title: 'Companion lyrics', presentation: 'companion-lyrics' }, ({ lyricsView }) => {
        const external = lyricsView?.externalPlayback;
        return { title: external?.title || 'Companion lyrics', description: external?.artist || '',
            rows: external?.line ? [{ title: external.line.text, detail: external.line.translation ?? '' }] : [] };
    });
    stop = lyrics.onChanged(() => { pages.invalidate(id); pages.invalidate('desktop-lyrics'); });
}

export function dispose() { stop?.(); }
