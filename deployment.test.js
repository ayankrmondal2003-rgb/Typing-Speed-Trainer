const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { assets, root, build } = require('./scripts/build.cjs');
test('deployment: static build contains every HTML asset and no development files', () => {
  build();
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json')));
  assert.equal(config.outputDirectory, 'dist');
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (match[1].startsWith('#')) continue;
    assert.ok(assets.includes(match[1]), match[1]);
  }
  for (const asset of assets) assert.deepEqual(fs.readFileSync(path.join(root, 'dist', asset)), fs.readFileSync(path.join(root, asset)));
  assert.equal(fs.existsSync(path.join(root, 'dist/node_modules')), false);
  assert.equal(fs.existsSync(path.join(root, 'dist/frontend.test.js')), false);
});
test('deployment: local HTTP preview serves all assets and rejects non-app paths', async t => {
  const server = spawn(process.execPath, ['scripts/serve.cjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Preview server timed out')), 5000);
    server.on('error', error => { clearTimeout(timeout); reject(error); });
    server.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
    server.stderr.on('data', data => { clearTimeout(timeout); reject(Error(String(data))); });
  });
  for (const asset of ['', ...assets]) {
    const response = await fetch(`${url}/${asset}`);
    assert.equal(response.status, 200, asset);
    assert.ok((await response.text()).length > 0);
  }
  assert.equal((await fetch(`${url}/package.json`)).status, 404);
  assert.equal((await fetch(`${url}/.env`)).status, 404);
});
