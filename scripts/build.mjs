import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
await cp(new URL('index.html', root), new URL('index.html', output));
await cp(new URL('src/', root), new URL('src/', output), { recursive: true });
await cp(new URL('public/', root), output, { recursive: true });
console.log('Built dist/ with the local Owlbear SDK. No CDN or bundler download is needed.');
