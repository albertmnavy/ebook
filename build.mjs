import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('src', 'dist', { recursive: true });
await writeFile('dist/runtime-config.js', `window.__INFOTECH_API_URL__ = ${JSON.stringify(process.env.VITE_API_URL || '')};\n`);
console.log('Static site built to dist/');
