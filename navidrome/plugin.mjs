import { createHash, randomBytes } from 'node:crypto';

const pageSize = 24;
let account;
let query = '';
let offset = 0;
let songs = [];
let hasNext = false;

export async function activate({ hostInvoke, pages, sources }) {
    const host = await hostInvoke('host.describe');
    if (!host.commands.includes('queue.submit')) throw new Error('ECHO does not provide queue.submit');
    pages.register('catalog', { title: 'Navidrome' }, openPage);
    sources.registerProvider('catalog', { title: 'Navidrome' }, {
        async search({ query, page, pageSize, signal }) {
            const current = connected();
            const { tracks, more } = await searchSongs(current, query, (page - 1) * pageSize, pageSize, signal);
            return {
                tracks: tracks.map(reference),
                hasMore: more,
            };
        },
        async browse({ collectionId, page, pageSize, signal }) {
            const offset = (page - 1) * pageSize;
            if (collectionId === null) {
                const result = await request(connected(), 'getAlbumList2', { type: 'alphabeticalByName', offset, size: pageSize + 1 }, signal);
                const albums = result.albumList2?.album ?? [];
                return { tracks: [], collections: albums.slice(0, pageSize).map(a => ({ kind: 'album', id: a.id, title: a.name })),
                    hasMore: albums.length > pageSize };
            }
            const result = await request(connected(), 'getAlbum', { id: collectionId }, signal);
            const songs = result.album?.song ?? [];
            return { tracks: songs.slice(offset, offset + pageSize).map(reference), hasMore: offset + pageSize < songs.length };
        },
        async resolve({ providerTrackId, signal }) {
            const current = connected();
            const { song } = await request(current, 'getSong', { id: providerTrackId }, signal);
            if (!song) throw new Error('Track is no longer available.');
            return resolvedTrack(current, song, signal);
        },
    });
}

function openPage() { return account ? searchPage() : loginPage(); }

function connected() {
    if (!account) throw new Error('Sign in on the Navidrome sidebar page first.');
    return account;
}

export async function handle({ method, input, signal }, { pluginId, queue }) {
    switch (method) {
        case 'page.open': return openPage();
        case 'login': {
            const { server, username, password } = input.fields;
            if (!username.trim() || !password) throw new Error('Enter your Navidrome username and password.');
            const base = new URL(server.trim());
            if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
                throw new Error('Use a plain HTTP(S) server address, including any deployment subpath.');
            }
            if (!base.pathname.endsWith('/')) base.pathname += '/';
            const salt = randomBytes(12).toString('hex');
            const token = createHash('md5').update(password + salt).digest('hex');
            const candidate = { base, username: username.trim(), salt, token };
            await request(candidate, 'ping', {}, signal);
            account = candidate;
            return searchPage();
        }
        case 'logout':
            account = undefined;
            songs = [];
            query = '';
            offset = 0;
            hasNext = false;
            return loginPage();
        case 'search':
            await search(input.fields.query.trim(), 0, signal);
            return searchPage();
        case 'more':
        case 'previous':
            await search(query, method === 'more' ? offset + pageSize : Math.max(0, offset - pageSize), signal);
            return searchPage();
        case 'play':
        case 'append': {
            const song = songs.find(song => song.id === input.data);
            if (!song) throw new Error('That track is no longer in the visible results.');
            await queue.submit({ mode: method, tracks: [{
                kind: 'source', source: { plugin: pluginId, provider: 'catalog' }, track: reference(song),
            }] });
            return null;
        }
        default: throw new Error('Unknown plugin action');
    }
}

function loginPage() {
    return {
        title: 'Navidrome',
        description: 'Connect to your own Navidrome server. Use HTTPS when connecting over the internet.',
        fields: [
            { id: 'server', label: 'Server URL' },
            { id: 'username', label: 'Username' },
            { id: 'password', label: 'Password', secret: true },
        ],
        actions: [{ label: 'Connect', method: 'login' }],
    };
}

