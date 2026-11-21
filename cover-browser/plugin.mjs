import { readFile } from 'node:fs/promises';

const text = (text, role = 'body') => ({ type: 'text', text, role });
const button = (label, method, input = null) => ({ type: 'button', action: { label, method, input } });
const row = (...children) => ({ type: 'row', style: { gap: 12 }, children });
const column = (...children) => ({ type: 'column', children });
const sleeves = await Promise.all([1, 2, 3].map(async n => {
    const bytes = await readFile(new URL(`./sleeve-${n}.jpg`, import.meta.url));
    return 'data:image/jpeg;base64,' + bytes.toString('base64');
}));

const queueLink = { type: 'pageLink', page: 'queue', label: '打开队列窗口' };
const subscriptions = [];

export function activate({ library, queue, playback, pages }) {
    let search = '', shelfPage = 1, trackPage = 1, selected = null;
    const filter = pages.registerAction('filter', ({ fields }) => {
        search = fields.query.trim();
        shelfPage = 1;
        return render();
    });
    const open = pages.registerAction('open', ({ data }) => {
        selected = data;
        trackPage = 1;
        return render();
    });
    const back = pages.registerAction('back', () => {
        selected = null;
        return render();
    });
    const turn = pages.registerAction('turn', ({ data }) => {
        if (selected) trackPage = data;
        else shelfPage = data;
        return render();
    });
    const play = pages.registerAction('play', async ({ data }) => {
        await queue.submit({ mode: 'play', tracks: [{ kind: 'catalog', source: 'Local', id: data }] });
    });

    function pager(page, more) {
        return row(...(page > 1 ? [button('上一页', turn, page - 1)] : []),
            ...(more ? [button('下一页', turn, page + 1)] : []));
    }

    async function render() {
        if (selected) {
            const result = await library.playlistTracks(selected.id, { page: trackPage });
            return {
                title: selected.title,
                layout: {
                    key: JSON.stringify([selected.id, trackPage]),
                    body: column(row(button('返回唱片架', back), queueLink, pager(trackPage, result.hasNext)),
                        ...(!result.entries.length ? [text('这个歌单暂时没有曲目。', 'muted')] : [])),
                    grid: { minItemWidth: 1200, items: result.entries.map(song =>
                        column(row({ type: 'column', style: { grow: true, gap: 2 },
                            children: [text(song.title, 'heading'), text(song.subtitle, 'muted')] },
                            ...(song.playable ? [button('播放', play, song.id)] : [])), { type: 'divider' })) },
                },
            };
        }
        const result = await library.playlists({ page: shelfPage, search });
        const images = {};
        const items = result.entries.map((playlist, index) => {
            const image = String(index % sleeves.length);
            images[image] = sleeves[index % sleeves.length];
            return {
                type: 'pressable', action: { label: playlist.title, method: open, input: { id: playlist.id, title: playlist.title } },
                children: [{ type: 'image', image, height: 166 }, text(playlist.title, 'heading'),
                    text(`${playlist.count} 首曲目`, 'muted')],
            };
        });
        return {
            title: '唱片架',
            fields: [{ id: 'query', label: '歌单名称', value: search }],
            layout: {
                key: JSON.stringify(['shelf', search, shelfPage]), images,
                body: column(row({ type: 'column', style: { width: 300 }, children: [{ type: 'field', id: 'query' }] },
                    button('筛选', filter), queueLink, pager(shelfPage, result.hasNext)),
                    ...(!items.length ? [text(search ? '没有匹配的歌单。' : '创建歌单后，就能在这里浏览。', 'muted')] : [])),
                grid: { minItemWidth: 245, items },
            },
        };
    }
    pages.register('shelf', { title: '唱片架' }, render);

    let offset = 0;
    const previousOffsets = [];
    const toggle = pages.registerAction('toggle', async () => {
        await playback.control({ action: 'toggle' });
        return renderQueue();
    });
    const queuePage = pages.registerAction('queue-page', ({ data }) => {
        if (data > offset) previousOffsets.push(offset);
        offset = data > offset ? data : previousOffsets.pop() ?? 0;
        return renderQueue();
    });

    async function renderQueue() {
        const [state, result] = await Promise.all([playback.get(), queue.get({ offset })]);
        if (offset && !result.items.length) {
            previousOffsets.length = 0;
            offset = 0;
            return renderQueue();
        }
        return {
            title: '播放队列',
            layout: {
                key: String(offset),
                body: column(
                    text(state.title || '尚未选择曲目', 'heading'),
                    ...(state.artist ? [text(state.artist, 'muted')] : []),
                    row(...(result.total ? [button(state.status === 'playing' ? '暂停' : '播放', toggle)] : []),
                        text(`队列 · ${result.total} 首`, 'muted'),
                        ...(offset ? [button('上一页', queuePage, 0)] : []),
                        ...(result.hasNext ? [button('下一页', queuePage, offset + result.items.length)] : [])),
                    { type: 'divider' }),
                grid: { minItemWidth: 1200, items: result.items.map((song, index) =>
                    column(row(text(String(offset + index + 1), 'muted'),
                        { type: 'column', style: { grow: true, gap: 2 },
                            children: [text(song.title, 'heading'), text(song.artist, 'muted')] },
                        ...(result.position === offset + index + 1 ? [text('当前曲目', 'muted')] : [])),
                        { type: 'divider' })) },
            },
        };
    }

    pages.register('queue', { title: '播放队列', window: { width: 560, height: 460 } }, renderQueue);
    let previousStatus;
    subscriptions.push(queue.onChanged(() => pages.invalidate('queue')),
        playback.onTrackChanged(() => pages.invalidate('queue')),
        playback.onChanged(({ status }) => {
            if (status !== previousStatus) pages.invalidate('queue');
            previousStatus = status;
        }));
}

export function dispose() {
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
}
