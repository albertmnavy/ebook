import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { config } from './config.mjs';

export const QR_MAX_BYTES = config.qrStorage.maxBytes;
export const QR_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const QR_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const QR_KEY_PATTERN = /^qr\/[a-f0-9-]{36}\.(?:png|jpg|webp)$/;
let storageAvailable = false;

export async function initializeQrStorage() {
  storageAvailable = false;
  if (!config.qrStorage.directory || !path.isAbsolute(config.qrStorage.directory)) return false;
  try {
    await mkdir(config.qrStorage.directory, { recursive: true });
    await access(config.qrStorage.directory, fsConstants.R_OK | fsConstants.W_OK);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

export function qrStorageReady() {
  return storageAvailable;
}

export function requireQrStorage() {
  if (!qrStorageReady()) {
    const error = new Error('QR image storage is not configured or unavailable.');
    error.status = 503;
    throw error;
  }
}

export function safeQrStorageKey(key) {
  if (typeof key !== 'string' || !QR_KEY_PATTERN.test(key)) {
    const error = new Error('QR image reference is invalid.');
    error.status = 400;
    throw error;
  }
  const root = path.resolve(config.qrStorage.directory);
  const candidate = path.resolve(root, key);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    const error = new Error('QR image reference is invalid.');
    error.status = 400;
    throw error;
  }
  return candidate;
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
  const destination = safeQrStorageKey(key);
  if (!Buffer.isBuffer(body) || body.length > QR_MAX_BYTES || !QR_CONTENT_TYPES.has(contentType)) throw new Error('QR image upload is invalid.');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, body, { flag: 'wx', mode: 0o600 });
  return key;
}

export async function deleteQrImage(key) {
  if (!key || !qrStorageReady()) return;
  await rm(safeQrStorageKey(key), { force: true });
}

export async function getQrImage(key) {
  requireQrStorage();
  const body = await readFile(safeQrStorageKey(key));
  const detected = await validateQrImage({ buffer: body });
  return { body, contentType: detected.contentType };
}
