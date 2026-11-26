const budget = 390_000;

export function createArtwork(network, changed) {
    let desired = new Map(), cache = new Map(), pending = new Map();
    let revision = 0, disposed = false;
    const source = url => {
        let target;
        try { target = new URL(url); } catch { return null; }
        if (target.protocol !== 'https:' || target.username || target.password || target.port
            || !['a.ppy.sh', 'assets.ppy.sh'].includes(target.hostname)) return null;
        return target.href;
    };

    function update(profile, entries, wall) {
        const next = new Map();
        const avatar = source(profile?.avatarUrl);
        if (avatar) next.set('avatar', avatar);
        for (const id of new Set(entries.map(row => row.beatmapsetId))) {
            if (!/^[1-9]\d{0,14}$/u.test(id) || next.size >= (wall ? 24 : 31)) continue;
            next.set('map-' + id, `https://assets.ppy.sh/beatmaps/${id}/covers/${wall ? 'card.jpg' : 'list.jpg'}`);
        }
        if (next.size === desired.size && [...next].every(([key, url]) => desired.get(key) === url)) return;
        desired = next;
        const generation = ++revision;
        for (const [requestId, url] of pending) {
            if (![...desired.values()].includes(url)) void network.cancel(requestId).catch(() => {});
        }
        const keep = new Set(desired.values());
        for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key);
        void hydrate(generation).catch(() => {});
    }

    async function hydrate(generation) {
        for (const url of desired.values()) {
            if (disposed || generation !== revision) return;
            if (cache.has(url)) continue;
            while (pending.size && generation === revision && !disposed) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            if (disposed || generation !== revision) return;
            const requestId = 'osu-art-' + generation + '-' + cache.size;
            pending.set(requestId, url);
            let image = null;
            try {
                const result = await network.request({
                    url, requestId, headers: { accept: 'image/jpeg,image/png', range: 'bytes=0-49151' },
                });
                const mime = result.headers?.['content-type']?.split(';')[0];
                const expected = Number(result.headers?.['content-range']?.match(/\/(\d+)$/u)?.[1] ?? 0);
                if (result.ok && expected <= 49152 && ['image/jpeg', 'image/png'].includes(mime)
                    && result.bodyBase64?.length <= 65536) image = `data:${mime};base64,${result.bodyBase64}`;
            } catch {}
            finally { pending.delete(requestId); }
            if (generation === revision && !disposed) {
                cache.set(url, image);
                if (image) changed();
            }
        }
    }

    return {
        update,
        images() {
            const images = {};
            let used = 0;
            for (const [key, url] of desired) {
                const image = cache.get(url);
                if (!image || used + image.length > budget) continue;
                images[key] = image;
                used += image.length;
            }
            return images;
        },
        dispose() {
            disposed = true;
            for (const request of pending.keys()) void network.cancel(request).catch(() => {});
            cache.clear();
        },
    };
}
