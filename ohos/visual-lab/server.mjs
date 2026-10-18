import http from 'node:http';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
const root = new URL('./', import.meta.url);
import {moduleNames as modules,loadModule} from './load-module.mjs';
http.createServer((req,res)=>{
 try {
  const name=new URL(req.url,'http://localhost').pathname;
  if (name==='/manifest.json') {
   res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(modules.map(m=>({file:m+'.ts',sha256:loadModule(m).sha256}))));return;
  }
  if(modules.some(m=>name==='/'+m+'.js')) {
   res.setHeader('Content-Type','application/javascript');res.end(loadModule(name.slice(1,-3)).js);return;
  }
  const file=name==='/'?'index.html':name.slice(1);
  if(!['index.html','app.js','sample.webm'].includes(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'video/webm');res.end(readFileSync(new URL(file,root)));
 } catch(e){res.writeHead(500).end(String(e));}
}).listen(8765,'0.0.0.0',()=>console.log('MFP visual lab http://localhost:8765'));
