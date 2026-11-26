let stops = [];

export function activate({ pages, lyrics, playback, queue, storage, artwork }) {
    const id = 'current-lyrics';
    const settingsId = 'lyrics-settings';
    const showTranslation = async () => await storage.get('translation') !== false;
    const toggleTranslation = pages.registerAction('toggle-translation', async () => {
        await storage.set('translation', !await showTranslation());
        pages.invalidate(id);
        return settings();
    });
    const control = pages.registerAction('transport', async ({ data, lyricsView }) => {
        await playback.control({ action: data });
        return currentLyrics({ lyricsView });
    });
    const seek = pages.registerAction('seek-line', async ({ data, lyricsView }) => {
        await playback.seekTrack(data.sequence, data.seconds);
        return currentLyrics({ lyricsView });
    });
    const scrub = pages.registerAction('seek-timeline', async ({ data, fields, lyricsView }) => {
        await playback.seekTrack(data.sequence, Number(fields.position));
        return currentLyrics({ lyricsView });
    });
    const editQueue = pages.registerAction('queue-item', async ({ data, lyricsView }) => {
        if (data.action === 'play') await queue.playItem(data.queueId, data.occurrenceId);
        else await queue.editItem(data.queueId, data.occurrenceId, { action: data.action });
        return currentLyrics({ lyricsView });
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
    async function currentLyrics({ lyricsView }) {
        const { state: transport, clock } = await playback.getTransport();
        const sequence = clock.trackSequence ?? undefined;
        const [{ document, state }, window] = await Promise.all([
            lyrics.getCurrent({ sequence }),
            queue.getWindow({ queueId: transport.queueId, sequence, before: 0, after: 3 }),
        ]);
        const currentTime = clock.trackSequence === state.sequence
            ? clock.positionSeconds * 1000 + (document?.offsetMs ?? 0) : 0;
        const rows = document?.lines ?? [];
        const current = rows.findLastIndex(line => Number.isFinite(line.timeMs) && line.timeMs <= currentTime);
        const first = Math.max(0, current - 2);
        const selected = rows.slice(first, first + (lyricsView?.height < 280 ? 5 : 9));
        const translation = await showTranslation();
        const lyricRows = selected.map(line => ({
            title: line.text,
            detail: translation ? line.translation ?? '' : '',
            actions: transport.canSeek && sequence === state.sequence && Number.isFinite(line.timeMs) ? [{
                method: seek, label: 'Jump to line',
                input: { sequence, seconds: Math.max(0, (line.timeMs - (document?.offsetMs ?? 0)) / 1000) },
            }] : [],
        }));
        const queueRows = window.items.flatMap((item, offset) => {
            const index = window.offset + offset;
            if (index === window.currentIndex || !item.occurrenceId) return [];
            const target = { queueId: window.queueId, occurrenceId: item.occurrenceId };
            return [{ title: item.title, detail: index === window.nextIndex ? `Up next · ${item.artist}` : item.artist,
                actions: [['play', 'Play'], ['playNext', 'Play next'], ['remove', 'Remove']].map(([action, label]) => ({
                    method: editQueue, label, input: { ...target, action },
                })),
            }];
        });
        return {
            title: document?.title || 'Current lyrics',
            description: document?.artist || 'Play a track to browse its lyrics.',
            headerActions: [
                [transport.canPrevious, 'Previous', 'previous'],
                [transport.canToggle, transport.showPause ? 'Pause' : 'Play', 'toggle'],
                [transport.canNext, 'Next', 'next'],
            ].filter(([enabled]) => enabled).map(([, label, input]) => ({ label, method: control, input })),
            fields: transport.canSeek && sequence !== undefined ? [{
                id: 'position', label: 'Position', value: String(clock.positionSeconds),
                control: { kind: 'range', min: 0, max: clock.durationSeconds, step: 0.1, unit: 's',
                    commit: { method: scrub, input: { sequence } } },
            }] : [],
            rows: [...lyricRows, ...queueRows],
            actions: document?.plainText ? [{
                method: 'lyricsView.copyText', label: 'Copy lyrics', input: document.plainText,
            }] : [],
        };
    }
    pages.register(id, { title: 'Current lyrics', presentation: 'lyrics-view',
        settingsPage: settingsId, permissions: ['clipboard:write', 'window:fullscreen'] }, currentLyrics);
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
    stops = [lyrics.onChanged(() => { pages.invalidate(id); pages.invalidate('desktop-lyrics'); }),
        playback.onTransportChanged(() => pages.invalidate(id))];
}

export function dispose() { stops.forEach(stop => stop()); }
