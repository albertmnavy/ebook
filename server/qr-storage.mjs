import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fileTypeFromBuffer } from 'file-type';
import { config } from './config.mjs';

export const QR_MAX_BYTES = config.qrStorage.maxBytes;
export const QR_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const QR_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const storageConfigured = Boolean(
  config.qrStorage.endpoint &&
  config.qrStorage.bucket &&
  config.qrStorage.accessKeyId &&
  config.qrStorage.secretAccessKey,
);

const client = storageConfigured
  ? new S3Client({
    endpoint: config.qrStorage.endpoint,
    region: config.qrStorage.region,
    forcePathStyle: config.qrStorage.forcePathStyle,
    credentials: {
      accessKeyId: config.qrStorage.accessKeyId,
      secretAccessKey: config.qrStorage.secretAccessKey,
    },
  })
  : null;

export function qrStorageReady() {
  return Boolean(client);
}

export function requireQrStorage() {
  if (!qrStorageReady()) {
    const error = new Error('QR image storage is not configured.');
    error.status = 503;
    throw error;
  }
}

export async function validateQrImage({ buffer, declaredType = '' }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('Select a QR image to upload.');
    error.status = 400;
    throw error;
  }
  if (buffer.length > QR_MAX_BYTES) {
    const error = new Error('QR image must be 5 MB or smaller.');
    error.status = 400;
    throw error;
  }
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !QR_CONTENT_TYPES.has(detected.mime) || (declaredType && !QR_CONTENT_TYPES.has(declaredType))) {
    const error = new Error('Upload a PNG, JPG, or WEBP image.');
    error.status = 400;
    throw error;
  }
  return { contentType: detected.mime, extension: QR_EXTENSIONS[detected.mime] };
}

export async function putQrImage({ key, body, contentType }) {
  requireQrStorage();
  await client.send(new PutObjectCommand({
    Bucket: config.qrStorage.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=300, must-revalidate',
    ContentDisposition: 'inline',
  }));
  return key;
}

export async function deleteQrImage(key) {
  if (!key || !client) return;
  await client.send(new DeleteObjectCommand({ Bucket: config.qrStorage.bucket, Key: key }));
}

export async function getQrImage(key) {
  requireQrStorage();
  const result = await client.send(new GetObjectCommand({ Bucket: config.qrStorage.bucket, Key: key }));
  if (!result.Body) throw new Error('QR image is unavailable.');
  return {
    body: Buffer.from(await result.Body.transformToByteArray()),
    contentType: result.ContentType || 'application/octet-stream',
  };
}
