const agent = 'ECHO-Library-Enrichment/1.2 (https://github.com/Moekotori/echo-gpui)';
const netease = 'https://music.163.com/';
const qq = 'https://y.qq.com/';
const titles = ['网易云音乐', 'QQ 音乐', 'MusicBrainz', 'Apple iTunes', 'LRCLIB'];

const url = (path, params) => path + '?' + new URLSearchParams(params);
const text = value => typeof value === 'string' ? value.trim() : '';
const name = value => text(value).normalize('NFKC').toLowerCase().replace(/[\p{P}\s]+/gu, '');
const year = value => text(value).match(/^\d{4}/)?.[0];
const artists = values => (Array.isArray(values) ? values : []).map(item => text(item?.name)).filter(Boolean);
const tag = (value, key) => value.tags?.[key];
const validId = value => /^[\da-z]+$/i.test(String(value ?? ''));
const validRelease = value => /^[a-f0-9-]{36}$/i.test(value ?? '');
const image = value => /^https?:\/\//i.test(value ?? '') ? value.replace(/^http:/i, 'https:') : null;

function lyricsText(value) {
    const body = text(value);
    if (!body) return {};
    return /^\[\d+:\d{2}/m.test(body) ? { syncedLyrics: body } : { plainLyrics: body };
}

function decodeLyric(value) {
    const lyric = text(value);
    if (!lyric) return null;
    if (/^[a-z\d+/]{16,}={0,2}$/i.test(lyric) && lyric.length % 4 === 0) {
        try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(lyric, 'base64')); }
        catch { /* The provider also returns unencoded text. */ }
    }
    return lyric.replace(/&(?:#(\d+)|amp|lt|gt|quot|apos);/g, (entity, code) => {
        if (code && Number(code) <= 0x10ffff) return String.fromCodePoint(Number(code));
        return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity] ?? entity;
    });
}

function score(local, candidate) {
    const exactTitle = name(local.title) === name(candidate.title);
    const localArtist = name(local.artist);
    const exactArtist = localArtist && (name(candidate.artist) === localArtist
        || candidate.artists?.some(value => name(value) === localArtist));
    const exactAlbum = name(local.album) && name(candidate.album) === name(local.album);
    const delta = local.duration > 0 && candidate.duration > 0 ? Math.abs(local.duration - candidate.duration) : null;
    if (!candidate.title || !candidate.artist || (!exactTitle && !exactArtist)) return null;
    return { ...candidate, delta, score: 20 * exactTitle + 20 * Number(!!exactArtist)
        + 10 * Number(!!exactAlbum) + (delta === null ? 0 : delta < 3 ? 12 : delta < 8 ? 4 : -16),
        albumDiffers: !!(local.album && candidate.album && !exactAlbum),
        close: !!(exactTitle && exactArtist && delta !== null && delta < 3) };
}

function asCandidate(source, identity, tags, assets = {}) {
    const title = tags.Title;
    const artist = tags.Artist.join(' / ');
    return { source, identity, title, artist, artists: tags.Artist, album: tags.Album, tags, ...assets };
}

