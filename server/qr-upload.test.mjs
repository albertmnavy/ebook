import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.QR_STORAGE_DIR = await mkdtemp(path.join(tmpdir(), 'infotech-qr-'));
const storage = await import('./qr-storage.mjs');
await storage.initializeQrStorage();

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('accepts a valid PNG signature when the declared type is allowed', async () => {
  const result = await storage.validateQrImage({ buffer: png, declaredType: 'image/png' });
  assert.deepEqual(result, { contentType: 'image/png', extension: 'png' });
});

test('rejects SVG and other non-raster uploads', async () => {
  await assert.rejects(
    storage.validateQrImage({ buffer: Buffer.from('<svg><script>alert(1)</script></svg>'), declaredType: 'image/svg+xml' }),
    /PNG, JPG, or WEBP/,
  );
});

test('rejects an oversized image before storage', async () => {
  await assert.rejects(
    storage.validateQrImage({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), declaredType: 'image/png' }),
    /5 MB or smaller/,
  );
});

test('stores, replaces, reads, and deletes only safe generated keys', async () => {
  assert.equal(storage.qrStorageReady(), true);
  const firstKey = 'qr/11111111-1111-4111-8111-111111111111.png';
  const secondKey = 'qr/22222222-2222-4222-8222-222222222222.png';
  await storage.putQrImage({ key: firstKey, body: png, contentType: 'image/png' });
  assert.equal((await stat(path.join(process.env.QR_STORAGE_DIR, firstKey))).isFile(), true);
  await storage.putQrImage({ key: secondKey, body: png, contentType: 'image/png' });
  assert.deepEqual((await storage.getQrImage(secondKey)).body, await readFile(path.join(process.env.QR_STORAGE_DIR, secondKey)));
  await storage.deleteQrImage(firstKey);
  await assert.rejects(stat(path.join(process.env.QR_STORAGE_DIR, firstKey)));
  assert.throws(() => storage.safeQrStorageKey('qr/../../outside.png'), /invalid/);
  await storage.initializeQrStorage();
  assert.equal((await storage.getQrImage(secondKey)).contentType, 'image/png');
});

test.after(async () => {
  await rm(process.env.QR_STORAGE_DIR, { recursive: true, force: true });
});
