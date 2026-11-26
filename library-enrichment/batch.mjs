import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidatesFor, lookupKinds } from './inventory.mjs';

const INDEX_ENTRY_BYTES = 12;

async function writeAt(file, data, position) {
    let written = 0;
    while (written < data.length) {
        const { bytesWritten } = await file.write(data, written, data.length - written, position + written);
        if (!bytesWritten) throw new Error('无法写入批量结果。');
        written += bytesWritten;
    }
}

async function readAt(file, size, position) {
    const data = Buffer.allocUnsafe(size);
    let read = 0;
    while (read < size) {
        const { bytesRead } = await file.read(data, read, size - read, position + read);
        if (!bytesRead) throw new Error('批量结果读取不完整。');
        read += bytesRead;
    }
    return data;
}

// The index has one fixed-size entry per track so paging never loads the rest of the batch.
export class BatchStore {
    static async create() {
        const directory = await mkdtemp(join(tmpdir(), 'echo-enrichment-batch-'));
        let records, index;
        try {
            records = await open(join(directory, 'records'), 'wx+');
            index = await open(join(directory, 'index'), 'wx+');
            return new BatchStore(directory, records, index);
        } catch (error) {
            await Promise.allSettled([records?.close(), index?.close()]);
            await rm(directory, { recursive: true, force: true });
            throw error;
        }
    }

    constructor(directory, records, index) {
        this.directory = directory;
        this.records = records;
        this.index = index;
        this.end = 0;
    }

    async put(position, item) {
        const data = Buffer.from(JSON.stringify(item));
        const recordOffset = this.end;
        const entry = Buffer.allocUnsafe(INDEX_ENTRY_BYTES);
        entry.writeBigUInt64LE(BigInt(recordOffset));
        entry.writeUInt32LE(data.length, 8);
        await writeAt(this.records, data, recordOffset);
        await writeAt(this.index, entry, position * INDEX_ENTRY_BYTES);
        this.end += data.length;
    }

    async range(start, count) {
        if (!count) return [];
        const entries = await readAt(this.index, count * INDEX_ENTRY_BYTES, start * INDEX_ENTRY_BYTES);
        const rows = [];
        for (let offset = 0; offset < entries.length; offset += INDEX_ENTRY_BYTES) {
            const length = entries.readUInt32LE(offset + 8);
            const position = Number(entries.readBigUInt64LE(offset));
            rows.push(JSON.parse(await readAt(this.records, length, position)));
        }
        return rows;
    }

    async close() {
        await Promise.allSettled([this.records.close(), this.index.close()]);
        await rm(this.directory, { recursive: true, force: true });
    }
}

// Local catalog IDs are decimal u64-compatible strings, ordered by the host's scan cursor.
export function compareIds(a, b) {
    return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

export function batchDisposition(item, scope) {
    if (!lookupKinds(item.track, scope).length) return 'resolved';
    return item.kinds.some(kind => candidatesFor(item.track, kind, item.results[kind]).length) ? 'matched' : 'unmatched';
}
