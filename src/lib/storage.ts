import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";

export const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf",
};
export const MAX_UPLOAD = 8 * 1024 * 1024;

const root = () => path.resolve(config.uploadDir);

export async function saveUpload(file: File, folder: string) {
  const ext = ALLOWED_MIME[file.type];
  if (!ext) throw new Error("Receipt must be a JPG, PNG, WEBP, HEIC or PDF.");
  if (file.size > MAX_UPLOAD) throw new Error("Receipt must be 8 MB or smaller.");
  const dir = path.join(root(), folder);
  await mkdir(dir, { recursive: true });
  const rel = path.join(folder, crypto.randomUUID() + ext);
  await writeFile(path.join(root(), rel), Buffer.from(await file.arrayBuffer()));
  return rel;
}

export async function readUpload(rel: string) {
  const full = path.resolve(root(), rel);
  if (!full.startsWith(root() + path.sep)) throw new Error("bad path");
  return readFile(full);
}
