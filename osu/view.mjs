const accent = '#bb2863';
export const modes = [['osu', 'osu!'], ['taiko', '太鼓'], ['fruits', '接水果'], ['mania', 'mania']];
const views = [['bp', 'BP'], ['favourites', '收藏'], ['mostPlayed', '最多游玩'], ['created', '发布谱面'], ['search', '搜索谱面']];
const headings = { bp: 'Best Performance', favourites: '收藏谱面', mostPlayed: '最多游玩', created: '发布谱面', search: '搜索谱面' };
const sources = [['sayobot', '小夜 / Sayobot'], ['nerinyan', 'Nerinyan'], ['mino', 'Mino'], ['official', 'osu! 官网']];
const statuses = { ranked: 'Ranked', approved: 'Approved', qualified: 'Qualified', loved: 'Loved', pending: 'Pending', wip: 'WIP', graveyard: 'Graveyard' };
const categories = [['all', '全部发布'], ['ranked', '已上架'], ['loved', 'Loved'], ['pending', '待定 / WIP'], ['graveyard', '坟场']];

const row = (children, style = {}) => ({ type: 'row', children, style });
const column = (children, style = {}) => ({ type: 'column', children, style });
const text = (text, role = 'body', size, options = {}) => ({ type: 'text', text: String(text ?? ''), role, size, ...options });
const icon = (glyph, size) => ({ type: 'icon', glyph, size });
const divider = { type: 'divider' };
const action = (operation, data = {}) => ({ method: 'original.panel', input: { operation, ...data } });
const button = (label, operation, options = {}) => ({
    type: 'button', action: { label, ...action(operation, options.data) },
    appearance: options.appearance ?? 'quiet', icon: options.icon, iconOnly: options.iconOnly, selected: options.selected,
});
const link = (page, label, icon) => ({ type: 'pageLink', page, label, icon });
const control = (id, hideLabel = true) => ({ type: 'field', id, compact: true, hideLabel });
const form = (id, label, value = '', operation, options = {}) => ({
    id, label, value, placeholder: label, submit: operation && action(operation), ...options,
});
const choice = (id, label, value, options) => ({
    id, label, value: String(value),
    control: { kind: 'choice', options: options.map(([value, label]) => ({ value: String(value), label })) },
});
const stroke = { border: true, radius: 9 };
const number = (value, digits = 0) => value == null || !Number.isFinite(Number(value)) ? '—'
    : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
const coverId = set => 'map-' + set;
const hasMode = view => ['bp', 'mostPlayed', 'search'].includes(view);

function picture(images, image, height, width, radius, glyph) {
    if (images[image]) return { type: 'image', image, width, height, radius };
    return column([icon(glyph, height >= 80 ? 26 : 19)], {
        width, minHeight: height, surface: true, align: 'center', justify: 'center', radius,
    });
}

function segmented(options, current, operation, key) {
    return row(options.map(([value, label]) => button(label, operation, {
        appearance: 'tab', selected: value === current, data: { [key]: value },
    })), { gap: 3 });
}

function profileCard(data, filters, images) {
    const profile = data?.profile;
    if (!profile) return undefined;
    const metrics = [
        ['全球排名', profile.globalRank ? '#' + number(profile.globalRank) : '—'],
        ['地区排名', profile.countryRank ? '#' + number(profile.countryRank) : '—'],
        ['PP', number(profile.pp, 1)],
        ['准确率', profile.accuracy == null ? '—' : number(profile.accuracy, 2) + '%'],
        ['游玩次数', number(profile.playCount)],
    ];
    return row([
        row([
            picture(images, 'avatar', 52, 52, 26, 'user'),
            column([text(profile.username, 'heading', 23, { truncate: true }),
                text([profile.country, modes.find(mode => mode[0] === (data.mode === 'all' ? 'osu' : filters.mode))?.[1]].filter(Boolean).join(' · '), 'muted', 12)], { gap: 4, width: 178 }),
        ], { gap: 13, nowrap: true }),
        row(metrics.map(([label, value]) => column([text(label, 'muted', 11), text(value, 'heading', 17)], { width: 83, gap: 4 })), { gap: 10 }),
    ], { tint: accent, border: true, radius: 12, paddingX: 16, paddingY: 11, justify: 'spaceBetween', gap: 16 });
}

