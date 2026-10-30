// Local preview only. Production hosting serves dist/ without a Node server.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { assets, root } = require('./build.cjs');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.md': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  let asset;
  try { asset = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
  catch { response.writeHead(400).end(); return; }
  if (!assets.includes(asset)) { response.writeHead(404).end('Not found'); return; }
  try {
    const data = await fs.readFile(path.join(root, asset));
    response.writeHead(200, { 'Content-Type': `${types[path.extname(asset)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(500).end('Asset unavailable'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Zenith: http://127.0.0.1:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
