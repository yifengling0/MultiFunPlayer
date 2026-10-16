import { fileIo } from '@kit.CoreFileKit';
import { BusinessError } from '@kit.BasicServicesKit';
import zlib from '@ohos.zlib';
import { ScriptZip, ScriptZipCandidate, ScriptZipInflateResult } from '../core/ScriptZip';

/** Opens only an already-authorized archive URI/path. No extraction, writes,
 * parent traversal, background scanning, persisted grants or permissions. */
export class ScriptZipFiles {
  private static readonly READ_CHUNK_BYTES: number = 64 * 1024;

  static async readScripts(uri: string,
    isCurrent: () => boolean = (): boolean => true): Promise<ScriptZipCandidate[]> {
    ScriptZip.checkCurrent(isCurrent);
    if (uri.length === 0 || uri.length > 4096 || /[\u0000-\u001f\u007f-\u009f]/.test(uri)) {
      throw new Error('Invalid ZIP archive URI.');
    }
    let file: fileIo.File | undefined = undefined;
    let bytes: Uint8Array;
    try {
      file = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY | fileIo.OpenMode.NOFOLLOW | fileIo.OpenMode.NONBLOCK);
      ScriptZip.checkCurrent(isCurrent);
      const stat = await fileIo.stat(file.fd);
      ScriptZip.checkCurrent(isCurrent);
      if (!stat.isFile() || !Number.isInteger(stat.size) || stat.size < 22 || stat.size > ScriptZip.MAX_ARCHIVE_BYTES) {
        throw new Error('The script ZIP must be a regular archive no larger than 32 MiB.');
      }
      bytes = new Uint8Array(stat.size);
      let offset = 0;
      while (offset < stat.size) {
        ScriptZip.checkCurrent(isCurrent);
        const chunk = new ArrayBuffer(Math.min(ScriptZipFiles.READ_CHUNK_BYTES, stat.size - offset));
        const count = await fileIo.read(file.fd, chunk);
        ScriptZip.checkCurrent(isCurrent);
        if (!Number.isInteger(count) || count <= 0 || count > chunk.byteLength) {
          throw new Error('ZIP read ended unexpectedly. Refresh the library and retry.');
        }
        bytes.set(new Uint8Array(chunk, 0, count), offset);
        offset += count;
      }
      const extraCount = await fileIo.read(file.fd, new ArrayBuffer(1));
      ScriptZip.checkCurrent(isCurrent);
      if (extraCount !== 0) { throw new Error('The ZIP archive changed while being read. Refresh the library and retry.'); }
    } catch (error) {
      ScriptZip.checkCurrent(isCurrent);
      const problem = error as BusinessError;
      if (problem.code === 201 || problem.code === 13900001 || problem.code === 13900012) {
        throw new Error('Cannot read ZIP: permission denied or access expired. Refresh the library and retry.');
      }
      throw new Error(`Cannot read ZIP: ${problem.message || String(error)}`);
    } finally {
      if (file !== undefined) { await fileIo.close(file); }
    }
    ScriptZip.checkCurrent(isCurrent);
    return ScriptZip.readScripts(bytes, uri, ScriptZipFiles.inflateRaw, isCurrent);
  }

  private static async inflateRaw(compressed: Uint8Array, maxOutputBytes: number,
    isCurrent: () => boolean): Promise<ScriptZipInflateResult> {
    ScriptZip.checkCurrent(isCurrent);
    if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > ScriptZip.MAX_ENTRY_BYTES + 1 ||
      compressed.length > ScriptZip.MAX_ARCHIVE_BYTES) { throw new Error('Invalid ZIP decompression bound.'); }
    // API 12+ native streaming zlib accepts caller-sized input/output buffers.
    // The extra sentinel byte detects expansion beyond the declared entry size.
    // Never use decompressFile, which extracts paths and cannot enforce this cap.
    const input = new ArrayBuffer(compressed.length);
    new Uint8Array(input).set(compressed);
    const output = new ArrayBuffer(maxOutputBytes);
    const zip = await zlib.createZip();
    ScriptZip.checkCurrent(isCurrent);
    let initialized = false;
    try {
      const init = await zip.inflateInit2({}, -15);
      initialized = init === zlib.ReturnStatus.OK;
      ScriptZip.checkCurrent(isCurrent);
      if (!initialized) { throw new Error('Cannot initialize ZIP DEFLATE reader.'); }
      const status = await zip.inflate({ nextIn: input, availableIn: input.byteLength,
        nextOut: output, availableOut: output.byteLength }, zlib.CompressFlushMode.FINISH);
      ScriptZip.checkCurrent(isCurrent);
      const stream = await zip.getZStream();
      ScriptZip.checkCurrent(isCurrent);
      if (status !== zlib.ReturnStatus.STREAM_END || stream.totalIn !== input.byteLength ||
        stream.totalOut === undefined || !Number.isInteger(stream.totalOut) ||
        stream.totalOut < 0 || stream.totalOut > maxOutputBytes) {
        throw new Error('Malformed, unfinished or oversized ZIP DEFLATE stream.');
      }
      return { bytes: new Uint8Array(output, 0, stream.totalOut), consumedBytes: stream.totalIn };
    } finally {
      // Cancellation and inflate failures still release native stream state.
      if (initialized) { await zip.inflateEnd({}); }
      ScriptZip.checkCurrent(isCurrent);
    }
  }
}
