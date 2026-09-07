import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const directory = resolve(process.argv[2] ?? 'packages/player/dist');
const port = Number(process.argv[3] ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let target = resolve(directory, '.' + pathname);
    if (target !== directory && !target.startsWith(directory + sep)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': types[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('File not found');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`StateBeats: http://127.0.0.1:${port}/ — serving ${directory}`),
);
