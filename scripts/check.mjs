import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
for (const file of ['src/main.js', 'src/vendor/owlbear-sdk.js', 'scripts/build.mjs', 'scripts/serve.mjs']) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, root))]);
}
const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.author, 'CorgiTheCat');
assert.ok(manifest.name.length <= 45 && manifest.description.length <= 128);
for (const file of [manifest.icon, manifest.action.icon, manifest.action.popover,
  '/src/main.js', '/src/style.css', '/src/fantasy.css', '/src/vendor/owlbear-sdk.js', '/_headers']) {
  await access(new URL(file.replace(/^\//, ''), output));
}
const main = await readFile(new URL('src/main.js', output), 'utf8');
assert.ok(!main.includes('https://esm.sh/'), 'SDK must remain local');
const html = await readFile(new URL('index.html', output), 'utf8');
for (const [, file] of html.matchAll(/(?:src|href)="(\/[^"?]+)"/g)) await access(new URL(file.slice(1), output));
console.log('PASS: JavaScript syntax, manifest, build assets and local SDK. Live multiplayer is a separate manual test.');
const guide = await readFile(new URL('guide/index.html', output), 'utf8');
await access(new URL('guide/guide.css', output));
assert.ok(guide.includes('<html lang="en">'));
assert.ok(!guide.includes('/src/main.js'), 'Guide must work outside Owlbear without starting the tracker');
for (const [, id] of guide.matchAll(/href="#([^"\s]+)"/g)) assert.ok(guide.includes(`id="${id}"`), `Missing guide anchor: ${id}`);
console.log('PASS: Standalone guide assets and section links.');
