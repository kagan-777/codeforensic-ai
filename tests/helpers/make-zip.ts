// Minimal ZIP writer used by tests and the demo-zip script.
// Lets tests create normal ZIPs AND deliberately malicious ones.

import zlib from "node:zlib";

export interface ZipInput {
  name: string;
  content: string | Buffer;
  /** 0 = stored, 8 = deflate (default) */
  method?: 0 | 8;
  /** Lie about the uncompressed size (for zip-bomb tests). */
  fakeUncompressedSize?: number;
  /** Mark as a Unix symlink. */
  symlink?: boolean;
}

const crc32 = (zlib as unknown as { crc32: (d: Buffer) => number }).crc32;

export function makeZip(files: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const data = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, "utf8");
    const method = f.method ?? 8;
    const compressed = method === 8 ? zlib.deflateRawSync(data) : data;
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(data) >>> 0;
    const usize = f.fakeUncompressedSize ?? data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(usize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(usize, 24);
    central.writeUInt16LE(name.length, 28);
    const mode = f.symlink ? 0o120777 : f.name.endsWith("/") ? 0o040755 : 0o100644;
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
