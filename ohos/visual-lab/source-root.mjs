import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=new URL('./',import.meta.url);
const candidates=process.env.MFP_CORE_DIR ? [pathToFileURL(process.env.MFP_CORE_DIR.replace(/\/$/,'')+'/')] : [new URL('../entry/src/main/ets/core/',root),new URL('../MultiFunPlayer-ohos/ohos/entry/src/main/ets/core/',root)];
export const core=candidates.find(p=>existsSync(new URL('VideoInteraction.ts',p)));
if(!core)throw new Error('Cannot find production core modules. Set MFP_CORE_DIR to entry/src/main/ets/core.');
