const fs = require('node:fs');
const path = require('node:path');
const assets = ['index.html', 'styles.css', 'script.js', 'typing-engine.js', 'session-analytics.js', 'assets/keyboard-hero.svg', 'vendor/chart.umd.min.js', 'vendor/Chart.LICENSE.md'];
const root = path.resolve(__dirname, '..');
function build() {
  for (const asset of assets) {
    const destination = path.join(root, 'dist', asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, asset), destination);
  }
  console.log(`Prepared ${assets.length} static assets in dist/`);
}
if (require.main === module) build();
module.exports = { assets, root, build };
