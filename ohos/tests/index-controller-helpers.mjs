import {readFileSync} from 'node:fs';
const original=readFileSync(new URL('./library-ui-flow.test.mjs',import.meta.url),'utf8');
const entry=new URL('../entry/',import.meta.url).href;
const prefix=original.slice(0,original.indexOf('\ntest(')).replaceAll("'../entry/","'"+entry);
const module=await import('data:text/javascript,'+encodeURIComponent(prefix+'\nexport {setup};'));
export const setupIndex=module.setup;