function searchPage() {
    return {
        title: 'Navidrome',
        description: query ? 'Search results · Page ' + (offset / pageSize + 1) : 'Search your Navidrome library.',
        fields: [{ id: 'query', label: 'Search tracks', value: query }],
        actions: [
            { label: 'Search', method: 'search' },
            ...(offset ? [{ label: 'Previous', method: 'previous' }] : []),
            ...(hasNext ? [{ label: 'Next', method: 'more' }] : []),
            { label: 'Disconnect', method: 'logout' },
        ],
        rows: songs.map(song => ({
            title: song.title,
            detail: [song.artist, song.album].filter(Boolean).join(' · '),
            actions: [
                { label: 'Play', method: 'play', input: song.id },
                { label: 'Add to queue', method: 'append', input: song.id },
            ],
        })),
    };
}

async function search(text, position, signal) {
    if (!text) {
        query = '';
        songs = [];
        hasNext = false;
        offset = 0;
        return;
    }
    const { tracks, more } = await searchSongs(connected(), text, position, pageSize, signal);
    songs = tracks;
    hasNext = more;
    offset = position;
    query = text;
}

async function searchSongs(credentials, text, position, limit, signal) {
    const result = await request(credentials, 'search3', {
        query: text, artistCount: 0, albumCount: 0, songCount: limit + 1, songOffset: position,
    }, signal);
    const matches = result.searchResult3?.song ?? [];
    return { tracks: matches.slice(0, limit), more: matches.length > limit };
}

function reference(song) {
    return { providerTrackId: song.id, title: song.title, artist: song.artist ?? '', album: song.album ?? '', duration: song.duration ?? 0 };
}

async function resolvedTrack(credentials, song, signal) {
    const lyrics = await trackLyrics(credentials, song, signal);
    return {
        title: song.title, artist: song.artist ?? '', album: song.album ?? '', duration: song.duration ?? 0,
        url: apiUrl(credentials, 'stream', { id: song.id, format: 'raw' }).href,
        lyrics,
    };
}

async function trackLyrics(credentials, song, signal) {
    try {
        const result = await request(credentials, 'getLyricsBySongId', { id: song.id }, signal);
        const lyrics = result.lyricsList?.structuredLyrics ?? [];
        const selected = lyrics.find(item => item.synced) ?? lyrics[0];
        if (selected?.line?.length) {
            return selected.line.map(line => {
                if (!selected.synced || !Number.isFinite(line.start)) return line.value;
                const seconds = line.start / 1000;
                return '[' + Math.floor(seconds / 60) + ':' + (seconds % 60).toFixed(3).padStart(6, '0') + ']' + line.value;
            }).join('\n');
        }
    } catch { if (signal?.aborted) throw signal.reason; }
    try {
        const result = await request(credentials, 'getLyrics', { artist: song.artist ?? '', title: song.title }, signal);
        return result.lyrics?.value ?? null;
    } catch { if (signal?.aborted) throw signal.reason; return null; }
}

function apiUrl({ base, username, salt, token }, method, params) {
    const url = new URL('rest/' + method + '.view', base);
    url.search = new URLSearchParams({ u: username, s: salt, t: token, v: '1.16.1', c: 'EchoWorkshopNavidrome', f: 'json', ...params });
    return url;
}

async function request(credentials, method, params = {}, signal) {
    const timeout = AbortSignal.timeout(8000);
    let response;
    try {
        response = await fetch(apiUrl(credentials, method, params), {
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            redirect: 'error',
        });
    } catch { throw new Error('Could not reach the Navidrome server. Check its address and connection.'); }
    if (!response.ok) throw new Error('Navidrome returned HTTP ' + response.status);
    const result = (await response.json())['subsonic-response'];
    if (result?.status !== 'ok') throw new Error(result?.error?.message ?? 'Invalid Navidrome response.');
    return result;
}
