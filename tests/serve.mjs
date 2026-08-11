import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 8765);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(root, requested);
    const insideRoot = relative(root, file);

    if (insideRoot.startsWith('..') || insideRoot.includes(':')) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');

    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': mimeTypes[extname(file)] || 'application/octet-stream',
    });
    createReadStream(file).pipe(res);
  } catch (_error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`CensoGT disponible en http://127.0.0.1:${port}/`);
});
