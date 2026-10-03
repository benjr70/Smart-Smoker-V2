// Throwaway static server for the Voice Fill real-phone feasibility run (#691).
// Sends the cross-origin isolation headers threaded WASM needs, never caches,
// and appends every result the page posts to results.jsonl.
import { createServer } from 'node:http';
import { appendFile, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8099);
const HOST = process.env.HOST ?? '127.0.0.1';
const RESULTS = join(ROOT, 'results.jsonl');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.jsonl': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
};

const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/result') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const row = { receivedAt: new Date().toISOString(), ...JSON.parse(body) };
      await appendFile(RESULTS, JSON.stringify(row) + '\n');
      console.log('result', row.kind, row.candidate ?? '', row.device ?? '');
      res.writeHead(204, HEADERS).end();
    } catch (err) {
      res.writeHead(400, HEADERS).end(String(err));
    }
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403, HEADERS).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, {
      ...HEADERS,
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    });
    res.end(data);
  } catch {
    res.writeHead(404, HEADERS).end('not found');
  }
}).listen(PORT, HOST, () => console.log(`voice-fill-feasibility on http://${HOST}:${PORT}`));
