import { randomUUID } from 'node:crypto';

const pageSize = 12;
const action = (label, method, input = null) => ({ label, method, input });
const textField = (id, label, value = '') => ({ id, label, value });

export async function activate({ pluginId, storage, sources, queue, pages }) {
    const source = { plugin: pluginId, provider: 'streams' };
    let stations = await storage.get('stations') ?? [];
    const track = station => ({ providerTrackId: station.id, title: station.title, artist: station.group });
    const groups = () => [...new Set(stations.map(s => s.group).filter(Boolean))];
    function pageOf(items, page, size) {
        const start = (page - 1) * size;
        return { items: items.slice(start, start + size), hasMore: start + size < items.length };
    }
    function find(id) {
        const station = stations.find(s => s.id === id);
        if (!station) throw new Error('这个音源已移除。');
        return station;
    }
    sources.registerProvider(source.provider, { title: '我的音源' }, {
        search({ query, page, pageSize }) {
            const term = query.trim().toLowerCase();
            const result = pageOf(stations.filter(s => [s.title, s.group].some(value => value.toLowerCase().includes(term))), page, pageSize);
            return { tracks: result.items.map(track), hasMore: result.hasMore };
        },
        browse({ collectionId, page, pageSize }) {
            if (collectionId === null) {
                const folders = groups().map(id => ({ id, kind: 'folder', title: id }));
                const result = pageOf([...folders, ...stations.filter(s => !s.group)], page, pageSize);
                return { collections: result.items.filter(i => i.kind), tracks: result.items.filter(i => !i.kind).map(track), hasMore: result.hasMore };
            }
            const result = pageOf(stations.filter(s => s.group === collectionId), page, pageSize);
            return { tracks: result.items.map(track), hasMore: result.hasMore };
        },
        resolve({ providerTrackId }) {
            const station = find(providerTrackId);
            return { title: station.title, artist: station.group, url: station.url };
        },
    });

    const run = pages.registerAction('queue', async ({ data }) => {
        await queue.submit({ mode: data.mode, tracks: [{ kind: 'source', source: data.source, track: data.track }] });
    });
    const controls = (ref, item) => [
        action('播放', run, { mode: 'play', source: ref, track: item }),
        action('加入队列', run, { mode: 'append', source: ref, track: item }),
    ];
    const home = pages.registerAction('home', ({ data }) => libraryPage(data ?? 1));
    const edit = pages.registerAction('edit', ({ data }) => editor(data && find(data)));
    const save = pages.registerAction('save', async ({ data, fields }) => {
        const title = fields.title.trim(), group = fields.group.trim();
        if (!title || title.length > 160 || group.length > 160) throw new Error('请填写名称，名称和分组各限 160 个字符。');
        let url;
        try { url = new URL(fields.url.trim()); } catch { throw new Error('请输入完整的 HTTP 或 HTTPS 音频地址。'); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请使用 HTTP 或 HTTPS 音频地址。');
        if (data) find(data);
        const item = { id: data || randomUUID(), title, group, url: url.href };
        const next = data ? stations.map(s => s.id === data ? item : s) : [item, ...stations];
        await storage.set('stations', next);
        stations = next;
        return libraryPage(1);
    });
    const remove = pages.registerAction('remove', async ({ data }) => {
        find(data);
        const next = stations.filter(s => s.id !== data);
        await storage.set('stations', next);
        stations = next;
        return libraryPage(1);
    });

    function editor(station) {
        const id = station?.id ?? null;
        return { title: station ? '编辑音源' : '添加音源',
            fields: [textField('title', '名称', station?.title), textField('url', '音频直链（HTTP / HTTPS）', station?.url),
                textField('group', '分组（可选）', station?.group)],
            actions: [action('保存', save, id), action('取消', home)],
            ...(id ? { rows: [{ title: '从我的音源移除', actions: [action('移除', remove, id)] }] } : {}) };
    }
    function libraryPage(page) {
        const result = pageOf(stations, page, pageSize);
        return { title: '我的音源',
            description: stations.length ? '' : '添加网络电台或音频直链，即可在 ECHO 全局搜索中找到它。',
            headerActions: [action('添加音源', edit), action('浏览已启用音源', directory),
                ...(page > 1 ? [action('上一页', home, page - 1)] : []),
                ...(result.hasMore ? [action('下一页', home, page + 1)] : [])],
            rows: result.items.map(s => ({ title: s.title, detail: s.group || new URL(s.url).hostname,
                actions: [...controls(source, track(s)), action('编辑', edit, s.id)] })) };
    }

    const directory = pages.registerAction('directory', ({ data }) => directoryPage(data ?? 1));
    const open = pages.registerAction('browse', ({ data }) => catalogPage(data));
    const search = pages.registerAction('search', ({ data, fields }) => catalogPage({ ...data, page: 1, query: fields.query.trim(), collection: null }));
    async function directoryPage(page) {
        const result = pageOf(await sources.list(), page, pageSize);
        return { title: '已启用音源', headerActions: [action('我的音源', home),
            ...(page > 1 ? [action('上一页', directory, page - 1)] : []),
            ...(result.hasMore ? [action('下一页', directory, page + 1)] : [])],
            rows: result.items.map(ref => ({ title: ref.title, detail: ref.plugin, actions: [
                action(ref.browse ? '浏览' : '搜索', open, { ref, page: 1, collection: null, query: '' })] })) };
    }
    async function catalogPage(state) {
        const { ref, collection, query, page } = state;
        const result = query ? await sources.search(ref, query, { page, pageSize }) :
            ref.browse ? await sources.browse(ref, collection, { page, pageSize }) : { tracks: [], collections: [] };
        return { title: state.heading || ref.title,
            headerActions: [action('选择音源', directory), ...(collection ? [action('返回目录', open,
                { ref, page: 1, collection: null, query: '' })] : [])],
            fields: [textField('query', '在此音源中搜索', query)], actions: [action('搜索', search, { ref }),
                ...(page > 1 ? [action('上一页', open, { ...state, page: page - 1 })] : []),
                ...(result.hasMore ? [action('下一页', open, { ...state, page: page + 1 })] : [])],
            rows: [...result.collections.map(c => ({ title: c.title, actions: [action('打开', open,
                { ref, page: 1, query: '', collection: c.id, heading: c.title })] })),
                ...result.tracks.map(t => ({ title: t.title, detail: [t.artist, t.album].filter(Boolean).join(' · '), actions: controls(ref, t) }))] };
    }
    pages.register('stations', { title: '我的音源' }, () => libraryPage(1));
}
