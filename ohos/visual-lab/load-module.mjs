import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {core} from './source-root.mjs';
export const moduleNames=['VideoLayout','VideoInteraction','Heatmap'];
export function loadModule(name){
 if(!moduleNames.includes(name))throw new Error('Unknown production module');
 const source=readFileSync(new URL(name+'.ts',core),'utf8');
 // Heatmap's FunscriptDocument import is only used as a type. Production is unchanged.
 const adapted=name==='Heatmap'?source.replace("import { FunscriptDocument } from './Funscript';",''):source;
 return {name,sha256:createHash('sha256').update(source).digest('hex'),js:stripTypeScriptTypes(adapted)};
}
