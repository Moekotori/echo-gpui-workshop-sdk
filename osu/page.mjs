import { open, opendir, realpath } from 'node:fs/promises';
import { basename, join, relative, isAbsolute } from 'node:path';

import { browsePage, modes, previewPage } from './view.mjs';
import { createArtwork } from './artwork.mjs';
import { createManiaDan } from './mania-dan.mjs';

const stateKey = 'osu.bp-presence-config';
const revisionKey = 'osu.bp-presence-revision';

async function presenceConfig(storage, patch) {
    const saved = await storage.get(stateKey) ?? {};
    const revision = (await storage.get(revisionKey) ?? 0) + 1;
    await storage.set(stateKey, { ...saved, ...patch, revision });
    await storage.set(revisionKey, revision);
}

async function readInside(root, path, limit, header = false) {
    const file = await realpath(path);
    const name = relative(await realpath(root), file);
    if (!name || name === '..' || /^\.\.[\\/]/u.test(name) || isAbsolute(name)) throw new Error('无效的谱面导入回执');
    const handle = await open(file, 'r');
    try {
        const info = await handle.stat();
        if (!info.isFile() || (!header && info.size > limit)) throw new Error('谱面文件超过读取上限');
        if (!header) {
            const chunks = [];
            let size = 0;
            for await (const chunk of handle.createReadStream({ autoClose: false })) {
                size += chunk.length;
                if (size > limit) throw new Error('谱面文件超过读取上限');
                chunks.push(chunk);
            }
            return Buffer.concat(chunks, size).toString('utf8');
        }
        const bytes = Buffer.alloc(Math.min(info.size, limit));
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        return bytes.subarray(0, bytesRead).toString('utf8');
    } finally { await handle.close(); }
}

function encodeMania(text, trackId) {
    const keys = Number(/^CircleSize:\s*(\d+)\s*$/mu.exec(text)?.[1]);
    if (keys < 1 || keys > 18 || !Number.isInteger(keys)) throw new Error('无效的 mania 键数');
    const bytes = [];
    const write = value => {
        while (value >= 128) {
            bytes.push(128 | (value & 127));
            value = Math.floor(value / 128);
        }
        bytes.push(value);
    };
    let start = 0, count = 0, objects = false;
    for (const raw of text.split(/\r?\n/u)) {
        const line = raw.trim();
        if (line.startsWith('[')) {
            objects = line === '[HitObjects]';
            continue;
        }
        if (!objects || !line || line.startsWith('//')) continue;
        const [xs, , time, type, , parameter] = line.split(',');
        const x = Number(xs), at = Number(time), flags = Number(type);
        const end = flags & 128 ? Number(parameter?.split(':')[0]) : at;
        if (![x, at, end, flags].every(Number.isInteger) || x < 0 || x > 512 || !(flags & 129)
            || at < start || end < at || end >= 86_400_000) throw new Error('无效的 mania 音符');
        if (++count > 120000) throw new Error('谱面音符过多');
        write(at - start);
        bytes.push(Math.min(keys - 1, Math.floor(x * keys / 512)));
        write(end - at);
        start = at;
    }
    return { count, keys, trackId, notes: Buffer.from(bytes).toString('base64') };
}

const receiptName = /^([1-9]\d{0,14})\.osz\.echo-import\.json$/u;
const userId = /^[1-9]\d{0,14}$/u;
const userPath = /^\/users\/([1-9]\d{0,14})(?:\/(?:osu|taiko|fruits|mania))?\/?$/u;
const gameModes = new Set(modes.map(([mode]) => mode));

function publicProfileUrl(value) {
    if (userId.test(value)) return `https://osu.ppy.sh/users/${value}`;
    if (/^(?!\d+$)[a-z\d _\[\]-]{1,32}$/iu.test(value)) {
        return `https://osu.ppy.sh/users/${encodeURIComponent(value)}?key=username`;
    }
    const url = URL.parse(value);
    const id = url?.pathname.match(userPath)?.[1];
    if (url?.origin !== 'https://osu.ppy.sh' || url.username || url.password || !id) {
        throw new Error('无效的用户名、用户 ID 或主页链接');
    }
    return `https://osu.ppy.sh/users/${id}`;
}

