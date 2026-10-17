/** A trusted platform adapter, never a user-supplied path. Must be minted from
 * the verified system Download/<this bundle>/recordings directory only.
 * createPartial must be exclusive, reject symlinks and return owned handles.
 * commit must publish without overwriting; abort closes handles and may remove ONLY owned partial artifacts. Never remove a published file on rollback.
 * Implementations must not claim commit success before all flush/close succeed.
 */
export class RecordingPublicationError extends Error {
  readonly publishedFiles: string[];
  constructor(message: string, publishedFiles: ReadonlyArray<string>) { super(message); this.name = 'RecordingPublicationError'; this.publishedFiles = publishedFiles.slice(); }
}
export interface RecordingFile {
  readonly name: string;
  write(bytes: Uint8Array): Promise<number>;
  flush(): Promise<void>;
  close(): Promise<void>;
}
export interface RecordingRootCapability {
  readonly displayPath: string;
  validate(): Promise<void>;
  createPartial(name: string): Promise<RecordingFile>;
  commit(files: ReadonlyArray<RecordingFile>): Promise<ReadonlyArray<string>>;
  abort(files: ReadonlyArray<RecordingFile>): Promise<void>;
}
export async function writeRecordingText(file: RecordingFile, text: string): Promise<void> {
  // Codecs generate ASCII, which is byte-identical UTF-8 without BOM.
  const bytes: Uint8Array = new Uint8Array(text.length);
  for (let i: number = 0; i < text.length; i++) { bytes[i] = text.charCodeAt(i); }
  let offset: number = 0;
  while (offset < bytes.length) {
    const count: number = await file.write(bytes.slice(offset));
    if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - offset) { throw new Error('Invalid or zero recording write receipt.'); }
    offset += count;
  }
}
