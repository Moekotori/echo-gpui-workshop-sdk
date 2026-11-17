let track = null;
let queueLength = 0;
let libraryRevision = null;
const subscriptions = [];

export function activate({ library, playback, queue, pages }) {
    subscriptions.push(
        library.onChanged(event => {
            if (event.source !== 'Local') return;
            libraryRevision = event.revision;
            pages.invalidate();
        }),
        playback.onTrackChanged(current => {
            track = current;
            pages.invalidate();
        }),
        queue.onChanged(event => {
            queueLength = event.total;
            pages.invalidate();
        }),
    );
    pages.register('library', { title: '实时曲库示例' }, async () => {
        const { entries } = await library.query();
        return {
            title: '实时曲库示例',
            description: '播放、队列或本机曲库变化后，页面会自动更新。',
            rows: [
                { title: '当前曲目', detail: track ? [track.title, track.artist].filter(Boolean).join(' · ') : '尚未播放' },
                { title: '播放队列', detail: `${queueLength} 首` },
                { title: '本机曲库', detail: libraryRevision === null ? '正在读取' : `版本 ${libraryRevision}` },
                ...entries.slice(0, 8).map(song => ({
                    title: song.title,
                    detail: [song.subtitle, song.liked ? '已收藏' : '未收藏'].filter(Boolean).join(' · '),
                    actions: [
                        ...(song.playable ? [
                            { label: '播放', method: 'play', input: song.id },
                            { label: '加入队列', method: 'append', input: song.id },
                        ] : []),
                        { label: song.liked ? '取消收藏' : '收藏', method: 'favorite', input: { id: song.id, liked: !song.liked } },
                    ],
                })),
            ],
        };
    });
}

export async function handle({ method, input }, { library, queue }) {
    const { data } = input;
    if (method === 'favorite') {
        await library.setLiked(data.id, data.liked);
    } else if (method === 'play' || method === 'append') {
        await queue.submit({
            mode: method,
            tracks: [{ kind: 'catalog', source: 'Local', id: data }],
        });
    } else {
        throw new Error(`未知操作 ${method}`);
    }
    return null;
}

export function dispose() {
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
}