export function createProviders(network) {
    async function request(endpoint, referer, body) {
        const headers = { Accept: 'application/json', 'User-Agent': agent };
        if (referer) headers.Referer = referer;
        if (body) headers['Content-Type'] = 'application/json';
        const response = await network.request(endpoint, { headers, ...(body ? { body: JSON.stringify(body) } : {}) });
        if (response.status !== 200) {
            const error = new Error('HTTP ' + response.status);
            error.status = response.status;
            throw error;
        }
        return JSON.parse(response.body);
    }

    const lyrics = {
        async netease(id) {
            const data = await request(url(netease + 'api/song/lyric/v1', {
                id, cp: 'false', lv: '0', kv: '0', tv: '0', yv: '0', rv: '0', ytv: '0', yrv: '0',
            }), netease);
            if (data.code !== 200) throw new Error('歌词服务暂不可用');
            return {
                ...lyricsText(data.lrc?.lyric),
                karaokeLyrics: text(data.yrc?.lyric) || text(data.klyric?.lyric) || undefined,
                translationLyrics: text(data.ytlrc?.lyric) || text(data.tlyric?.lyric) || undefined,
                romanizationLyrics: text(data.yromalrc?.lyric) || text(data.romalrc?.lyric) || undefined,
                instrumental: data.nolyric === true,
            };
        },
        async qq(id) {
            const data = await request(url('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
                songmid: id, g_tk: '5381', loginUin: '0', hostUin: '0',
                format: 'json', platform: 'yqq', needNewCode: '0', nobase64: '1',
            }), qq);
            if (data.code !== 0) throw new Error('歌词服务暂不可用');
            return {
                ...lyricsText(decodeLyric(data.lyric)),
                instrumental: false,
                translationLyrics: decodeLyric(data.trans) ?? undefined,
            };
        },
        async lrclib(id) {
            const song = await request(`https://lrclib.net/api/get/${encodeURIComponent(id)}`);
            return {
                instrumental: !!song.instrumental,
                syncedLyrics: text(song.syncedLyrics) || undefined,
                plainLyrics: text(song.plainLyrics) || undefined,
            };
        },
    };

    let lastMusicBrainzRequest = 0;
    const sources = [
        async query => {
            const payload = await request(url(netease + 'api/cloudsearch/pc', {
                type: '1', s: query.term, limit: '12', offset: '0',
            }), netease);
            if (payload.code !== 200) throw new Error('服务暂不可用');
            return (payload.result?.songs ?? []).filter(song => validId(song.id)).map(song => {
                const album = song.al ?? song.album ?? {};
                return asCandidate(titles[0], String(song.id), {
                    Title: text(song.name), Artist: artists(song.ar ?? song.artists),
                    Album: text(album.name), Track: song.no,
                }, {
                    duration: Number(song.dt ?? song.duration) / 1000,
                    cover: image(album.picUrl),
                    lyricSource: 'netease',
                });
            });
        },
        async query => {
            const payload = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', qq, {
                comm: { ct: 11, cv: '1003006', v: '1003006', tmeAppID: 'qqmusiclight', uin: '0' },
                req_1: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicLite',
                    param: { query: query.term.slice(0, 60), remoteplace: 'search.android.keyboard',
                        page_num: 1, num_per_page: 12, search_type: 7 } },
            });
            if (payload.req_1?.code !== 0) throw new Error('服务暂不可用');
            const body = payload.req_1?.data?.body;
            return (body?.item_song ?? body?.song?.list ?? []).filter(song => validId(song.mid)).map(song => {
                const album = song.album ?? {};
                return asCandidate(titles[1], song.mid, {
                    Title: text(song.name ?? song.title), Artist: artists(song.singer), Album: text(album.name ?? album.title),
                    Track: song.index_album, Disc: song.index_cd,
                    Year: year(song.time_public),
                }, {
                    duration: Number(song.interval),
                    cover: validId(album.mid) ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${album.mid}.jpg` : null,
                    lyricSource: 'qq',
                });
            });
        },
        async query => {
            const wait = 1100 - (Date.now() - lastMusicBrainzRequest);
            if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
            lastMusicBrainzRequest = Date.now();
            const quote = value => '"' + value.replace(/["\\]/g, '\\$&') + '"';
            const clauses = [`recording:${quote(query.title)}`];
            if (query.artist) clauses.push(`artist:${quote(query.artist)}`);
            const payload = await request(url('https://musicbrainz.org/ws/2/recording/', {
                query: clauses.join(' AND '), fmt: 'json', limit: '8',
            }));
            return (payload.recordings ?? []).flatMap(song => {
                const releases = (song.releases ?? []).filter(release => release.status === 'Official');
                const chosen = releases.sort((a, b) => Number(name(b.title) === name(query.album))
                    - Number(name(a.title) === name(query.album))).slice(0, 2);
                return (chosen.length ? chosen : [{}]).map(release => {
                    const media = release.media?.[0];
                    return asCandidate(titles[2], release.id ?? song.id, {
                        Title: text(song.title), Artist: artists(song['artist-credit']), Album: text(release.title),
                        AlbumArtist: artists(release['artist-credit']),
                        Year: year(release.date ?? song['first-release-date']),
                        Track: media?.tracks?.[0]?.position, Disc: media?.position,
                    }, {
                        duration: Number(song.length) / 1000,
                        cover: validRelease(release.id) ? `https://coverartarchive.org/release/${release.id}/front-500` : null,
                        coverSource: 'Cover Art Archive',
                    });
                });
            });
        },
        async query => {
            const payload = await request(url('https://itunes.apple.com/search', {
                term: query.term, media: 'music', entity: 'song', limit: '12',
            }));
            // Store artwork is promotional content. Use catalog fields here.
            return (payload.results ?? []).filter(song => song.kind === 'song').map(song =>
                asCandidate(titles[3], String(song.trackId), {
                    Title: text(song.trackName), Artist: [text(song.artistName)].filter(Boolean), Album: text(song.collectionName),
                    Track: song.trackNumber, Disc: song.discNumber, Year: year(song.releaseDate), Genre: text(song.primaryGenreName),
                }, { duration: Number(song.trackTimeMillis) / 1000 }));
        },
        async query => {
            const params = { track_name: query.title };
            if (query.artist) params.artist_name = query.artist;
            const rows = await request(url('https://lrclib.net/api/search', params));
            return rows.filter(song => /^\d+$/.test(String(song.id)) && (song.instrumental || song.syncedLyrics || song.plainLyrics))
                .map(song => asCandidate(titles[4], String(song.id), {
                    Title: text(song.trackName), Artist: [text(song.artistName)].filter(Boolean), Album: text(song.albumName),
                }, { duration: Number(song.duration), lyricSource: 'lrclib' }));
        },
    ];

    const capabilities = [
        ['cover', 'lyrics', 'tags'], ['cover', 'lyrics', 'tags'], ['cover', 'tags'], ['tags'], ['lyrics'],
    ];
    const providers = sources.map((search, index) => {
        let retryAt = 0;
        async function lookup(track, query, kinds) {
            if (Date.now() < retryAt) throw new Error('来源限流，稍后恢复');
            let rows;
            try {
                rows = await search({ ...query, album: track.album, term: [query.title, query.artist].filter(Boolean).join(' ') });
            } catch (error) {
                if (error.status === 429) retryAt = Date.now() + 30_000;
                throw error;
            }
            const ranked = rows.map(row => score({ ...track, ...query }, row)).filter(Boolean)
                .sort((a, b) => b.score - a.score);
            const provides = {
                cover: row => row.cover,
                lyrics: row => row.lyricSource,
                tags: row => track.missingTags.some(key => entries(tag(row, key)).length),
            };
            return Object.fromEntries(kinds.map(kind => {
                const seen = new Set();
                const matches = ranked.filter(row => {
                    if (!provides[kind](row)) return false;
                    const key = kind === 'cover' ? row.cover : row.identity;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                return [kind, matches.slice(0, 3)];
            }));
        }
        return { title: titles[index], kinds: capabilities[index], lookup };
    });
    return { providers, readLyrics: candidate => lyrics[candidate.lyricSource](candidate.identity) };
}

export function entries(value) {
    return (Array.isArray(value) ? value : [value])
        .map(item => typeof item === 'number' && item > 0 ? String(Math.trunc(item)) : text(item)).filter(Boolean);
}