function publicProfileMode(html) {
    const tag = html?.match(/<div\b(?=[^>]*\bdata-react="profile-page")[^>]*>/iu)?.[0];
    const data = tag?.match(/\bdata-initial-data="([^"]*)"/iu)?.[1];
    const mode = data?.match(/&quot;playmode&quot;\s*:\s*&quot;(osu|taiko|fruits|mania)&quot;/u)?.[1];
    if (!mode) throw new Error('osu! 官方主页未返回默认模式');
    return mode;
}

async function readReceipt(directory, id) {
    return JSON.parse(await readInside(directory, join(directory, id + '.osz.echo-import.json'), 1024 * 1024));
}

export async function activate(echo) {
    const invoke = (method, input) => echo.trusted.invoke('osu:' + method, input);
    const key = 'osu.gpui-browsing';
    const saved = await echo.storage.get(key);
    const filters = { view: 'bp', userTarget: '', query: '', category: 'all', pageSize: 20, ...saved };
    const { userMode = null, searchMode = saved?.view === 'search' ? saved.mode : 'all' } = filters;
    Object.assign(filters, { userMode, searchMode, mode: 'osu' });
    const viewState = {
        filters, draft: { user: filters.userTarget, query: filters.query },
        source: await echo.storage.get('osu.download-source') ?? 'sayobot',
        wall: await echo.storage.get('osu.bp-layout') === 'wall',
        offset: 0, imported: new Map(), highlighted: new Set(), notice: '',
    };
    const preview = { name: '', maps: [], difficulty: 0, speed: 1, picker: false, entries: [], offset: 0, hasMore: false, status: null };
    let previewDirectory, previewListing, cursors = [], resolved, lastImported, queueTimer, browseTimer;
    let visiblePage;
    const pageSize = (state = filters) => state.view === 'search' ? 50
        : state.view === 'bp' && viewState.api?.connected ? 20 : state.pageSize;
    const invalidate = id => {
        if (visiblePage === id) echo.ui.invalidatePage(id);
    };
    const refreshBrowse = () => {
        browseTimer ??= setTimeout(() => {
            browseTimer = undefined;
            invalidate('osu');
        }, 250);
    };
    const artwork = createArtwork(echo.network, refreshBrowse);
    const dan = createManiaDan(invoke, refreshBrowse);

    const unsubscribe = echo.events.on('playback:status', status => {
        const previous = preview.status;
        preview.status = status;
        if (previous?.state !== status.state || previous?.currentTrackId !== status.currentTrackId) invalidate('mania-preview');
    });

    async function resolveTarget(value, refresh) {
        const url = publicProfileUrl(value);
        if (!refresh && resolved?.url === url) return resolved;
        const response = await echo.network.request({ url, headers: { range: 'bytes=0-2097151' } });
        if (response.status === 404) throw new Error('找不到该用户或其公开资料不可用');
        const id = URL.parse(response.url)?.pathname.match(userPath)?.[1];
        if (!response.ok || !id) throw new Error('无法读取 osu! 官方主页（HTTP ' + response.status + '）');
        const html = response.body ?? Buffer.from(response.bodyBase64 ?? '', 'base64').toString('utf8');
        const profile = { url, id, mode: publicProfileMode(html) };
        resolved = profile;
        return profile;
    }

    function updateArtwork() {
        artwork.update(viewState.data?.profile, viewState.data?.rows ?? [], viewState.wall);
    }

    async function importedTracks() {
        const ids = [...new Set((viewState.data?.rows ?? []).map(row => row.beatmapsetId))];
        const matches = ids.length ? await invoke('importedTracks', { ids }) : [];
        viewState.imported = new Map(matches.map(row => [row.beatmapsetId, row.trackId]));
    }

    async function load(proposal = filters, { refresh = false, offset = viewState.offset, cursor = null } = {}) {
        const target = proposal.userTarget.trim();
        const { view } = proposal;
        let preferredMode, targetId = target;
        if (view !== 'search') {
            const accountId = viewState.api?.connected ? viewState.api.userId : '';
            if (target || accountId) {
                const value = target || accountId;
                try {
                    const profile = await resolveTarget(value, refresh);
                    targetId = profile.id;
                    preferredMode = profile.mode;
                } catch (error) {
                    if (!viewState.api?.connected || view !== 'bp') throw error;
                    // API v1 can still find accounts when the public web profile cannot be read.
                    viewState.notice = '暂时无法读取官方默认模式，可手动切换';
                }
            } else {
                if (refresh || viewState.login?.connected === undefined) viewState.login = await invoke('loginState');
                preferredMode = viewState.login.mode;
            }
        }
        const mode = view === 'search' ? proposal.searchMode ?? 'all'
            : proposal.userMode === 'all' && view === 'mostPlayed' ? 'all'
            : gameModes.has(proposal.userMode) ? proposal.userMode : preferredMode ?? 'osu';
        const size = pageSize(proposal);
        const data = view === 'search' && !proposal.query.trim() ? undefined : await invoke('load', {
            ...proposal, mode, userTarget: view === 'search' ? '' : targetId,
            userTargetInput: target, offset, pageSize: size, cursor, refresh,
        });
        Object.assign(filters, proposal, { mode });
        Object.assign(viewState, { data, offset });
        dan.update(filters, data?.rows ?? [], refresh);
        updateArtwork();
        await importedTracks();
    }

    async function readQueue() {
        const queue = await invoke('queueState', {});
        viewState.queue = queue;
        if (queue.queue?.importedCount !== lastImported) {
            if (lastImported !== undefined) {
                previewListing = undefined;
                await importedTracks();
            }
            lastImported = queue.queue?.importedCount;
        }
        clearTimeout(queueTimer);
        if (queue.queue?.busy && visiblePage === 'osu') queueTimer = setTimeout(() => invalidate('osu'), 700);
    }

    async function bootstrap() {
        if (!viewState.login) {
            viewState.login = await invoke('sessionState');
            if (await echo.storage.get('osu.signed-in')) viewState.login = await invoke('loginState');
        }
        if (!viewState.api) {
            viewState.api = await invoke('apiState');
            const saved = await echo.storage.get('osu-api-session');
            if (saved && !viewState.api.connected) viewState.api = await invoke('apiRestore', JSON.parse(saved));
        }
    }

    async function startOver(patch = {}, refresh = false) {
        await load({ ...filters, ...patch }, { offset: 0, refresh });
        cursors = [];
        viewState.highlighted.clear();
        await echo.storage.set(key, filters);
    }

    async function browse() {
        await bootstrap();
        if (!viewState.data && (filters.userTarget || viewState.api?.connected || viewState.login?.connected)
            && (filters.view !== 'search' || filters.query)) await load();
        await readQueue();
        dan.advance();
        return browsePage({ ...viewState, dan, pageSize: pageSize() }, artwork.images());
    }

    function resetPreview() {
        Object.assign(preview, { name: '', maps: [], difficulty: 0, notes: undefined });
    }

    async function showPreview() {
        await readQueue();
        const directory = viewState.queue.directory;
        if (previewDirectory !== directory) {
            previewDirectory = directory;
            preview.offset = 0;
            previewListing = undefined;
            resetPreview();
        }
        if (directory && (preview.picker || !preview.name) && previewListing !== preview.offset) {
            const entries = [];
            let skipped = 0, hasMore = false;
            for await (const entry of await opendir(directory)) {
                const match = entry.name.match(receiptName);
                if (!entry.isFile() || !match) continue;
                if (skipped++ < preview.offset) continue;
                if (entries.length === 8) { hasMore = true; break; }
                const saved = await readReceipt(directory, match[1]).catch(() => null);
                const path = saved?.outputPaths?.[0];
                if (typeof path === 'string') entries.push({
                    id: match[1], title: basename(path).replace(/\.[^.]+$/u, ''), detail: '谱面集 #' + match[1],
                });
            }
            Object.assign(preview, { entries, hasMore });
            previewListing = preview.offset;
        }
        return previewPage({ ...preview, directory });
    }

    async function loadDifficulty(difficulty, maps = preview.maps, fallbackTitle = preview.name) {
        const map = maps[difficulty];
        if (!map) throw new Error('无效的难度');
        const text = await readInside(previewDirectory, map.path, 8 * 1024 * 1024);
        const notes = encodeMania(text, map.trackId);
        const title = /^Title:[ \t]*(.+)$/mu.exec(text)?.[1].trim();
        const status = await echo.playback.getStatus();
        Object.assign(preview, { notes, difficulty, status, name: title || fallbackTitle });
    }

    async function previewAction(input, fields) {
        switch (input.operation) {
            case 'previewPicker': preview.picker = !preview.picker; break;
            case 'previewDirectory':
                viewState.queue = await invoke('chooseDirectory');
                previewListing = undefined;
                break;
            case 'previewPage': preview.offset = Math.max(0, preview.offset + input.step * 8); break;
            case 'previewSet': {
                const saved = await readReceipt(previewDirectory, input.id);
                const maps = [];
                for (const map of (saved.charts ?? []).slice(0, 128)) {
                    const text = await readInside(previewDirectory, map.path, 65536, true);
                    if (/^Mode:\s*3\s*$/mu.test(text)) maps.push({ ...map, name: /^Version:\s*(.+)$/mu.exec(text)?.[1] ?? basename(map.path) });
                }
                if (!maps.length) throw new Error('这个谱面集没有可用的 mania 难度');
                const fallbackTitle = basename(saved.outputPaths[0]).replace(/\.[^.]+$/u, '');
                await loadDifficulty(0, maps, fallbackTitle);
                preview.maps = maps;
                preview.picker = false;
                break;
            }
            case 'previewLoad': {
                const speed = Number(fields.speed);
                const difficulty = Number(fields.difficulty);
                if (difficulty !== preview.difficulty) await loadDifficulty(difficulty);
                if (speed >= 0.5 && speed <= 3) preview.speed = speed;
                break;
            }
            case 'previewPlay': {
                if (!preview.notes) break;
                const status = await echo.playback.getStatus();
                if (status.currentTrackId !== preview.notes.trackId) await echo.queue.playTrack(preview.notes.trackId);
                else if (status.state === 'playing') await echo.playback.pause();
                else await echo.playback.play();
                preview.status = await echo.playback.getStatus();
                break;
            }
            case 'previewSeek': {
                const status = await echo.playback.getStatus();
                const seconds = Number(fields.seek);
                if (!preview.notes || status.currentTrackId !== preview.notes.trackId) throw new Error('请先播放当前谱面');
                if (!fields.seek?.trim() || !Number.isFinite(seconds) || seconds < 0 || seconds > status.durationSeconds) {
                    throw new Error('无效的跳转时间');
                }
                await echo.playback.seek(seconds);
                break;
            }
            default: throw new Error('未知的预览操作');
        }
        return showPreview();
    }

    async function enqueue(input) {
        if (!viewState.queue?.directory) viewState.queue = await invoke('chooseDirectory');
        if (!viewState.queue.directory) return;
        const { data, source } = viewState;
        if (input.operation === 'allBP') {
            viewState.queue = await invoke('enqueueAllBP', { userId: data.userId, mode: filters.mode, source });
        } else {
            const items = data.rows.filter(row => row.downloadable &&
                (input.id ? row.beatmapsetId === input.id : viewState.highlighted.has(row.beatmapsetId)))
                .map(({ beatmapsetId, title }) => ({ beatmapsetId, title }));
            if (items.length) viewState.queue = await invoke('enqueue', { items, source });
            viewState.highlighted.clear();
        }
    }

    return {
        async open(id) {
            visiblePage = id;
            if (id === 'mania-preview') {
                dan.pause();
                return showPreview();
            }
            return browse();
        },
        close(id) {
            if (visiblePage !== id) return;
            visiblePage = undefined;
            if (id === 'osu') dan.pause();
        },
        async action({ data: input, fields = {} }) {
            if (input.operation.startsWith('preview')) return previewAction(input, fields);
            const { draft, highlighted } = viewState;
            draft.user = fields.user ?? draft.user;
            draft.query = fields.query ?? draft.query;
            viewState.notice = '';
            switch (input.operation) {
                case 'browse':
                    await startOver({
                        userTarget: draft.user.trim(), userMode: null,
                        view: filters.view === 'search' ? 'bp' : filters.view,
                    }, true);
                    break;
                case 'search': await startOver({ query: draft.query.trim() }); break;
                case 'refresh': await startOver({}, true); break;
                case 'view': await startOver({ view: input.view, query: draft.query.trim() }); break;
                case 'mode':
                    await startOver(filters.view === 'search'
                        ? { searchMode: input.mode, query: draft.query.trim() } : { userMode: input.mode });
                    break;
                case 'size': await startOver({ pageSize: Number(input.size) }); break;
                case 'category': await startOver({ category: input.category }); break;
                case 'paginate': {
                    const size = pageSize();
                    const offset = Math.max(0, viewState.offset + input.direction * size);
                    const index = offset / size;
                    const cursor = input.direction === 1 ? viewState.data.cursorNext : cursors[index];
                    await load(filters, { offset, cursor: cursor ?? null });
                    cursors[index] = cursor;
                    break;
                }
                case 'layout':
                    viewState.wall = input.wall;
                    updateArtwork();
                    await echo.storage.set('osu.bp-layout', input.wall ? 'wall' : 'list');
                    break;
                case 'settings': viewState.showSettings = !viewState.showSettings; break;
                case 'source': viewState.source = input.source; await echo.storage.set('osu.download-source', input.source); break;
                case 'login': viewState.login = await invoke('login'); break;
                case 'self':
                case 'identify':
                    viewState.login = await invoke('loginState');
                    if (viewState.login.connected) {
                        await echo.storage.set('osu.signed-in', true);
                        await startOver({ userTarget: '', userMode: null, view: 'bp' });
                        draft.user = '';
                    } else {
                        viewState.notice = '尚未登录 osu!，完成网页登录后再确认';
                    }
                    break;
                case 'logout':
                    await invoke('logout');
                    await echo.storage.remove('osu.signed-in');
                    await echo.storage.remove('osu-api-session');
                    await presenceConfig(echo.storage, { mode: 'off', clear: true, profile: null, followPlaying: null });
                    await echo.presence.steam.clearTemporaryStatus();
                    viewState.login = { connected: false };
                    viewState.api = { connected: false };
                    await startOver();
                    break;
                case 'apiLogin': {
                    const credentials = { user: fields['api-user'] ?? '', key: fields['api-key'] ?? '' };
                    const connected = await invoke('apiLogin', credentials);
                    try {
                        await echo.storage.set('osu-api-session', JSON.stringify({ key: credentials.key, user: connected.userId, username: connected.username }));
                    } catch (error) {
                        await invoke('apiLogout');
                        throw error;
                    }
                    viewState.api = connected;
                    await startOver({ userTarget: '', userMode: null, view: 'bp' });
                    draft.user = '';
                    break;
                }
                case 'apiLogout':
                    await invoke('apiLogout');
                    await echo.storage.remove('osu-api-session');
                    viewState.api = { connected: false };
                    await startOver();
                    break;
                case 'directory': viewState.queue = await invoke('chooseDirectory'); await importedTracks(); break;
                case 'queue': viewState.showQueue = !viewState.showQueue; break;
                case 'cancelQueue': await invoke('cancelQueue', {}); break;
                case 'play': await echo.queue.playTrack(input.trackId); break;
                case 'select':
                    if (highlighted.has(input.id)) highlighted.delete(input.id);
                    else highlighted.add(input.id);
                    break;
                case 'clearSelection': highlighted.clear(); break;
                case 'download':
                case 'downloadSelected':
                case 'allBP': await enqueue(input); break;
                case 'presence': {
                    const text = await invoke('bpPresenceText', { userId: viewState.data.userId, mode: filters.mode, beatmapId: input.beatmapId, pageSize: pageSize(), offset: viewState.offset });
                    await echo.presence.steam.setTemporaryStatus({ text, includeTrack: false, expiresAt: null });
                    await presenceConfig(echo.storage, { mode: 'single', text, clear: false });
                    viewState.notice = '已设置 Steam 状态';
                    break;
                }
                case 'clearPresence':
                    await presenceConfig(echo.storage, { mode: 'off', clear: true, profile: null, followPlaying: null });
                    await echo.presence.steam.clearTemporaryStatus();
                    viewState.notice = '已清除 Steam 状态';
                    break;
                case 'danDifficulty': dan.nextDifficulty(input.id); break;
                default: throw new Error('未知的 osu! 页面操作');
            }
            return browse();
        },
        dispose() {
            clearTimeout(queueTimer);
            clearTimeout(browseTimer);
            unsubscribe();
            artwork.dispose();
            dan.dispose();
        },
    };
}
