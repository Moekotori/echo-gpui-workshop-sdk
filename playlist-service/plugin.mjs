// Other plugins discover and call these commands through context.commands.core.
const bucket = 'playlists';
const budget = { maxEntries: 2048, maxBytes: 16 * 1024 * 1024 };

function text(value, bytes, required = true) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > bytes || (required && !value.trim())) {
        throw new Error('无效的歌单或曲目信息。');
    }
    return value;
}

function sourceId(id, limit) {
    if (typeof id !== 'string' || id.length > limit || !/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('无效的音源标识。');
    return id;
}

function reference(item) {
    if (item?.kind === 'catalog' && ['Local', 'Legacy'].includes(item.source)) {
        return { kind: 'catalog', source: item.source, id: text(item.id, 4096) };
    }
    if (item?.kind !== 'source') throw new Error('此曲目没有可保存的引用。');
    const { plugin, provider } = item.source;
    const { providerTrackId, title, artist = '', album = '', duration = 0 } = item.track;
    if (!Number.isFinite(duration) || duration < 0) throw new Error('无效的曲目时长。');
    return { kind: 'source', source: { plugin: sourceId(plugin, 80), provider: sourceId(provider, 128) },
        track: { providerTrackId: text(providerTrackId, 512), title: text(title, 4096),
            artist: text(artist, 4096, false), album: text(album, 4096, false), duration } };
}

export function activate({ commands, storage }) {
    const records = storage.records;
    commands.register('list', { title: '列出歌单' }, input =>
        records.list(bucket, { limit: input?.limit ?? 25, before: input?.before }));
    commands.register('get', { title: '读取歌单' }, ({ id }) => records.get(bucket, id));
    commands.register('save', { title: '保存歌单' }, ({ id, title, tracks, revision = null }) => {
        if (!Array.isArray(tracks) || tracks.length > 256) throw new Error('每张歌单最多 256 首。');
        const value = { title: text(title, 256), tracks: tracks.map(reference) };
        if (Buffer.byteLength(JSON.stringify(value)) > 256 * 1024) throw new Error('歌单超过 256 KiB。');
        return records.set(bucket, id, value, { title: value.title, count: tracks.length }, budget, revision);
    });
    commands.register('remove', { title: '删除歌单' }, ({ id, revision }) => {
        if (!Number.isSafeInteger(revision) || revision <= 0) throw new Error('删除前请读取歌单版本。');
        return records.remove(bucket, id, revision);
    });
}
