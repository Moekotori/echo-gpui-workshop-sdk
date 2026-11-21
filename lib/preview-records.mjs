// Records belong to one offline preview session. Mirror native revision and quota checks.
export function previewRecordCommands() {
    const buckets = new Map();
    function bucket(name) {
        identifier(name);
        if (!buckets.has(name)) buckets.set(name, { revision: 0, rows: new Map() });
        return buckets.get(name);
    }
    function identifier(value) {
        if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value)) throw Error('record-key-invalid');
        return value;
    }
    function positive(value) {
        if (!Number.isSafeInteger(value) || value < 1) throw Error('record-limit-invalid');
        return value;
    }
    function check(rows, key, expected) {
        identifier(key);
        if (expected !== undefined && expected !== null) positive(expected);
        if (expected !== undefined && (rows.get(key)?.revision ?? null) !== expected) throw Error('record-conflict');
    }
    return {
        'storage.records.get': ({ bucket: name, key }) => {
            const row = bucket(name).rows.get(identifier(key));
            return row ? { value: row.value, summary: row.summary, revision: row.revision } : null;
        },
        'storage.records.list': ({ bucket: name, limit, before }) => {
            if (positive(limit) > 50) throw Error('record-limit-invalid');
            const cursor = before === undefined ? Infinity : positive(before);
            const rows = [...bucket(name).rows.values()].filter(row => row.revision < cursor)
                .sort((a, b) => b.revision - a.revision);
            const items = rows.slice(0, limit).map(({ key, summary, revision }) => ({ key, summary, revision }));
            return { items, nextCursor: rows.length > limit ? items.at(-1).revision : null };
        },
        'storage.records.set': ({ bucket: name, key, value, summary = null, limits, expectedRevision }) => {
            const store = bucket(name);
            check(store.rows, key, expectedRevision);
            if (value === undefined) throw Error('storage-value-invalid');
            if (Buffer.byteLength(JSON.stringify(summary)) > 2048) throw Error('record-summary-too-large');
            const bytes = Buffer.byteLength(JSON.stringify({ value, summary }));
            let total = bytes;
            for (const row of store.rows.values()) if (row.key !== key) total += row.bytes;
            if (store.rows.size + Number(!store.rows.has(key)) > positive(limits?.maxEntries)
                || total > positive(limits?.maxBytes)) throw Error('record-storage-full');
            const revision = ++store.revision;
            store.rows.set(key, { key, value, summary, bytes, revision });
            return { revision };
        },
        'storage.records.remove': ({ bucket: name, key, expectedRevision }) => {
            const { rows } = bucket(name);
            check(rows, key, expectedRevision);
            rows.delete(key);
            return null;
        },
    };
}
