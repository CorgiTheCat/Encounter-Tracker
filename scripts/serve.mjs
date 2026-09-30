import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, extname } from 'node:path';
const root = await realpath(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.PORT || 5173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.txt':'text/plain; charset=utf-8' };
createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = await realpath(resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname)));
    if ((await stat(file)).isDirectory()) file = await realpath(resolve(file, 'index.html'));
    const pathWithin = relative(root, file);
    if (pathWithin.startsWith('..') || isAbsolute(pathWithin)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://localhost:${port} (open in Owlbear for interactive features)`));
