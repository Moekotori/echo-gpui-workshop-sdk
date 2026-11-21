// @ts-check
/** @typedef {import('./echo-workshop.js').WorkshopContext} WorkshopContext */
/** @typedef {{id:string,title:string,artist:string,url:string,durationSeconds?:number}} RecordEntry */

const examples = [
    { id: 'flower', title: 'Flower', artist: 'MDN', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
    { id: 'sintel', title: 'Sintel Trailer', artist: 'Blender Foundation', url: 'https://media.w3.org/2010/05/sintel/trailer.mp4' },
];

/** @param {string} value */
function httpsUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('请输入 HTTPS 直链');
    return url.href;
}

/** @param {WorkshopContext} ctx */
export async function activate(ctx) {
    const saved = await ctx.storage.get('catalog');
    let address = typeof saved === 'string' ? saved : '';
    /** @type {RecordEntry[]} */
    let catalog = [];
    let validUntil = 0;
    /** @param {AbortSignal} signal */
    async function records(signal) {
        if (!address) return examples;
        if (Date.now() < validUntil) return catalog;
        const requested = address;
        const response = await fetch(requested, { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]), redirect: 'error' });
        if (!response.ok || !response.body) throw new Error(`目录 HTTP ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '', size = 0;
        try {
            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > 256 * 1024) throw new Error('视频目录超过 256 KiB');
                text += decoder.decode(value, {stream: true});
            }
        } finally { await reader.cancel(); }
        const rows = JSON.parse(text + decoder.decode());
        if (!Array.isArray(rows) || rows.length > 1000) throw new Error('目录应为最多 1000 条记录的数组');
        const entries = rows.filter(row => row && typeof row.id === 'string' && typeof row.title === 'string'
            && typeof row.artist === 'string' && typeof row.url === 'string');
        signal.throwIfAborted();
        if (requested !== address) throw new Error('来源已更新');
        catalog = entries;
        validUntil = Date.now() + 60_000;
        return catalog;
    }
    const save = ctx.pages.registerAction('save', async ({fields}) => {
        const next = fields.catalog.trim() ? httpsUrl(fields.catalog.trim()) : '';
        await ctx.storage.set('catalog', next);
        address = next;
        validUntil = 0;
        return page();
    });
    function page() {
        return { title: '开放视频目录', description: '填写自己的 JSON 目录地址，留空使用 Flower 和 Sintel Trailer 演示片。',
            fields: [{id:'catalog',label:'视频目录 HTTPS 地址',value:address}], actions:[{label:'保存目录',method:save}] };
    }
    ctx.pages.register('catalog', {title:'视频目录'}, page);
    ctx.mv.registerProvider('catalog', {title:'开放视频目录'}, {
        async search({query, signal}) {
            const words = query.trim().toLowerCase().split(/\s+/u);
            return (await records(signal)).filter(row => words.every(word =>
                (row.artist + ' ' + row.title).toLowerCase().includes(word))).slice(0, 24);
        },
        async resolve({candidate, signal}) {
            const row = (await records(signal)).find(row => row.id === candidate.id);
            if (!row) throw new Error('视频已从目录移除');
            return {url:httpsUrl(row.url)};
        },
    });
}