function preferences({ source, queue, api, login, data }, fields) {
    if (!api?.connected) fields.push(
        form('api-user', 'API 用户', '', undefined),
        form('api-key', 'API Key', '', 'apiLogin', { secret: true }),
    );
    return column([
        row([text('下载设置', 'heading', 14), text(queue?.directory ? '存放于 ' + queue.directory.split(/[\\/]/u).filter(Boolean).at(-1) : '未选择存放目录', 'muted', 12),
            button('选择文件夹', 'directory', { icon: 'folder', appearance: 'outline' })], { gap: 8 }),
        segmented(sources, source, 'source', 'source'),
        divider,
        row([
            text('账号与状态', 'heading', 14),
            ...(api?.connected ? [button('断开 API', 'apiLogout')] : [
                column([control('api-user')], { width: 156 }),
                column([control('api-key')], { width: 170 }),
                button('连接 API', 'apiLogin', { appearance: 'outline' }),
            ]),
            ...(login?.connected || data?.connected ? [button('退出登录', 'logout')] : []),
            button('清除 Steam 状态', 'clearPresence'),
        ], { gap: 8 }),
    ], { gap: 10, padding: 12, ...stroke });
}

function queueStrip(queue, highlighted, data, filters, showQueue) {
    const progress = queue?.queue;
    if (!highlighted.size && !progress?.total && !progress?.busy && !progress?.error && !showQueue) return undefined;
    const active = progress?.active;
    const received = queue?.receivedBytes ?? 0;
    const percent = queue?.totalBytes > 0 ? Math.min(100, Math.floor(received / queue.totalBytes * 100)) : null;
    const task = active ? [
        active.title,
        queue.phase === 'importing' ? '正在导入' : percent == null ? '下载中' : percent + '%',
    ].join(' · ') : progress?.error || progress?.lastFailure?.error || (progress?.total ? `已完成 ${progress.completed}/${progress.total} · 入库 ${progress.importedCount} 首` : '下载队列为空');
    return row([
        ...(highlighted.size ? [
            text('已选 ' + highlighted.size + ' 个谱面集', 'heading', 13),
            button('加入下载队列', 'downloadSelected', { icon: 'download', appearance: 'primary' }),
            button('清空', 'clearSelection'),
        ] : [text('下载队列', 'heading', 13)]),
        ...(progress?.total || progress?.busy || showQueue ? [text(task, 'muted', 12)] : []),
        ...(progress?.busy ? [button('取消队列', 'cancelQueue')] : []),
        ...(showQueue && filters.view === 'bp' && data?.userId ? [button('下载全部 BP', 'allBP', { icon: 'download' })] : []),
    ], { tint: accent, radius: 8, paddingX: 10, paddingY: 4, gap: 8 });
}

function scoreActions(item, state, wall) {
    const trackId = state.imported.get(item.beatmapsetId);
    const selected = state.highlighted.has(item.beatmapsetId);
    return [
        ...(trackId ? [button('播放', 'play', { icon: 'play', appearance: 'outline', data: { trackId } })]
            : item.downloadable ? [
                button('下载并导入', 'download', { icon: 'download', iconOnly: true, appearance: 'outline', data: { id: item.beatmapsetId } }),
                button(selected ? '取消选择' : '加入多选', 'select', { icon: 'check', iconOnly: true, selected, data: { id: item.beatmapsetId } }),
            ] : [text('不可下载', 'muted', 11)]),
        ...(item.rank && state.data.isOwnProfile ? [button(wall ? 'Steam 状态' : '设为 Steam 状态', 'presence', { data: { beatmapId: item.beatmapId } })] : []),
    ];
}

function scoreDan(item, state) {
    const entry = state.dan.get(item);
    if (!entry) return [];
    const { chart, result, multiple } = entry;
    const [rc, ln] = result?.label.split(' || ') ?? [];
    const summary = result ? [
        text(result.keys + 'K', 'accent', 11),
        text('RC ' + rc, 'accent', 11),
        ...(ln ? [text(ln, 'accent', 11)] : []),
    ] : [text(result === null ? '段位暂不可用' : '段位计算中…', 'muted', 11)];
    return [row([
        ...(multiple ? [button('切换段位难度 · ' + chart.difficulty, 'danDifficulty', {
            icon: 'right', data: { id: item.beatmapsetId },
        })] : []),
        ...summary,
    ], { gap: 8 })];
}

function scoreDetails(item) {
    const difficulty = item.difficulty ?? [item.mapper, item.modes?.join(' / ')].filter(Boolean).join(' · ');
    const stars = item.stars == null ? '' : number(item.stars, 2) + '★';
    const sub = [item.artist, difficulty, stars].filter(Boolean).join('  ·  ');
    const metric = item.pp != null ? number(item.pp, 2) + ' pp' : item.playCount != null
        ? number(item.playCount) + ' 次' : statuses[item.status] ?? item.status ?? '';
    const facts = item.accuracy == null
        ? item.difficultyCount ? `${item.difficultyCount} 个难度` : ''
        : [number(item.accuracy, 2) + '%', item.grade, Array.isArray(item.mods) ? item.mods.join('') : item.mods].filter(Boolean).join(' · ');
    return { sub, metric, facts };
}

