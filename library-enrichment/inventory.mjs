import { entries } from './providers.mjs';

export const PAGE_SIZE = 12;
export const KINDS = ['cover', 'lyrics', 'tags'];
export const LABELS = {
    all: '全部缺项', cover: '封面', lyrics: '歌词', tags: '元数据', inaccessible: '文件不可用',
};
export const TAGS = {
    Title: '曲名', Artist: '艺人', Album: '专辑', AlbumArtist: '专辑艺人',
    Genre: '流派', Year: '年份', Track: '曲序', Disc: '碟号',
};

export function reportKinds(track) {
    if (!track.accessible) return [];
    return KINDS.filter(kind => ({
        cover: track.missingCover,
        lyrics: track.missingLyrics,
        tags: track.missingTags.length > 0,
    })[kind]);
}

export function fillKinds(track) {
    return reportKinds(track).filter(kind => kind === 'lyrics' || track.fileTagsWritable);
}

export function matchesFilter(track, filter) {
    if (filter === 'inaccessible') return !track.accessible;
    if (filter === 'all') return !track.accessible || reportKinds(track).length > 0;
    return reportKinds(track).includes(filter);
}

export function lookupKinds(track, filter) {
    return fillKinds(track).filter(kind => filter === 'all' || kind === filter);
}

export function defaultQuery(track) {
    return { title: track.title.trim().slice(0, 256),
        artist: /^unknown( artist)?$/i.test(track.artist.trim()) ? '' : track.artist.trim().slice(0, 256) };
}

export const fieldsFor = (track, candidate) => track.missingTags
    .map(field => [field, entries(candidate.tags[field])]).filter(([, values]) => values.length);

export const emptyResults = () => Object.fromEntries(KINDS.map(kind => [kind, { matches: [], failures: [] }]));

export function candidatesFor(track, kind, result) {
    if (!fillKinds(track).includes(kind)) return [];
    return kind === 'tags' ? result.matches.filter(candidate => fieldsFor(track, candidate).length) : result.matches;
}
