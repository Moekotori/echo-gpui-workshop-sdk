// Only contact the selected station. Stream tokens are not needed for its public history.
export async function activate({commands}) {
    commands.register('radio-song-history', {title: '电台已播曲目'}, async ({url, limit}) => {
        const stream = new URL(url);
        if (!['https:', 'http:'].includes(stream.protocol) || stream.username || stream.password) return [];
        const route = stream.pathname.match(/^(.+?)?\/(?:listen|hls)\/([\w-]+)(?:\/|$)/);
        if (!route) return [];
        const api = new URL((route[1] ?? '') + '/api/nowplaying/' + route[2], stream.origin);
        const response = await fetch(api, {redirect:'error', signal:AbortSignal.timeout(4000)});
        if (!response.ok) return [];
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let text = '', bytes = 0;
        try {
            for (;;) {
                const {done,value} = await reader.read();
                if (done) break;
                bytes += value.length;
                if (bytes > 512 * 1024) {await reader.cancel(); return [];}
                text += decoder.decode(value,{stream:true});
            }
        } finally { reader.releaseLock(); }
        const data = JSON.parse(text + decoder.decode());
        return (Array.isArray(data.song_history) ? data.song_history : [])
            .slice(0, Math.min(limit ?? 40,40))
            .filter(row => row.song?.title && Number.isSafeInteger(row.played_at))
            .map(({song,played_at}) => ({title:song.title, artist:song.artist ?? '', played_at}));
    });
}