function scoreRow(item, index, state, images) {
    const { sub, metric, facts } = scoreDetails(item);
    const rank = item.rank ? '#' + item.rank : String(state.offset + index + 1);
    if (state.wall) {
        return column([
            picture(images, coverId(item.beatmapsetId), 112, undefined, 8, 'music'),
            column([
                row([text(rank, 'muted', 11), text(metric, 'accent', 13)], { justify: 'spaceBetween' }),
                text(item.title, 'heading', 15, { truncate: true }),
                text(sub, 'muted', 11, { truncate: true }),
                ...scoreDan(item, state),
                row(scoreActions(item, state, true), { gap: 5 }),
            ], { gap: 6, padding: 8 }),
        ], stroke);
    }
    return row([
        column([text(rank, item.rank && item.rank <= 3 ? 'accent' : 'muted', 12)], { width: 34 }),
        picture(images, coverId(item.beatmapsetId), 48, 86, 6, 'music'),
        column([
            text(item.title, 'heading', 14, { truncate: true }),
            text(sub, 'muted', 11, { truncate: true }),
            ...scoreDan(item, state),
        ], { grow: true, gap: 4 }),
        column([text(metric, 'heading', 15), text(facts, 'muted', 11, { truncate: true })],
            { width: 104, align: 'end', gap: 3 }),
        row(scoreActions(item, state, false), { gap: 5, justify: 'end' }),
    ], { borderBottom: true, paddingY: 7, gap: 10, minHeight: 61, nowrap: true });
}

function emptyState(filters, data) {
    const label = filters.view === 'search' ? !filters.query
        ? '输入谱面关键词' : !data?.connected ? '登录后搜索谱面' : '没有找到谱面'
        : !data?.canBrowse ? '输入用户名、用户 ID 或主页链接' : '这一页没有谱面';
    return column([icon(filters.view === 'search' ? 'search' : 'music', 24), text(label, 'muted', 13)], {
        align: 'center', justify: 'center', minHeight: 132, gap: 10,
    });
}

export function browsePage(state, images) {
    const { filters, draft, data, login, api, wall, offset, showSettings, showQueue, queue, highlighted } = state;
    const fields = [form('user', '用户名、用户 ID 或主页链接', draft.user, 'browse')];
    const entries = data?.rows ?? [];
    const showingSearch = filters.view === 'search';
    if (showingSearch) fields.push(form('query', '谱面关键词 / key=4 status=ranked', draft.query, 'search'));
    const resultCount = entries.length ? `${offset + 1}–${offset + entries.length}${data.total == null ? '' : ' / ' + number(data.total)}` : '';
    const pager = row([
        ...(!showingSearch && !(filters.view === 'bp' && api?.connected)
            ? [segmented([['20', '20'], ['50', '50'], ['100', '100']], String(state.pageSize), 'size', 'size')] : []),
        ...(offset > 0 ? [button('上一页', 'paginate', { icon: 'left', iconOnly: true, data: { direction: -1 } })] : []),
        ...(offset > 0 || data?.hasMore ? [text(String(Math.floor(offset / state.pageSize) + 1), 'heading', 12)] : []),
        ...(data?.hasMore ? [button('下一页', 'paginate', { icon: 'right', iconOnly: true, data: { direction: 1 } })] : []),
    ], { gap: 3 });
    const toolButtons = row([
        link('mania-preview', 'mania 预览', 'music'),
        button(login?.loginOpen ? '确认登录' : login?.connected || data?.connected ? '我的账号' : '登录 osu!',
            login?.loginOpen ? 'identify' : login?.connected || data?.connected ? 'self' : 'login', { icon: 'user' }),
        button('插件设置', 'settings', { icon: 'settings', selected: showSettings, iconOnly: true }),
    ], { gap: 3 });
    const body = [
        row([
            row([
                column([control('user')], { width: 278 }),
                button('查看用户', 'browse', { appearance: 'primary', icon: 'search' }),
                ...(data?.userId ? [button('刷新用户资料', 'refresh', { icon: 'refresh', iconOnly: true })] : []),
            ], { gap: 6 }),
            toolButtons,
        ], { justify: 'spaceBetween', gap: 8 }),
        profileCard(data, filters, images),
        ...(showSettings ? [preferences(state, fields)] : []),
        row([
            segmented(views, filters.view, 'view', 'view'),
            ...(hasMode(filters.view) ? [segmented([
                ...(filters.view !== 'bp' ? [['all', '全部模式']] : []), ...modes,
            ], filters.mode, 'mode', 'mode')] : []),
        ], { justify: 'spaceBetween', borderBottom: true, paddingY: 3, gap: 6 }),
        ...(showingSearch ? [row([
            column([control('query')], { grow: true, width: 310 }),
            button('搜索谱面', 'search', { appearance: 'primary', icon: 'search' }),
        ], { gap: 8 })] : []),
        ...(filters.view === 'created' ? [segmented(categories, filters.category, 'category', 'category')] : []),
        queueStrip(queue, highlighted, data, filters, showQueue),
        state.notice ? text(state.notice, 'accent', 13) : undefined,
        row([
            row([text(headings[filters.view], 'heading', 19), text(resultCount, 'muted', 12)], { gap: 10 }),
            row([
                pager,
                button('列表', 'layout', { icon: 'list', iconOnly: true, selected: !wall, data: { wall: false } }),
                button('封面墙', 'layout', { icon: 'grid', iconOnly: true, selected: wall, data: { wall: true } }),
                button('下载队列', 'queue', { icon: 'download', iconOnly: true, selected: showQueue }),
            ], { gap: 3 }),
        ], { gap: 8, justify: 'spaceBetween' }),
        ...(entries.length ? [] : [emptyState(filters, data)]),
    ].filter(Boolean);
    return {
        title: 'osu!', fields,
        layout: {
            key: [filters.view, filters.mode, filters.category, data?.userId, filters.query, offset].join('/'),
            maxWidth: 1120, accent, images,
            body: column(body, { gap: 10 }),
            grid: {
                minItemWidth: wall ? 230 : 950, maxColumns: wall ? 4 : 1, gap: wall ? 12 : 0,
                items: entries.map((item, index) => scoreRow(item, index, state, images)),
            },
        },
    };
}

