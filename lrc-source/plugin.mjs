// @ts-check
/** @typedef {import('./echo-workshop.js').WorkshopContext} WorkshopContext */
/** @typedef {import('./echo-workshop.js').WorkshopPage} WorkshopPage */
/** @typedef {import('./echo-workshop.js').WorkshopLyricsCandidate} WorkshopLyricsCandidate */

const defaults = { format: 'synced', limit: 12, instrumental: false };

/** @param {unknown} value */
function preferences(value) {
    if (!value || typeof value !== 'object') return defaults;
    const limit = 'limit' in value ? Number(value.limit) : NaN;
    return {
        format: 'format' in value && value.format === 'fallback' ? 'fallback' : 'synced',
        limit: Number.isInteger(limit) && limit >= 1 && limit <= 24 ? limit : defaults.limit,
        instrumental: 'instrumental' in value && (value.instrumental === true || value.instrumental === 'true'),
    };
}

/** @param {WorkshopContext} context */
export async function activate(context) {
    let options = preferences(await context.storage.get('lookup'));
    /** @param {typeof defaults} next */
    async function update(next) {
        await context.storage.set('lookup', next);
        options = next;
        return settingsPage();
    }

    const save = context.pages.registerAction('save', ({ fields }) => update(preferences(fields)));
    const reset = context.pages.registerAction('reset', () => update(defaults));

    /** @returns {WorkshopPage} */
    function settingsPage() {
        return {
            title: 'LRCLIB 歌词源',
            description: '设置会在下次查询歌词时生效。',
            headerActions: [{ label: '恢复默认', method: reset }],
            fields: [
                { id: 'format', label: '歌词格式', value: options.format, control: { kind: 'choice', options: [
                    { value: 'synced', label: '仅同步歌词' }, { value: 'fallback', label: '允许纯文本' },
                ] } },
                { id: 'limit', label: '最多返回候选', value: String(options.limit), advanced: true,
                  control: { kind: 'range', min: 1, max: 24, step: 1, unit: ' 首' } },
                { id: 'instrumental', label: '接受纯音乐标记', value: String(options.instrumental),
                  control: { kind: 'toggle' } },
            ],
            advancedFieldsLabel: '高级选项',
            actions: [{ label: '保存设置', method: save }],
        };
    }
    context.pages.register('settings', { title: '歌词源设置' }, settingsPage);

    context.lyrics.registerProvider('synced', { title: 'LRCLIB · LRC' }, async ({ track, signal }) => {
        const { format, limit, instrumental } = options;
        const url = new URL('https://lrclib.net/api/search');
        url.searchParams.set('track_name', track.title);
        url.searchParams.set('artist_name', track.artist);
        const response = await fetch(url, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
            headers: { 'User-Agent': 'ECHO Workshop LRCLIB example/1.1' },
        });
        if (!response.ok) throw new Error(`LRCLIB HTTP ${response.status}`);
        /** @type {WorkshopLyricsCandidate[]} */
        const candidates = [];
        for (const record of await response.json()) {
            const candidate = { title: record.trackName, artist: record.artistName,
                album: record.albumName, durationSeconds: record.duration };
            if (record.instrumental && instrumental) candidates.push({ ...candidate, instrumental: true });
            else if (record.syncedLyrics) candidates.push({ ...candidate, syncedLyrics: record.syncedLyrics });
            else if (format === 'fallback' && record.plainLyrics) candidates.push({ ...candidate, plainLyrics: record.plainLyrics });
            if (candidates.length >= limit) break;
        }
        return candidates;
    });
}
