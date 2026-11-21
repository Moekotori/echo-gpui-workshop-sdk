import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function createMvRelay(upstreamHeaders = {}) {
    let stream = null, previous = null, retireTimer;
    function retirePrevious() {
        clearTimeout(retireTimer);
        for (const read of previous?.reads ?? []) read.abort();
        previous = null;
    }
    const server = createServer((request, response) => {
        const current = request.url === stream?.path ? stream : previous;
        const range = request.headers.range;
        if (!current || request.url !== current.path || request.method !== 'GET' ||
            (range && !/^bytes=\d{1,15}-\d{0,15}$/u.test(range)) || current.reads.size >= 3) {
            response.writeHead(404).end();
            return;
        }
        if (current.accessDenied) {
            response.writeHead(403).end();
            return;
        }
        if (current === stream && previous) retirePrevious();
        const controller = new AbortController();
        current.reads.add(controller);
        response.once('close', () => controller.abort());
        response.setTimeout(45_000, () => response.destroy());
        const headers = { ...current.headers,
            Range: range ?? 'bytes=0-' };
        void (async () => {
            const headersTimeout = setTimeout(() => controller.abort(), 8000);
            const upstream = await fetch(current.url, { headers, redirect: 'error', signal: controller.signal })
                .finally(() => clearTimeout(headersTimeout));
            if (upstream.status === 403) {
                current.accessDenied = true;
                await upstream.body?.cancel();
                if (!response.destroyed) response.writeHead(403).end();
                return;
            }
            if (upstream.status !== 206 || !upstream.body || !/^bytes \d+-\d+\/\d+$/u.test(upstream.headers.get('content-range') ?? '')) {
                await upstream.body?.cancel();
                throw new Error('MV 范围读取失败');
            }
            const forwarded = {};
            for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
                const value = upstream.headers.get(name);
                if (value) forwarded[name] = value;
            }
            response.writeHead(upstream.status, forwarded);
            await pipeline(Readable.fromWeb(upstream.body), response);
        })().catch(() => {
            if (!response.headersSent && !response.destroyed) response.writeHead(502).end();
            else response.destroy();
        }).finally(() => current.reads.delete(controller));
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    server.unref();
    const clear = () => {
        retirePrevious();
        for (const read of stream?.reads ?? []) read.abort();
        stream = null;
    };
    return {
        publish(url, headers = upstreamHeaders) {
            if (stream?.accessDenied && String(stream.url) === String(url)
                && JSON.stringify(stream.headers) === JSON.stringify(headers)) {
                throw new Error('视频源已拒绝该地址（403）');
            }
            retirePrevious();
            previous = stream;
            if (previous) {
                retireTimer = setTimeout(retirePrevious, 5000);
                retireTimer.unref();
            }
            const path = `/mv-${randomBytes(24).toString('hex')}.mp4`;
            stream = { path, url, headers, reads: new Set() };
            return `http://127.0.0.1:${server.address().port}${path}`;
        },
        accessDenied() { return stream?.accessDenied === true; },
        clear,
        close() { clear(); server.close(); server.closeAllConnections(); },
    };
}