export function previewPage({ directory, name, maps, difficulty, speed, notes, status, picker, entries, offset, hasMore }) {
    const fields = [];
    if (maps.length) {
        fields.push(choice('difficulty', '谱面难度', difficulty, maps.map((map, index) => [index, map.name])));
        fields.push(choice('speed', '下落流速', speed,
            [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map(value => [value, value + '×'])));
    }
    if (notes) fields.push(form('seek', '跳转到（秒）', '', 'previewSeek'));
    const position = status?.currentTrackId === notes?.trackId ? status?.positionSeconds : null;
    const playing = position != null && status?.state === 'playing';
    const body = [
        row([
            row([text(name || '已导入谱面', 'heading', 19),
                ...(notes ? [text(notes.keys + 'K · ' + number(notes.count) + ' 个音符', 'muted', 12)] : []),
                button(name ? '切换谱面' : '选择谱面', 'previewPicker', { icon: 'list', selected: picker })], { gap: 8 }),
            row([button('存放目录', 'previewDirectory', { icon: 'folder' }), link('osu', '返回 osu!', 'left')], { gap: 4 }),
        ], { justify: 'spaceBetween', borderBottom: true, gap: 8, paddingY: 4 }),
        ...(picker || !name ? [directory && entries.length
            ? column([
                ...entries.map(entry => row([
                    column([text(entry.title, 'heading', 13, { truncate: true }), text(entry.detail, 'muted', 11)], { grow: true, gap: 2 }),
                    button('选择', 'previewSet', { data: { id: entry.id }, appearance: 'outline' }),
                ], { borderBottom: true, paddingY: 4, nowrap: true })),
                row([
                    ...(offset ? [button('上一页', 'previewPage', { icon: 'left', data: { step: -1 } })] : []),
                    ...(hasMore ? [button('下一页', 'previewPage', { icon: 'right', data: { step: 1 } })] : []),
                ], { justify: 'end' }),
            ], { paddingX: 10, paddingY: 4, gap: 3, ...stroke })
            : text(directory ? '此目录暂无导入回执' : '先选择下载谱面时使用的目录', 'muted', 13)] : []),
        ...(maps.length ? [row([
            control('difficulty', false), control('speed', false),
            button('应用难度与流速', 'previewLoad', { appearance: 'outline' }),
        ], { gap: 10, align: 'end' })] : []),
        ...(notes ? [
            { type: 'rhythmStage' },
            row([
                button(playing ? '暂停' : '播放', 'previewPlay', { icon: playing ? 'pause' : 'play', appearance: 'primary' }),
                column([control('seek')], { width: 118 }),
                button('跳转', 'previewSeek', { appearance: 'outline' }),
            ], { gap: 6 }),
        ] : [
            column([icon('music', 30), text('选中 mania 谱面后在此预览', 'body', 13, { color: '#f0d9e7' })], {
                minHeight: 238, background: '#181621', radius: 12, align: 'center', justify: 'center', gap: 9,
            }),
        ]),
    ];
    return {
        title: 'mania 谱面预览', fields,
        ...(notes ? { rhythmPreview: {
            lanes: notes.keys, notes: notes.notes, trackId: notes.trackId,
            leadMs: Math.round(1800 / speed),
        } } : {}),
        layout: { key: 'mania', maxWidth: 1120, accent, body: column(body, { gap: 10 }) },
    };
}
