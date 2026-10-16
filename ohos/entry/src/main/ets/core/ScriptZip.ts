/** ZIP script inputs are virtual resources. sourceUri is identity only, never an
 * extraction path or an argument to fileIo.open. JSON validation happens later. */
export interface ScriptZipCandidate {
  name: string;
  sourceUri: string;
  contents: string;
}

export interface ScriptZipInflateResult {
  bytes: Uint8Array;
  consumedBytes: number;
}

/** Must bound native output allocation to maxOutputBytes before decompressing.
 * It must reject unfinished streams and report consumed compressed bytes. */
export type ScriptZipInflater = (compressed: Uint8Array, maxOutputBytes: number,
  isCurrent: () => boolean) => Promise<ScriptZipInflateResult>;

class ScriptZipEntry {
  name: string = '';
  index: number = 0;
  method: number = 0;
  crc: number = 0;
  size: number = 0;
  compressedSize: number = 0;
  localStart: number = 0;
  dataStart: number = 0;
  localEnd: number = 0;
  directory: boolean = false;
}

/** Bounded, read-only ZIP32 reader. Accepts stored/raw-DEFLATE entries, standard
 * data descriptors, UTF-8 names and ASCII legacy names. Rejects ZIP64, spanning,
 * encryption, non-ASCII legacy encodings, links/special entries, unsafe paths,
 * unsupported flags/methods, overlapping records, padding and trailing data.
 * Every entry (including non-scripts) is bounded and CRC-checked. Nothing is
 * returned if any record fails. Entries retain central-directory order, matching
 * LocalScriptRepository.EnumerateArchive, and names are leaves like entry.Name. */
export class ScriptZip {
  static readonly MAX_ARCHIVE_BYTES: number = 32 * 1024 * 1024;
  static readonly MAX_ENTRY_BYTES: number = 2 * 1024 * 1024;
  static readonly MAX_EXPANDED_BYTES: number = 8 * 1024 * 1024;
  static readonly MAX_ENTRIES: number = 256;
  static readonly MAX_NAME_BYTES: number = 4096;
  private static readonly CRC_TABLE: number[] = ScriptZip.createCrcTable();

