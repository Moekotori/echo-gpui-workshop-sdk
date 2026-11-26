import { createProviders } from './providers.mjs';
import { makeView } from './view.mjs';
import { BatchStore, batchDisposition, compareIds } from './batch.mjs';
import {
    KINDS, LABELS, PAGE_SIZE, candidatesFor, defaultQuery, emptyResults,
    fieldsFor, fillKinds, lookupKinds, matchesFilter, reportKinds,
} from './inventory.mjs';

const PAGE = 'library-enrichment';
const yieldToHost = () => new Promise(resolve => setTimeout(resolve, 0));
let stop;

export function activate({ library, lyrics, artwork, network, pages }) {
    const { providers, readLyrics } = createProviders(network);
    const pickCounts = { all: 0, cover: 0, lyrics: 0, tags: 0 };
    const state = {
        summary: null, scanComplete: false, filter: 'all', tracks: [], more: false,
        cursor: null, history: [], pageNumber: 1, picks: new Map(), pickCounts,
        screen: 'inventory', batch: null, detail: null, job: null, notice: '',
    };
    const actions = {};
    let stopped = false;
    const refresh = () => { if (!stopped) pages.invalidate(PAGE); };
    const render = () => makeView(state, actions);
    const register = (name, handler, duringJob = false) => {
        actions[name] = pages.registerAction(name, async request => {
            if (!state.job || duringJob) await handler(request);
            return render();
        });
    };

    function launch(label, work, { cancellable = true, type = '' } = {}) {
        state.notice = '';
        const task = { label, type, cancelled: false, cancellable };
        state.job = task;
        task.finished = yieldToHost().then(async () => {
            if (task.cancelled) return;
            try { await work(task); }
            catch (error) { if (!task.cancelled) state.notice = String(error?.message ?? error); }
        }).finally(() => {
            if (state.job === task) {
                state.job = null;
                refresh();
            }
        });
    }

    function resetList(filter) {
        Object.assign(state, { filter, tracks: [], cursor: null, more: false, history: [], pageNumber: 1 });
    }

    function takeBatch() {
        const old = state.batch;
        state.batch = null;
        return old?.store?.close();
    }

    function updatePick(id, scopes) {
        const previous = state.picks.get(id);
        if (previous) for (const scope of previous) pickCounts[scope]--;
        if (scopes.length) {
            state.picks.set(id, scopes);
            for (const scope of scopes) pickCounts[scope]++;
        } else state.picks.delete(id);
    }

    function trackScopes(track) {
        const kinds = fillKinds(track);
        return kinds.length ? ['all', ...kinds] : [];
    }

    function clearPicks() {
        state.picks.clear();
        for (const scope of Object.keys(pickCounts)) pickCounts[scope] = 0;
    }

    register('scan', () => launch('正在检查曲库', async task => {
        await takeBatch();
        state.summary = { scanned: 0, all: 0, cover: 0, lyrics: 0, tags: 0, inaccessible: 0,
            eligible: { all: 0, cover: 0, lyrics: 0, tags: 0 } };
        state.scanComplete = false;
        clearPicks();
        resetList('all');
        let after = null;
        let lastRefresh = 0;
        do {
            const batch = await library.enrichment.scan(after);
            if (task.cancelled) return;
            for (const track of batch.tracks) {
                state.summary.scanned++;
                for (const scope of trackScopes(track)) state.summary.eligible[scope]++;
                for (const key of Object.keys(LABELS)) {
                    if (matchesFilter(track, key)) state.summary[key]++;
                }
                if (matchesFilter(track, 'all')) {
                    if (state.tracks.length < PAGE_SIZE) state.tracks.push(track);
                    else state.more = true;
                }
            }
            after = batch.next;
            if (Date.now() - lastRefresh >= 300) {
                lastRefresh = Date.now();
                refresh();
            }
            await yieldToHost();
        } while (after && !task.cancelled);
        state.scanComplete = !task.cancelled;
    }, { type: 'scan' }));

    async function inspectPage(after, filter, task) {
        const tracks = [];
        do {
            const batch = await library.enrichment.scan(after);
            if (task.cancelled) return;
            tracks.push(...batch.tracks.filter(track => matchesFilter(track, filter)));
            after = batch.next;
            if (!after || tracks.length > PAGE_SIZE) break;
            await yieldToHost();
        } while (!task.cancelled);
        if (task.cancelled) return;
        state.tracks = tracks.slice(0, PAGE_SIZE);
        state.more = tracks.length > PAGE_SIZE;
        for (const track of state.tracks) {
            if (state.picks.has(track.id)) updatePick(track.id, trackScopes(track));
        }
    }

    register('filter', ({ data }) => {
        if (!Object.hasOwn(LABELS, data) || data === state.filter) return;
        launch('正在打开筛选结果', async task => {
            await inspectPage(null, data, task);
            if (!task.cancelled) Object.assign(state, { filter: data, cursor: null, history: [], pageNumber: 1 });
        });
    });
    register('turn', ({ data }) => {
        const next = data === 'next';
        if (next ? !state.more || !state.tracks.length : !state.history.length) return;
        launch('正在加载曲目', async task => {
            const after = next ? state.tracks.at(-1).id : state.history.at(-1);
            await inspectPage(after, state.filter, task);
            if (task.cancelled) return;
            if (next) {
                state.history.push(state.cursor);
                if (state.history.length > 128) state.history.shift();
            } else state.history.pop();
            state.cursor = after;
            state.pageNumber += next ? 1 : -1;
        });
    });
    register('cancel', () => {
        if (state.job?.cancellable) state.job.cancelled = true;
    }, true);

    register('pick', ({ data }) => {
        const track = state.tracks.find(track => track.id === data);
        if (!track || !lookupKinds(track, state.filter).length) return;
        updatePick(data, state.picks.has(data) ? [] : trackScopes(track));
    });
    register('pick-page', () => {
        const eligible = state.tracks.filter(track => lookupKinds(track, state.filter).length);
        const clear = eligible.every(track => state.picks.has(track.id));
        for (const track of eligible) updatePick(track.id, clear ? [] : trackScopes(track));
    });
    register('clear', clearPicks);

    async function lookup(track, query, kinds, results, task, update) {
        for (const kind of kinds) results[kind] = { matches: [], failures: [] };
        if (!query.title) return;
        for (const provider of providers) {
            if (task.cancelled) return;
            const supported = kinds.filter(kind => provider.kinds.includes(kind));
            if (!supported.length) continue;
            let groups, failure;
            try { groups = await provider.lookup(track, query, supported); }
            catch (error) { failure = `${provider.title} · ${String(error?.message ?? error).slice(0, 72)}`; }
            if (task.cancelled) return;
            for (const kind of supported) {
                if (failure) results[kind].failures.push(failure);
                else {
                    const sorted = [...results[kind].matches, ...groups[kind]].sort((a, b) => b.score - a.score);
                    results[kind].matches = sorted;
                }
            }
            update?.();
            await yieldToHost();
        }
    }

    async function findBatch(batch, task) {
        batch.store ??= await BatchStore.create();
        while (!task.cancelled && !batch.done) {
            const { selection } = batch;
            if (selection && batch.selectionOffset === selection.length) {
                batch.done = true;
                break;
            }
            const after = selection
                ? (BigInt(selection[batch.selectionOffset]) - 1n).toString()
                : batch.after;
            const result = await library.enrichment.scan(after);
            for (const track of result.tracks) {
                if (task.cancelled) break;
                if (selection) {
                    while (batch.selectionOffset < selection.length && compareIds(selection[batch.selectionOffset], track.id) < 0) {
                        batch.selectionOffset++;
                    }
                    if (selection[batch.selectionOffset] !== track.id) continue;
                }
                const kinds = lookupKinds(track, batch.scope);
                if (kinds.length) {
                    const item = { index: batch.count, track, kinds, query: defaultQuery(track), searched: kinds, results: emptyResults() };
                    batch.current = track.title || '未命名曲目';
                    refresh();
                    await lookup(track, item.query, kinds, item.results, task);
                    if (task.cancelled) break;
                    await batch.store.put(item.index, item);
                    batch.count++;
                    batch[batchDisposition(item, batch.scope)]++;
                    if (Math.floor(item.index / PAGE_SIZE) === batch.page) batch.rows.push(item);
                }
                if (selection) batch.selectionOffset++;
                batch.after = track.id;
            }
            batch.current = '';
            if (!task.cancelled && !result.next) batch.done = true;
            refresh();
            await yieldToHost();
        }
        if (task.cancelled) state.notice = '已停止。可以复核已找到的候选，或继续查找。';
    }

    function runBatch(previous) {
        launch('正在查找在线候选', async task => {
            await previous;
            try { await findBatch(state.batch, task); }
            finally { state.batch.current = ''; }
        }, { type: 'batch' });
    }

    register('batch-start', ({ data }) => {
        const scope = state.filter;
        if (scope === 'inaccessible') return;
        const selection = data === 'all' ? null : Array.from(state.picks)
            .filter(([, scopes]) => scopes.includes(scope)).map(([id]) => id).sort(compareIds);
        if (selection && !selection.length) return;
        const previous = takeBatch();
        state.batch = { scope, selection, selectionOffset: 0, after: null, store: null, done: false,
            count: 0, matched: 0, unmatched: 0, resolved: 0, current: '', page: 0, rows: [] };
        state.screen = 'batch';
        runBatch(previous);
    });
    register('batch-resume', () => runBatch());
    register('batch-page', async ({ data }) => {
        const batch = state.batch;
        if (!batch?.store || !Number.isInteger(data) || data < 0 || data * PAGE_SIZE >= batch.count) return;
        const start = data * PAGE_SIZE;
        try {
            const rows = await batch.store.range(start, Math.min(PAGE_SIZE, batch.count - start));
            batch.rows = rows;
            batch.page = data;
            state.notice = '';
        } catch (error) {
            state.notice = String(error?.message ?? error);
        }
    });
    register('batch-open', () => {
        if (state.batch) {
            state.screen = 'batch';
            state.notice = '';
        }
    });
    register('inventory-open', () => {
        state.screen = 'inventory';
        state.notice = '';
    });
    register('review', ({ data }) => {
        const item = state.batch?.rows.find(item => item.track.id === data);
        const track = (state.screen === 'batch' ? item?.track : state.tracks.find(track => track.id === data));
        if (!track) return;
        const kinds = fillKinds(track);
        if (!kinds.length) return;
        const results = item ? structuredClone(item.results) : emptyResults();
        const scope = state.screen === 'batch' ? state.batch.scope : state.filter;
        const preferred = kinds.includes(scope) ? scope : kinds[0];
        const kind = (candidatesFor(track, preferred, results[preferred]).length ? preferred
            : kinds.find(kind => candidatesFor(track, kind, results[kind]).length)) ?? preferred;
        state.detail = { track, kind, query: item?.query ?? defaultQuery(track),
            results, preview: null, editQuery: false, returnTo: state.screen, searched: new Set(item?.searched), item };
        state.screen = 'detail';
        state.notice = '';
    });
    register('detail-back', () => {
        state.screen = state.detail.returnTo;
        state.detail = null;
        state.notice = '';
    });
    register('kind', ({ data }) => {
        const detail = state.detail;
        if (fillKinds(detail.track).includes(data)) {
            detail.kind = data;
            detail.preview = null;
            state.notice = '';
        }
    });
    register('edit-query', () => { state.detail.editQuery = !state.detail.editQuery; });

    register('search', ({ fields }) => {
        const detail = state.detail;
        const query = detail.editQuery
            ? { title: (fields?.title ?? detail.query.title).trim().slice(0, 256),
                artist: (fields?.artist ?? detail.query.artist).trim().slice(0, 256) } : detail.query;
        if (!query.title) {
            state.notice = '请输入用来匹配的曲名。';
            detail.editQuery = true;
            return;
        }
        if (query.title !== detail.query.title || query.artist !== detail.query.artist) {
            Object.assign(detail.results, emptyResults());
            detail.searched.clear();

        }
        detail.query = query;
        detail.editQuery = false;
        detail.preview = null;
        const kind = detail.kind;
        launch(`正在查找${LABELS[kind]}`, async task => {
            detail.searched.add(kind);
            const before = detail.item && batchDisposition(detail.item, state.batch.scope);
            await lookup(detail.track, query, [kind], detail.results, task, refresh);
            if (!task.cancelled) await saveBatchItem(detail, before);
        });
    });

    register('candidate', ({ data }) => {
        const detail = state.detail;
        const { track, kind, results } = detail;
        const candidate = candidatesFor(track, kind, results[kind])[data];
        if (!candidate) return;
        detail.preview = null;
        launch('正在读取候选', async task => {
            let value;
            if (kind === 'cover') {
                value = await artwork.previewUrl(candidate.cover);
                if (!value) throw new Error('这张封面无法预览，可以换一个候选。');
            } else if (kind === 'lyrics') {
                value = await readLyrics(candidate);
                if (!value.instrumental && !value.syncedLyrics && !value.plainLyrics && !value.karaokeLyrics) {
                    throw new Error('这个来源未返回可用歌词。');
                }
            } else value = fieldsFor(track, candidate);
            if (!task.cancelled) detail.preview = { candidate, value };
        });
    });
    register('close-preview', () => { state.detail.preview = null; });

    async function saveBatchItem(detail, previous) {
        if (!detail.item) return;
        const batch = state.batch;
        const item = { ...detail.item, track: detail.track, query: detail.query, results: detail.results,
            searched: [...detail.searched] };
        await batch.store.put(item.index, item);
        const disposition = batchDisposition(item, batch.scope);
        batch[previous]--;
        batch[disposition]++;
        batch.rows[item.index % PAGE_SIZE] = item;
        detail.item = item;
    }

    function recordWrite(track, changes) {
        const oldKinds = reportKinds(track);
        const oldScopes = trackScopes(track);
        const pageTrack = state.tracks.find(other => other.id === track.id);
        Object.assign(track, changes);
        if (pageTrack) Object.assign(pageTrack, changes);
        const scopes = trackScopes(track);
        if (state.summary) {
            const current = reportKinds(track);
            for (const key of oldKinds.filter(kind => !current.includes(kind))) {
                state.summary[key] = Math.max(0, state.summary[key] - 1);
            }
            if (oldKinds.length && !current.length) state.summary.all = Math.max(0, state.summary.all - 1);
            for (const key of oldScopes.filter(scope => !scopes.includes(scope))) {
                state.summary.eligible[key] = Math.max(0, state.summary.eligible[key] - 1);
            }
        }
        if (state.picks.has(track.id)) updatePick(track.id, scopes);
    }

    register('apply', () => {
        const detail = state.detail;
        const { track, kind, preview } = detail;
        if (!preview) return;
        launch('正在保存这首曲目', async () => {
            const before = detail.item && batchDisposition(detail.item, state.batch.scope);
            let changed = false;
            if (kind === 'lyrics') {
                await lyrics.fillMissing(track.id, preview.value);
                recordWrite(track, { missingLyrics: false });
                changed = true;
                state.notice = preview.value.instrumental ? '已标记为纯音乐。' : '歌词已保存到曲库。';
            } else {
                const change = kind === 'cover' ? { coverUrl: preview.candidate.cover } : { tags: preview.value };
                const wrote = await library.enrichment.fillTags(track.id, change);
                if (wrote.queued) state.notice = '已加入标签写入队列，文件空闲后会写入。';
                else {
                    recordWrite(track, { missingCover: track.missingCover && !wrote.cover,
                        missingTags: track.missingTags.filter(tag => !wrote.fields.includes(tag)) });
                    changed = wrote.cover || wrote.fields.length > 0;
                    state.notice = changed ? '已写入音频文件。' : '这些项目已有内容。重新检查可更新列表。';
                    if (wrote.originalSyncError) state.notice += ' ' + wrote.originalSyncError;
                }
            }
            detail.preview = null;
            if (changed) await saveBatchItem(detail, before);
            const kinds = fillKinds(track);
            if (kinds.length && !kinds.includes(kind)) detail.kind = kinds.find(type =>
                candidatesFor(track, type, detail.results[type]).length) ?? kinds[0];
        }, { cancellable: false });
    });

    pages.register(PAGE, { title: '曲库补全' }, render);
    stop = async () => {
        stopped = true;
        if (state.job) {
            state.job.cancelled = true;
            await state.job.finished;
        }
        await takeBatch();
    };
}

export function dispose() {
    return stop?.();
}
