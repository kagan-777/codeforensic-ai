// Safe, dependency-free ZIP reader.
//
// Why write our own instead of using a library?
//  - We need full control over every safety limit (ZIP bombs, path traversal,
//    too many files, huge files).
//  - Nothing is ever written to disk: entries are decompressed into memory,
//    read as text, and thrown away. There is no extraction directory an
//    attacker could escape from, and nothing to clean up afterwards.
//  - Uploaded files are DATA. Nothing here executes anything.

import zlib from "node:zlib";

export const ZIP_LIMITS = {
  /** Max size of the uploaded ZIP itself. */
  maxZipBytes: 100 * 1024 * 1024, // 100 MB
  /** Max number of entries listed in the ZIP. */
  maxEntries: 5000,
  /** Max total decompressed bytes we are willing to produce. */
  maxTotalUncompressedBytes: 600 * 1024 * 1024, // 600 MB
  /** Entries whose compression ratio is above this are treated as a ZIP bomb. */
  maxCompressionRatio: 200,
  /** Ratio check only applies to entries bigger than this (tiny files compress well legitimately). */
  ratioCheckMinBytes: 1024 * 1024,
  maxPathLength: 512,
} as const;

export type ZipErrorCode =
  | "INVALID_ZIP"
  | "EMPTY_ZIP"
  | "TOO_LARGE"
  | "TOO_MANY_FILES"
  | "ZIP_BOMB"
  | "UNSAFE_PATH"
  | "UNSUPPORTED_ZIP"
  | "CORRUPTED";

/** Friendly, user-safe messages. No internals. */
const MESSAGES: Record<ZipErrorCode, string> = {
  INVALID_ZIP: "This file is not a valid ZIP archive.",
  EMPTY_ZIP: "The ZIP file is empty.",
  TOO_LARGE: "The ZIP file is too large. The limit is 100 MB.",
  TOO_MANY_FILES: "The ZIP contains too many files (limit: 5,000 entries).",
  ZIP_BOMB: "The ZIP was rejected because it expands to a suspiciously large size.",
  UNSAFE_PATH:
    "The ZIP was rejected because it contains an unsafe file path (for example '../' or an absolute path).",
  UNSUPPORTED_ZIP:
    "This ZIP format is not supported (ZIP64, multi-part or unusual compression). Please re-create the ZIP with a standard tool.",
  CORRUPTED: "The ZIP file appears to be corrupted.",
};

export class ZipError extends Error {
  readonly code: ZipErrorCode;
  readonly userMessage: string;
  constructor(code: ZipErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.userMessage = MESSAGES[code];
  }
}

export interface ZipEntryInfo {
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  isEncrypted: boolean;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
}

export interface ZipDirectory {
  entries: ZipEntryInfo[];
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/**
 * Checks an entry path. Returns the normalized path, or throws UNSAFE_PATH.
 * Exported so it can be unit-tested directly.
 */
export function validateEntryPath(rawPath: string): string {
  if (rawPath.length === 0) throw new ZipError("UNSAFE_PATH", "empty path");
  if (rawPath.length > ZIP_LIMITS.maxPathLength) throw new ZipError("UNSAFE_PATH", "path too long");
  // Null bytes and control characters are never legitimate in file names.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(rawPath)) throw new ZipError("UNSAFE_PATH", "control character");

  const path = rawPath.replace(/\\/g, "/");
  if (path.startsWith("/")) throw new ZipError("UNSAFE_PATH", "absolute path");
  if (/^[a-zA-Z]:/.test(path)) throw new ZipError("UNSAFE_PATH", "drive letter");
  if (path.startsWith("//")) throw new ZipError("UNSAFE_PATH", "UNC path");

  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "..") throw new ZipError("UNSAFE_PATH", "parent directory segment");
  }
  // Collapse "./" and duplicate slashes; keep a trailing "/" for directories.
  const isDir = path.endsWith("/");
  const clean = segments.filter((s) => s !== "" && s !== ".").join("/");
  if (clean.length === 0) throw new ZipError("UNSAFE_PATH", "empty after normalization");
  return isDir ? clean + "/" : clean;
}

