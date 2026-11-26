import { randomUUID } from 'node:crypto';

const cacheLimit = 256;
const keyFor = chart => JSON.stringify([chart.beatmapId, chart.mods ?? '']);

function candidates(filters, row) {
    if (row.beatmapId && (row.mode === 'mania' || filters.view === 'bp' && filters.mode === 'mania')) {
        return [{ beatmapId: row.beatmapId, difficulty: row.difficulty, mods: row.analysisMods ?? row.mods }];
    }
    return row.maniaBeatmaps ?? [];
}

export function createManiaDan(invoke, changed) {
    const cache = new Map();
    let entries = new Map();
    let requested = new Map();
    let active;
    let disposed = false;

    function pause() {
        if (active && !active.cancellation) {
            active.cancellation = invoke('cancelDanEstimate', { requestId: active.requestId }).catch(() => {});
        }
    }

    function updateRequests() {
        requested = new Map();
        for (const entry of entries.values()) {
            const chart = entry.charts[entry.index];
            entry.key = keyFor(chart);
            requested.set(entry.key, chart);
        }
        if (active && !requested.has(active.key)) pause();
    }

    async function estimate(job, chart) {
        let result;
        try {
            result = await invoke('estimateDan', {
                requestId: job.requestId, beatmapId: chart.beatmapId, mods: chart.mods ?? '',
            });
        } catch {
            result = null;
        }
        await job.cancellation;
        active = undefined;
        if (disposed) return;
        if (!job.cancellation && requested.has(job.key)) {
            if (cache.size === cacheLimit) cache.delete(cache.keys().next().value);
            cache.set(job.key, result);
        }
        changed();
    }

    return {
        update(filters, rows, refresh) {
            if (refresh) {
                for (const [key, result] of cache) if (result === null) cache.delete(key);
            }
            entries = new Map();
            for (const row of rows) {
                const charts = candidates(filters, row);
                if (charts.length) entries.set(row, { charts, index: 0 });
            }
            updateRequests();
        },
        nextDifficulty(id) {
            for (const [row, entry] of entries) {
                if (row.beatmapsetId !== id || entry.charts.length < 2) continue;
                entry.index = (entry.index + 1) % entry.charts.length;
                updateRequests();
                break;
            }
        },
        get(row) {
            const entry = entries.get(row);
            if (!entry) return undefined;
            return {
                chart: entry.charts[entry.index], multiple: entry.charts.length > 1,
                result: cache.get(entry.key),
            };
        },
        advance() {
            // Start one job per native page render. Refreshes stop requesting work when the page is hidden.
            if (active || disposed) return;
            for (const [key, chart] of requested) {
                if (cache.has(key)) continue;
                active = { key, requestId: randomUUID() };
                void estimate(active, chart);
                break;
            }
        },
        pause,
        dispose() {
            disposed = true;
            pause();
            entries.clear();
            requested.clear();
            cache.clear();
        },
    };
}
