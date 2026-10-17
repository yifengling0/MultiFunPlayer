/** Trusted adapter only. Root is the app-owned, symlink-free Download namespace.
 * All IO runs off the UI thread. Await each operation before the next for a token.
 * Errors have numeric errno string codes; 117 means a final file was published,
 * but directory durability sync failed. Never present a multi-file atomic commit.
 */
export const prepareRoot: (appDownloadPath: string) => Promise<string>;
export const create: (root: string, finalBasename: string) => Promise<string>;
export const write: (token: string, data: Uint8Array) => Promise<number>;
export const flush: (token: string) => Promise<void>;
export const close: (token: string) => Promise<void>;
export const finalize: (token: string) => Promise<string>;
/** Closes and releases the token, retaining partials and any published files. */
export const abort: (token: string) => Promise<void>;
export const release: (token: string) => Promise<void>;
