import { KINDS, LABELS, PAGE_SIZE, TAGS, candidatesFor, fillKinds, lookupKinds, matchesFilter, reportKinds } from './inventory.mjs';

const TITLE = '曲库补全';
const node = (type, children, style) => ({ type, children, style });
const row = (...children) => node('row', children, { align: 'center', gap: 10 });
const column = (...children) => node('column', children, { gap: 9 });
const grow = (...children) => node('column', children, { grow: true, gap: 2 });
const fixed = (width, ...children) => node('column', children, { width, gap: 2 });
const text = (text, role = 'body', size) => ({ type: 'text', text, role, size });
const divider = { type: 'divider' };
const pressable = (label, method, input, children, style) => ({
    type: 'pressable', action: { label, method, input }, children, style,
});
const button = (label, method, input = null) => ({ type: 'button', action: { label, method, input } });
const field = id => ({ type: 'field', id });
const panel = (...children) => node('column', children, { surface: true, padding: 12, gap: 8 });
const readableTitle = track => track.title || '未命名曲目';

function clock(seconds) {
    if (!(seconds > 0)) return '';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function trackSubtitle(track) {
    return [track.artist, track.album, clock(track.duration)].filter(Boolean).join(' · ');
}

function missingDetails(track) {
    if (!track.accessible) return '文件已移动或暂时无法访问';
    if (!track.missingTags.length && !track.missingCover && !track.missingLyrics) return '已补全';
    return [
        ...(track.missingCover ? ['封面'] : []),
        ...(track.missingLyrics ? ['歌词'] : []),
        ...track.missingTags.map(tag => TAGS[tag]),
    ].join('、');
}

function candidateStatus(candidate) {
    if (candidate.albumDiffers) return '专辑版本不同';
    if (candidate.close) return '曲名、艺人和时长接近';
    if (candidate.delta === null) return '请核对版本';
    return `时长相差 ${Math.round(candidate.delta)} 秒`;
}

function lyricsPreview(value) {
    if (value.instrumental) return ['该来源标记为纯音乐。'];
    const document = value.syncedLyrics ?? value.plainLyrics ?? value.karaokeLyrics ?? '';
    return document.split(/\r?\n/).map(line => line.trim())
        .filter(line => line && !line.startsWith('{') && !/^\[[a-z]+:/i.test(line))
        .map(line => line.replace(/^(?:\[\d+:[^\]]*\]|\[\d+,\d+\])+/g, '')
            .replace(/\(\d+,\d+,\d+\)/g, '').trim())
        .filter(Boolean).slice(0, 5).map(line => line.slice(0, 180));
}

function page(title, key, body, items, { fields = [], images = {} } = {}) {
    return { title, fields, layout: { key, body, grid: { minItemWidth: 1200, items }, images } };
}

function feedback(state, actions) {
    const { job, notice } = state;
    return [
        ...(job && job.type !== 'batch' ? [row(
            text(job.cancelled ? '正在停止…' : job.label, 'accent'),
            ...(job.cancellable && !job.cancelled ? [button('停止', actions.cancel)] : []),
        )] : []),
        ...(notice ? [text(notice, 'accent')] : []),
    ];
}

function inventorySummary(state, actions) {
    const { summary, job, filter } = state;
    if (!summary) return panel(row(grow(text('检查本地曲库', 'heading'),
        text('找出缺封面、歌词或文件标签的曲目。', 'muted')),
    ...(!job ? [button('检查曲库', actions.scan)] : [])));

    const metric = (label, value, key) => {
        const active = key === filter;
        const kids = [text(String(value), active ? 'accent' : 'title', 24),
            text(label, active ? 'accent' : 'muted', 13)];
        const style = { width: 105, gap: 1, padding: 4, radius: 6 };
        return key && !active && !job
            ? pressable('筛选' + label, actions.filter, key, kids, style)
            : node('column', kids, style);
    };
    return panel(node('row', [
        metric(state.scanComplete ? '已检查' : '已扫描', summary.scanned),
        metric(LABELS.all, summary.all, 'all'),
        metric('缺封面', summary.cover, 'cover'),
        metric('缺歌词', summary.lyrics, 'lyrics'),
        metric('缺元数据', summary.tags, 'tags'),
        metric(LABELS.inaccessible, summary.inaccessible, 'inaccessible'),
        ...(!job ? [button('重新检查', actions.scan)] : []),
    ], { justify: 'spaceBetween', align: 'center', gap: 8 }));
}

function pagination(pageNumber, previous, next, method) {
    if (previous === null && next === null) return [];
    return [row(
        ...(previous === null ? [] : [button('上一页', method, previous)]),
        text(`第 ${pageNumber} 页`, 'muted'),
        ...(next === null ? [] : [button('下一页', method, next)]),
    )];
}

function gapBadges(track, active) {
    if (!track.accessible) return [fixed(192, text('文件已移动或暂时无法访问', 'muted', 13))];
    const gaps = reportKinds(track);
    return KINDS.map(kind => {
        const missing = gaps.includes(kind);
        const label = kind === 'tags' ? '标签' : LABELS[kind];
        return fixed(kind === 'tags' ? 72 : 50, text(missing
            ? label + (kind === 'tags' ? ` ${track.missingTags.length}` : '')
            : '—', missing && (active === 'all' || active === kind) ? 'accent' : 'muted', 13));
    });
}

function inventory(state, actions) {
    const { tracks, filter, picks, pickCounts, summary, job, batch, pageNumber, more, history } = state;
    const visible = tracks.filter(track => matchesFilter(track, filter));
    const eligible = visible.filter(track => lookupKinds(track, filter).length);
    const scopeTotal = pickCounts[filter] ?? 0;
    const allPicked = eligible.length > 0 && eligible.every(track => picks.has(track.id));
    const allowAll = summary && filter !== 'inaccessible' && (!state.scanComplete || summary.eligible[filter] > 0);
    const selectionLabel = scopeTotal === picks.size
        ? `已选 ${picks.size} 首` : `已选 ${picks.size} 首 · 当前可查 ${scopeTotal} 首`;
    const toolbar = row(
        grow(text(LABELS[filter], 'heading'), text(selectionLabel, picks.size ? 'accent' : 'muted', 13)),
        ...(eligible.length && !job ? [button(allPicked ? '取消全选本页' : '全选本页', actions['pick-page'])] : []),
        ...(picks.size && !job ? [button('清空', actions.clear)] : []),
        ...(scopeTotal && !job ? [button(`查找所选 · ${scopeTotal}`, actions['batch-start'], 'selected')] : []),
        ...(allowAll && !job ? [button('查找当前筛选全部', actions['batch-start'], 'all')] : []),
        ...(batch && !job ? [button('批量结果', actions['batch-open'])] : []),
    );
    const paging = job ? [] : pagination(pageNumber, history.length ? 'previous' : null, more ? 'next' : null, actions.turn);
    const body = column(inventorySummary(state, actions), ...feedback(state, actions),
        ...(summary ? [toolbar, ...paging, divider,
            ...(!job && !visible.length ? [text('此筛选下没有待补全曲目。', 'muted')] : [])] : []));
    const items = visible.map(track => {
        const checked = picks.has(track.id);
        const selectable = !job && lookupKinds(track, filter).length > 0;
        const toggle = selectable ? pressable(
            (checked ? '取消选择 ' : '选择 ') + readableTitle(track), actions.pick, track.id,
            [text(checked ? '✓' : '□', checked ? 'accent' : 'muted', 15)],
            { width: 28, align: 'center', padding: 3, radius: 5, surface: checked },
        ) : fixed(28);
        return column(row(toggle, grow(text(readableTitle(track), 'heading', 15),
            text([track.artist, track.album].filter(Boolean).join(' · '), 'muted', 13)),
        fixed(50, text(clock(track.duration), 'muted', 13)), ...gapBadges(track, filter),
        fixed(88, ...(!job && fillKinds(track).length ? [button('单首补全', actions.review, track.id)] : []))), divider);
    });
    return page(TITLE, `inventory/${filter}/${pageNumber}`, body, items);
}

function batchResults(state, actions) {
    const { batch, job } = state;
    const { rows, scope, current, page: number, count, matched, unmatched, resolved, done } = batch;
    const mode = batch.selection ? '所选曲目' : '当前筛选全部';
    const controls = row(
        grow(text(`${mode} · ${LABELS[scope]}`, 'heading'),
            text(job ? (job.cancelled ? '正在停止…' : current ? `正在查找 · ${current}` : '正在读取曲库')
                : done ? '查找完成' : '已暂停', job ? 'accent' : 'muted', 13)),
        fixed(100, text(`${count} 首`, 'heading'), text('已查找', 'muted', 13)),
        fixed(100, text(`${matched} 首`, 'accent'), text('可复核', 'muted', 13)),
        fixed(100, text(`${resolved} 首`, 'heading'), text('已补全', 'muted', 13)),
        ...(!job ? [button('返回曲库', actions['inventory-open'])] : []),
        ...(!job && !done ? [button('继续查找', actions['batch-resume'])] : []),
        ...(job?.type === 'batch' && !job.cancelled ? [button('停止', actions.cancel)] : []),
    );
    const paging = job ? [] : pagination(number + 1, number ? number - 1 : null,
        (number + 1) * PAGE_SIZE < count ? number + 1 : null, actions['batch-page']);
    const body = column(panel(controls), ...feedback(state, actions),
        ...(!job && unmatched ? [text(`${unmatched} 首暂无候选，可打开曲目调整匹配信息。`, 'muted', 13)] : []),
        ...paging, divider);
    const items = rows.map(item => {
        const names = item.kinds.map(kind => {
            const total = candidatesFor(item.track, kind, item.results[kind]).length;
            return total ? `${LABELS[kind]} ${total}` : '';
        }).filter(Boolean);
        const failed = item.kinds.some(kind => item.results[kind].failures.length);
        const stillMissing = lookupKinds(item.track, scope).length > 0;
        const stage = !stillMissing ? '本批缺项已补全'
            : names.length ? names.join(' · ') : failed ? '暂无候选 · 部分来源不可用' : '暂无候选';
        return column(row(grow(text(readableTitle(item.track), 'heading', 15), text(trackSubtitle(item.track), 'muted', 13)),
            fixed(220, text(stage, names.length ? 'accent' : 'muted', 13)),
            fixed(88, ...(!job && fillKinds(item.track).length ? [button(names.length ? '查看候选' : '单首补全', actions.review, item.track.id)] : []))), divider);
    });
    return page(TITLE, `batch/${number}`, body, items);
}

function review(state, actions) {
    const { detail, job } = state;
    const { track, kind, results, preview, editQuery, query, searched } = detail;
    const kinds = fillKinds(track);
    const images = {};
    const matches = candidatesFor(track, kind, results[kind]);
    const pickKind = type => {
        const count = candidatesFor(track, type, results[type]).length;
        const label = LABELS[type] + (count ? ` · ${count}` : '');
        return type === kind || job ? text(label, type === kind ? 'accent' : 'muted')
            : button(label, actions.kind, type);
    };
    const previewNodes = [];
    if (preview) {
        const { candidate, value } = preview;
        let content;
        if (kind === 'cover') {
            images.cover = value.dataUrl;
            content = [fixed(128, { type: 'image', image: 'cover', height: 128, alt: '候选封面', contain: true })];
        } else if (kind === 'lyrics') {
            const lines = lyricsPreview(value);
            content = lines.length ? lines.map(line => text(line)) : [text('候选包含歌词，可在保存后查看。', 'muted')];
        } else {
            content = value.map(([key, values]) => row(text(TAGS[key], 'muted'), text(values.join(' / '))));
        }
        const candidateDetails = grow(text(`预览${LABELS[kind]}`, 'heading'),
            text([candidate.source, candidate.coverSource, candidate.artist, candidate.album, clock(candidate.duration)].filter(Boolean).join(' · '), 'muted', 13));
        previewNodes.push(panel(kind === 'cover' ? row(...content, candidateDetails) : column(candidateDetails, ...content)),
            ...(!job ? [row(button(kind === 'lyrics' && value.instrumental ? '标记这首为纯音乐' : '补全这首曲目', actions.apply),
                button('关闭预览', actions['close-preview']))] : []));
    }
    const body = column(
        row(...(!job ? [button(detail.returnTo === 'batch' ? '返回批量结果' : '返回曲库', actions['detail-back'])] : []),
            grow(text(trackSubtitle(track), 'muted', 13),
                text(missingDetails(track) === '已补全' ? '已补全' : `缺项 · ${missingDetails(track)}`, 'accent', 13))),
        ...(!track.fileTagsWritable && track.missingLyrics ? [text('文件标签只读，可以保存曲库歌词。', 'muted')] : []),
        ...(kinds.length ? [divider, row(...kinds.map(pickKind)),
            ...(editQuery ? [row(grow(field('title')), grow(field('artist')))] : []),
            ...(!job ? [row(button((matches.length ? '重新查找' : '查找') + LABELS[kind], actions.search),
                button(editQuery ? '收起匹配信息' : '编辑匹配信息', actions['edit-query']))] : []),
        ] : []),
        ...feedback(state, actions), ...previewNodes,
        ...(matches.length ? [text(`${LABELS[kind]}候选 · ${matches.length}`, 'heading'), divider]
            : !job && kinds.includes(kind) && searched.has(kind) ? [text('暂无候选。可以修改匹配信息后重试。', 'muted')] : []),
        ...(!job && kinds.includes(kind) && results[kind].failures.length
            ? [text('暂不可用 · ' + results[kind].failures.join(' / '), 'muted')] : []),
    );
    const rows = matches.map((candidate, index) => column(row(
        grow(text(candidate.title, 'heading'),
            text([candidate.source, candidate.artist, candidate.album, clock(candidate.duration)].filter(Boolean).join(' · '), 'muted')),
        text(candidateStatus(candidate), candidate.albumDiffers ? 'muted' : 'accent'),
        ...(!job ? [button('预览', actions.candidate, index)] : []),
    ), divider));
    const fields = editQuery ? [
        { id: 'title', label: '曲名', value: query.title }, { id: 'artist', label: '艺人', value: query.artist },
    ] : [];
    return page(readableTitle(track), `track/${track.id}/${kind}`, body, rows, { fields, images });
}

export function makeView(state, actions) {
    if (state.screen === 'batch') return batchResults(state, actions);
    if (state.screen === 'detail') return review(state, actions);
    return inventory(state, actions);
}