function findEndOfCentralDirectory(buf: Buffer): number {
  // EOCD is 22 bytes + optional comment (max 65535).
  const minStart = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= minStart; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/** Reads the ZIP's table of contents without decompressing anything. */
export function readZipDirectory(buf: Buffer): ZipDirectory {
  if (buf.length > ZIP_LIMITS.maxZipBytes) throw new ZipError("TOO_LARGE");
  if (buf.length < 22) throw new ZipError("INVALID_ZIP", "too small");
  const magic = buf.readUInt32LE(0);
  if (magic !== SIG_LOCAL && magic !== SIG_EOCD) throw new ZipError("INVALID_ZIP", "bad signature");

  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new ZipError("CORRUPTED", "no end-of-central-directory record");

  const diskNumber = buf.readUInt16LE(eocd + 4);
  const cdDisk = buf.readUInt16LE(eocd + 6);
  const entriesOnDisk = buf.readUInt16LE(eocd + 8);
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  if (diskNumber !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new ZipError("UNSUPPORTED_ZIP", "multi-disk archive");
  }
  if (totalEntries === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new ZipError("UNSUPPORTED_ZIP", "zip64");
  }
  if (totalEntries === 0) throw new ZipError("EMPTY_ZIP");
  if (totalEntries > ZIP_LIMITS.maxEntries) throw new ZipError("TOO_MANY_FILES");
  if (cdOffset + cdSize > eocd) throw new ZipError("CORRUPTED", "central directory out of bounds");

  const entries: ZipEntryInfo[] = [];
  let p = cdOffset;
  let declaredTotal = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ZipError("CORRUPTED", `bad central header #${i}`);
    }
    const versionMadeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttrs = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipError("UNSUPPORTED_ZIP", "zip64 entry");
    }
    const nameStart = p + 46;
    if (nameStart + nameLen > buf.length) throw new ZipError("CORRUPTED", "name out of bounds");
    const nameBytes = buf.subarray(nameStart, nameStart + nameLen);
    const rawName = flags & 0x0800 ? nameBytes.toString("utf8") : nameBytes.toString("latin1");

    const path = validateEntryPath(rawName);
    const isDirectory = path.endsWith("/");
    const hostOs = versionMadeBy >> 8; // 3 = Unix
    const unixMode = (externalAttrs >>> 16) & 0xffff;
    const isSymlink = hostOs === 3 && (unixMode & 0o170000) === 0o120000;

    if (!isDirectory) {
      declaredTotal += uncompressedSize;
      if (
        uncompressedSize > ZIP_LIMITS.ratioCheckMinBytes &&
        uncompressedSize / Math.max(compressedSize, 1) > ZIP_LIMITS.maxCompressionRatio
      ) {
        throw new ZipError("ZIP_BOMB", `ratio too high for ${path}`);
      }
    }

    entries.push({
      path,
      isDirectory,
      isSymlink,
      isEncrypted: (flags & 0x0001) !== 0,
      compressionMethod: method,
      compressedSize,
      uncompressedSize,
      crc32: crc,
      localHeaderOffset: localOffset,
    });

    p = nameStart + nameLen + extraLen + commentLen;
  }

  if (declaredTotal > ZIP_LIMITS.maxTotalUncompressedBytes * 20) {
    // Declared sizes far beyond anything we'd process: treat as a bomb up front.
    throw new ZipError("ZIP_BOMB", "declared total size too large");
  }
  return { entries };
}

const crc32Fn = (zlib as unknown as { crc32?: (data: Buffer) => number }).crc32;

/**
 * Decompresses ONE entry into memory, with a hard output cap.
 * Even if the ZIP lies about sizes, zlib stops at maxOutputLength.
 */
export function readEntryData(buf: Buffer, entry: ZipEntryInfo): Buffer {
  const lh = entry.localHeaderOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== SIG_LOCAL) {
    throw new ZipError("CORRUPTED", `bad local header for ${entry.path}`);
  }
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buf.length) throw new ZipError("CORRUPTED", `data out of bounds for ${entry.path}`);
  const raw = buf.subarray(dataStart, dataEnd);

  let out: Buffer;
  if (entry.compressionMethod === 0) {
    out = Buffer.from(raw);
  } else if (entry.compressionMethod === 8) {
    try {
      out = zlib.inflateRawSync(raw, { maxOutputLength: entry.uncompressedSize + 1 });
    } catch {
      // Output exceeded the declared size, or the stream is broken.
      throw new ZipError("CORRUPTED", `inflate failed for ${entry.path}`);
    }
  } else {
    throw new ZipError("UNSUPPORTED_ZIP", `compression method ${entry.compressionMethod}`);
  }

  if (out.length !== entry.uncompressedSize) {
    throw new ZipError("CORRUPTED", `size mismatch for ${entry.path}`);
  }
  if (crc32Fn && crc32Fn(out) >>> 0 !== entry.crc32 >>> 0) {
    throw new ZipError("CORRUPTED", `crc mismatch for ${entry.path}`);
  }
  return out;
}

export interface ExtractedFile {
  path: string;
  data: Buffer;
}

export interface ExtractResult {
  files: ExtractedFile[];
  skipped: { path: string; reason: string }[];
  totalEntries: number;
}

/**
 * Decompresses only the entries the caller wants.
 * `select` returns null to extract, or a reason string to skip.
 */
export function extractSelected(
  buf: Buffer,
  dir: ZipDirectory,
  select: (entry: ZipEntryInfo) => string | null,
): ExtractResult {
  const files: ExtractedFile[] = [];
  const skipped: { path: string; reason: string }[] = [];
  let total = 0;

  for (const entry of dir.entries) {
    if (entry.isDirectory) continue;
    if (entry.isSymlink) {
      skipped.push({ path: entry.path, reason: "Symbolic link ignored" });
      continue;
    }
    if (entry.isEncrypted) {
      skipped.push({ path: entry.path, reason: "Encrypted entry ignored" });
      continue;
    }
    const reason = select(entry);
    if (reason !== null) {
      skipped.push({ path: entry.path, reason });
      continue;
    }
    total += entry.uncompressedSize;
    if (total > ZIP_LIMITS.maxTotalUncompressedBytes) throw new ZipError("ZIP_BOMB", "total size exceeded");
    files.push({ path: entry.path, data: readEntryData(buf, entry) });
  }
  return { files, skipped, totalEntries: dir.entries.length };
}