  static checkCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) { throw new Error('ZIP read cancelled'); }
  }

  static async readScripts(bytes: Uint8Array, archiveUri: string, inflateRaw: ScriptZipInflater,
    isCurrent: () => boolean = (): boolean => true): Promise<ScriptZipCandidate[]> {
    ScriptZip.checkCurrent(isCurrent);
    if (typeof archiveUri !== 'string' || archiveUri.length === 0 || archiveUri.length > 4096 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(archiveUri)) { throw new Error('Invalid ZIP archive identity.'); }
    const entries = ScriptZip.parse(bytes, isCurrent);
    const scripts: ScriptZipCandidate[] = [];
    for (const entry of entries) {
      ScriptZip.checkCurrent(isCurrent);
      const compressed = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
      let expanded: Uint8Array;
      if (entry.method === 0) { expanded = compressed; }
      else {
        // One sentinel byte detects dishonest size headers without an unbounded
        // allocation. The trusted adapter enforces this ceiling during inflate.
        const result = await inflateRaw(compressed, entry.size + 1, isCurrent);
        ScriptZip.checkCurrent(isCurrent);
        if (!(result.bytes instanceof Uint8Array) || result.consumedBytes !== entry.compressedSize) {
          throw new Error('Malformed ZIP DEFLATE stream or trailing compressed data.');
        }
        expanded = result.bytes;
      }
      if (expanded.byteLength !== entry.size) { throw new Error('ZIP expanded size does not match its header.'); }
      if (ScriptZip.crc32(expanded, isCurrent) !== entry.crc) { throw new Error('ZIP entry CRC mismatch.'); }
      if (!entry.directory && entry.name.toLowerCase().endsWith('.funscript')) {
        const leaf = entry.name.slice(entry.name.lastIndexOf('/') + 1);
        const contents = ScriptZip.decodeUtf8(expanded, isCurrent).replace(/^\ufeff/, '');
        scripts.push({ name: leaf, sourceUri: `zip:${encodeURIComponent(archiveUri)}#entry=${entry.index}`, contents: contents });
      }
    }
    ScriptZip.checkCurrent(isCurrent);
    return scripts;
  }

  private static requireRange(start: number, length: number, limit: number): void {
    if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length < 0 || start > limit - length) {
      throw new Error('Malformed or truncated ZIP record.');
    }
  }

  private static u16(bytes: Uint8Array, offset: number): number {
    ScriptZip.requireRange(offset, 2, bytes.length);
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  private static u32(bytes: Uint8Array, offset: number): number {
    ScriptZip.requireRange(offset, 4, bytes.length);
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  private static validateExtra(bytes: Uint8Array, start: number, length: number): void {
    const end = start + length;
    ScriptZip.requireRange(start, length, bytes.length);
    let cursor = start;
    while (cursor < end) {
      ScriptZip.requireRange(cursor, 4, end);
      const tag = ScriptZip.u16(bytes, cursor);
      const size = ScriptZip.u16(bytes, cursor + 2);
      if (tag === 0x0001) { throw new Error('ZIP64 archives are not supported.'); }
      if (tag === 0x9901 || tag === 0x0017) { throw new Error('Encrypted ZIP archives are not supported.'); }
      ScriptZip.requireRange(cursor + 4, size, end);
      cursor += 4 + size;
    }
  }

  private static validateName(bytes: Uint8Array, start: number, length: number, flags: number,
    isCurrent: () => boolean): string {
    if (length < 1 || length > ScriptZip.MAX_NAME_BYTES) { throw new Error('ZIP entry name exceeds the supported limit.'); }
    const encoded = bytes.subarray(start, start + length);
    if ((flags & 0x0800) === 0 && encoded.some((value: number): boolean => value >= 128)) {
      throw new Error('ZIP entry names must use UTF-8 or ASCII; legacy filename encodings are not supported.');
    }
    const name = ScriptZip.decodeUtf8(encoded, isCurrent);
    if (name.startsWith('/') || /[\\:\u0000-\u001f\u007f-\u009f]/.test(name) || /%(?:2e|2f|5c|00|25)/i.test(name)) {
      throw new Error('Unsafe ZIP entry path.');
    }
    const path = name.endsWith('/') ? name.slice(0, -1) : name;
    if (path.split('/').some((part: string): boolean => part.length === 0 || part === '.' || part === '..')) {
      throw new Error('Unsafe ZIP entry path.');
    }
    return name;
  }

  private static parse(bytes: Uint8Array, isCurrent: () => boolean): ScriptZipEntry[] {
    if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > ScriptZip.MAX_ARCHIVE_BYTES) {
      throw new Error('Choose a valid ZIP no larger than 32 MiB.');
    }
    let end = -1;
    const earliest = Math.max(0, bytes.length - 22 - 65535);
    for (let cursor = bytes.length - 22; cursor >= earliest; cursor--) {
      if (ScriptZip.u32(bytes, cursor) === 0x06054b50 && cursor + 22 + ScriptZip.u16(bytes, cursor + 20) === bytes.length) {
        end = cursor; break;
      }
    }
    if (end < 0) { throw new Error('ZIP end record is missing or malformed.'); }
    const count = ScriptZip.u16(bytes, end + 10);
    const directorySize = ScriptZip.u32(bytes, end + 12);
    const directoryStart = ScriptZip.u32(bytes, end + 16);
    if (count === 0xffff || directorySize === 0xffffffff || directoryStart === 0xffffffff ||
      (end >= 20 && ScriptZip.u32(bytes, end - 20) === 0x07064b50)) { throw new Error('ZIP64 archives are not supported.'); }
    if (ScriptZip.u16(bytes, end + 4) !== 0 || ScriptZip.u16(bytes, end + 6) !== 0 ||
      ScriptZip.u16(bytes, end + 8) !== count) { throw new Error('Multi-disk ZIP archives are not supported.'); }
    if (count > ScriptZip.MAX_ENTRIES) { throw new Error('ZIP archives are limited to 256 entries.'); }
    ScriptZip.requireRange(directoryStart, directorySize, end);
    if (directoryStart + directorySize !== end) { throw new Error('Malformed ZIP central directory.'); }
    const entries: ScriptZipEntry[] = [];
    let cursor = directoryStart;
    let expandedTotal = 0;
    for (let index = 0; index < count; index++) {
      ScriptZip.checkCurrent(isCurrent);
      ScriptZip.requireRange(cursor, 46, end);
      if (ScriptZip.u32(bytes, cursor) !== 0x02014b50) { throw new Error('Malformed ZIP central-directory entry.'); }
      const version = ScriptZip.u16(bytes, cursor + 6);
      const flags = ScriptZip.u16(bytes, cursor + 8);
      const method = ScriptZip.u16(bytes, cursor + 10);
      if ((flags & 0x2041) !== 0) { throw new Error('Encrypted ZIP archives are not supported.'); }
      if ((flags & ~0x080e) !== 0 || (method === 0 && (flags & 0x0006) !== 0)) {
        throw new Error('Unsupported ZIP entry flags.');
      }
      if (method !== 0 && method !== 8) { throw new Error('Only stored or DEFLATE ZIP entries are supported.'); }
      if (version > 20) { throw new Error('Unsupported ZIP format version (including ZIP64).'); }
      const entry = new ScriptZipEntry();
      entry.index = index; entry.method = method;
      entry.crc = ScriptZip.u32(bytes, cursor + 16);
      entry.compressedSize = ScriptZip.u32(bytes, cursor + 20);
      entry.size = ScriptZip.u32(bytes, cursor + 24);
      entry.localStart = ScriptZip.u32(bytes, cursor + 42);
      if (entry.size === 0xffffffff || entry.compressedSize === 0xffffffff || entry.localStart === 0xffffffff) {
        throw new Error('ZIP64 archives are not supported.');
      }
      if (entry.size > ScriptZip.MAX_ENTRY_BYTES || entry.compressedSize > ScriptZip.MAX_ARCHIVE_BYTES) {
        throw new Error('ZIP entries must expand to at most 2 MiB.');
      }
      expandedTotal += entry.size;
      if (expandedTotal > ScriptZip.MAX_EXPANDED_BYTES) { throw new Error('ZIP expanded contents exceed 8 MiB.'); }
      if (method === 0 && entry.size !== entry.compressedSize) { throw new Error('Malformed stored ZIP entry size.'); }
      const nameLength = ScriptZip.u16(bytes, cursor + 28);
      const extraLength = ScriptZip.u16(bytes, cursor + 30);
      const commentLength = ScriptZip.u16(bytes, cursor + 32);
      if (ScriptZip.u16(bytes, cursor + 34) !== 0) { throw new Error('Multi-disk ZIP archives are not supported.'); }
      ScriptZip.requireRange(cursor + 46, nameLength + extraLength + commentLength, end);
      entry.name = ScriptZip.validateName(bytes, cursor + 46, nameLength, flags, isCurrent);
      ScriptZip.validateExtra(bytes, cursor + 46 + nameLength, extraLength);
      const attributes = ScriptZip.u32(bytes, cursor + 38);
      const fileType = (attributes >>> 16) & 0xf000;
      if (fileType === 0xa000) { throw new Error('ZIP symbolic links are not supported.'); }
      if (fileType !== 0 && fileType !== 0x8000 && fileType !== 0x4000) { throw new Error('ZIP special files are not supported.'); }
      entry.directory = entry.name.endsWith('/');
      if (((fileType === 0x4000 || (attributes & 0x10) !== 0) && !entry.directory) ||
        (entry.directory && fileType === 0x8000)) {
        throw new Error('Conflicting ZIP directory attributes.');
      }
      if (entry.directory && (entry.size !== 0 || entry.crc !== 0)) { throw new Error('Malformed ZIP directory contents.'); }
      ScriptZip.validateLocal(bytes, entry, flags, version, cursor + 46, nameLength, directoryStart);
      entries.push(entry);
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    if (cursor !== end) { throw new Error('ZIP central-directory count or size mismatch.'); }
    // Reject overlap, hidden entries, self-extracting prefixes and ambiguous gaps.
    const byOffset = entries.slice().sort((a: ScriptZipEntry, b: ScriptZipEntry): number => a.localStart - b.localStart);
    let localEnd = 0;
    for (const entry of byOffset) {
      if (entry.localStart !== localEnd) { throw new Error('Overlapping or unsupported ZIP local record layout.'); }
      localEnd = entry.localEnd;
    }
    if (localEnd !== directoryStart) { throw new Error('Unsupported ZIP padding or hidden local records.'); }
    return entries;
  }

  private static validateLocal(bytes: Uint8Array, entry: ScriptZipEntry, flags: number, version: number,
    centralNameStart: number, nameLength: number, limit: number): void {
    const start = entry.localStart;
    ScriptZip.requireRange(start, 30, limit);
    if (ScriptZip.u32(bytes, start) !== 0x04034b50 || ScriptZip.u16(bytes, start + 4) !== version ||
      ScriptZip.u16(bytes, start + 6) !== flags || ScriptZip.u16(bytes, start + 8) !== entry.method ||
      ScriptZip.u16(bytes, start + 26) !== nameLength) { throw new Error('ZIP local and central headers disagree.'); }
    const extraLength = ScriptZip.u16(bytes, start + 28);
    ScriptZip.requireRange(start + 30, nameLength + extraLength, limit);
    for (let offset = 0; offset < nameLength; offset++) {
      if (bytes[start + 30 + offset] !== bytes[centralNameStart + offset]) { throw new Error('ZIP local and central names disagree.'); }
    }
    ScriptZip.validateExtra(bytes, start + 30 + nameLength, extraLength);
    const localCrc = ScriptZip.u32(bytes, start + 14);
    const localCompressed = ScriptZip.u32(bytes, start + 18);
    const localSize = ScriptZip.u32(bytes, start + 22);
    const descriptor = (flags & 8) !== 0;
    if ((!descriptor && (localCrc !== entry.crc || localCompressed !== entry.compressedSize || localSize !== entry.size)) ||
      (descriptor && ((localCrc !== 0 && localCrc !== entry.crc) ||
      (localCompressed !== 0 && localCompressed !== entry.compressedSize) || (localSize !== 0 && localSize !== entry.size)))) {
      throw new Error('ZIP local and central sizes or CRC disagree.');
    }
    entry.dataStart = start + 30 + nameLength + extraLength;
    ScriptZip.requireRange(entry.dataStart, entry.compressedSize, limit);
    entry.localEnd = entry.dataStart + entry.compressedSize;
    if (descriptor) {
      let descriptorStart = entry.localEnd;
      ScriptZip.requireRange(descriptorStart, 12, limit);
      if (ScriptZip.u32(bytes, descriptorStart) === 0x08074b50 && descriptorStart + 16 <= limit &&
        ScriptZip.u32(bytes, descriptorStart + 4) === entry.crc &&
        ScriptZip.u32(bytes, descriptorStart + 8) === entry.compressedSize &&
        ScriptZip.u32(bytes, descriptorStart + 12) === entry.size) { descriptorStart += 4; }
      if (ScriptZip.u32(bytes, descriptorStart) !== entry.crc ||
        ScriptZip.u32(bytes, descriptorStart + 4) !== entry.compressedSize ||
        ScriptZip.u32(bytes, descriptorStart + 8) !== entry.size) { throw new Error('Malformed ZIP data descriptor.'); }
      entry.localEnd = descriptorStart + 12;
    }
  }

  private static createCrcTable(): number[] {
    const table: number[] = [];
    for (let index = 0; index < 256; index++) {
      let value = index;
      for (let bit = 0; bit < 8; bit++) { value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1); }
      table.push(value >>> 0);
    }
    return table;
  }

  static crc32(bytes: Uint8Array, isCurrent: () => boolean = (): boolean => true): number {
    let value = 0xffffffff;
    for (let index = 0; index < bytes.length; index++) {
      if ((index & 0xffff) === 0) { ScriptZip.checkCurrent(isCurrent); }
      value = ScriptZip.CRC_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
  }

  /** Strict UTF-8 without a platform dependency, rejecting overlong, surrogate,
   * truncated and out-of-range code points. Chunked strings avoid argument spread. */
  private static decodeUtf8(bytes: Uint8Array, isCurrent: () => boolean): string {
    const chunks: string[] = [];
    let chunk = '';
    for (let offset = 0; offset < bytes.length;) {
      if (chunk.length >= 8192) { chunks.push(chunk); chunk = ''; ScriptZip.checkCurrent(isCurrent); }
      const first = bytes[offset++];
      let code = first;
      let count = 0;
      let minimum = 0;
      if (first >= 0xc2 && first <= 0xdf) { code = first & 0x1f; count = 1; minimum = 0x80; }
      else if (first >= 0xe0 && first <= 0xef) { code = first & 0x0f; count = 2; minimum = 0x800; }
      else if (first >= 0xf0 && first <= 0xf4) { code = first & 7; count = 3; minimum = 0x10000; }
      else if (first >= 0x80) { throw new Error('ZIP names and scripts must be valid UTF-8.'); }
      if (offset + count > bytes.length) { throw new Error('Truncated ZIP UTF-8 text.'); }
      for (let index = 0; index < count; index++) {
        const next = bytes[offset++];
        if ((next & 0xc0) !== 0x80) { throw new Error('ZIP names and scripts must be valid UTF-8.'); }
        code = (code << 6) | (next & 0x3f);
      }
      if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        throw new Error('ZIP names and scripts must be valid UTF-8.');
      }
      chunk += code <= 0xffff ? String.fromCharCode(code) :
        String.fromCharCode(0xd800 + ((code - 0x10000) >>> 10), 0xdc00 + ((code - 0x10000) & 0x3ff));
    }
    chunks.push(chunk);
    return chunks.join('');
  }
}
