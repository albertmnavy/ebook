import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQrImage } from './qr-storage.mjs';

test('accepts a valid PNG signature when the declared type is allowed', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const result = await validateQrImage({ buffer: png, declaredType: 'image/png' });
  assert.deepEqual(result, { contentType: 'image/png', extension: 'png' });
});

test('rejects SVG and other non-raster uploads', async () => {
  await assert.rejects(
    validateQrImage({ buffer: Buffer.from('<svg><script>alert(1)</script></svg>'), declaredType: 'image/svg+xml' }),
    /PNG, JPG, or WEBP/,
  );
});

test('rejects an oversized image before storage', async () => {
  await assert.rejects(
    validateQrImage({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), declaredType: 'image/png' }),
    /5 MB or smaller/,
  );
});
