#!/usr/bin/env python3
"""Render and audit the browser approximation with installed Chromium/Playwright.
Never starts OHOS, never contacts an endpoint, and never changes production files.
"""
import argparse, hashlib, json, math, os, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from PIL import Image, ImageOps, ImageDraw
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent

def contrast(a,b):
    def lum(s):
        v=[int(s[i:i+2],16)/255 for i in (1,3,5)]
        v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
        return sum(x*y for x,y in zip(v,[.2126,.7152,.0722]))
    x,y=sorted([lum(a),lum(b)])
    return (y+.05)/(x+.05)

JS_AUDIT=r'''() => {
 const issues=[], all=[...document.querySelectorAll('button,input')];
 const overlay=document.querySelector('.overlay,.snackbar');
 const controls=overlay?[...overlay.querySelectorAll('button,input')]:all;
 const initialScroll=[...document.querySelectorAll('.scroll-pane')].map(e=>[e,e.scrollTop]);
 const inBounds=(r,b)=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
 const viewport={left:0,top:0,right:innerWidth,bottom:innerHeight};
 const textCheck=(e)=>{
   if(e.tagName==='INPUT') return;
   if(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)
     issues.push({type:'control-text-overflow',text:e.textContent.trim(),client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]});
 };
 for(const e of controls) {
   e.scrollIntoView({block:'nearest',inline:'nearest'});
   const r=e.getBoundingClientRect(),s=getComputedStyle(e);
   if(r.height<51.9) issues.push({type:'short-touch-target',text:e.textContent.trim()||e.getAttribute('aria-label'),height:r.height});
   if(r.width<43.9&&e.tagName==='BUTTON') issues.push({type:'narrow-touch-target',text:e.textContent.trim(),width:r.width});
   let bound={...viewport};
   for(let p=e.parentElement;p;p=p.parentElement) {
     const ps=getComputedStyle(p),pr=p.getBoundingClientRect();
     if(/hidden|auto|scroll|clip/.test(ps.overflowY)) {bound.top=Math.max(bound.top,pr.top);bound.bottom=Math.min(bound.bottom,pr.bottom)}
     if(/hidden|auto|scroll|clip/.test(ps.overflowX)) {bound.left=Math.max(bound.left,pr.left);bound.right=Math.min(bound.right,pr.right)}
   }
   if(!inBounds(r,bound)) issues.push({type:'unreachable-or-cropped-control',text:e.textContent.trim()||e.getAttribute('aria-label'),rect:{x:r.x,y:r.y,w:r.width,h:r.height},bound});
   if(e.tagName==='BUTTON'&&!e.classList.contains('icon-button')&&!e.classList.contains('switch')&&parseFloat(s.fontSize)<16)
     issues.push({type:'small-button-text',text:e.textContent.trim(),font:s.fontSize});
   textCheck(e);
 }
 const ends=[];
 for(const e of document.querySelectorAll('[data-audit-end]')) {
   e.scrollIntoView({block:'end'}); const r=e.getBoundingClientRect(),parent=e.closest('.scroll-pane').getBoundingClientRect();
   ends.push({pane:e.dataset.auditEnd,reachable:inBounds(r,parent),scrollHeight:e.closest('.scroll-pane').scrollHeight,clientHeight:e.closest('.scroll-pane').clientHeight});
 }
 for(const [e,top] of initialScroll)e.scrollTop=top;
 if(document.documentElement.scrollWidth>innerWidth)issues.push({type:'document-horizontal-overflow',width:document.documentElement.scrollWidth});
 if(document.querySelector('.message')) {
   const m=document.querySelector('.message');m.scrollTop=m.scrollHeight;
   if(m.scrollHeight>m.clientHeight+1&&!/auto|scroll/.test(getComputedStyle(m).overflowY)) issues.push({type:'long-error-not-scrollable'});
   m.scrollTop=0;
 }
 return {issues,controlsChecked:controls.length,scrollEnds:ends,bodyFont:getComputedStyle(document.body).fontSize,helperFont:getComputedStyle(document.querySelector('.helper')||document.body).fontSize,
  ...window.previewAudit};
}'''

def main():
    args=argparse.ArgumentParser()
    args.add_argument('--quick',action='store_true',help='Only 320 portrait,568 landscape,1280 PC for development')
    args.add_argument('--no-build',action='store_true')
    args=args.parse_args()
    if not args.no_build: subprocess.run(['node',str(HERE/'build-preview.mjs')],cwd=ROOT,check=True)
    manifest=json.loads((HERE/'generated/manifest.json').read_text())
    output=HERE/'screenshots';output.mkdir(exist_ok=True)
    reports=[];errors=[]
    matrix=manifest['viewports']
    if args.quick:matrix=[v for v in matrix if v['id'] in ['phone-320','landscape-568','pc-1280']]
    scenes=['workspace','source','axis','media','output','diagnostic','forms','video','dialog','snackbar']
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--font-render-hinting=none'])
        for vp in matrix:
            context=browser.new_context(viewport={k:vp[k] for k in ['width','height']},device_scale_factor=1,locale='zh-CN',color_scheme='light')
            page=context.new_page()
            for scene in scenes:
                page.goto((HERE/'index.html').as_uri()+f'?viewport={vp["id"]}&scene={scene}',wait_until='load')
                page.wait_for_function('window.previewAudit !== undefined')
                page.evaluate('document.fonts.ready')
                page.screenshot(path=str(output/f'{vp["id"]}-{scene}.png'))
                result=page.evaluate(JS_AUDIT)
                reports.append(result)
                if result['missingSourceLabels']:errors.append({'viewport':vp['id'],'scene':scene,'missingSourceLabels':result['missingSourceLabels']})
                if any(not e['reachable'] for e in result['scrollEnds']):errors.append({'viewport':vp['id'],'scene':scene,'unreachableScrollEnds':result['scrollEnds']})
                if result['issues']:errors.append({'viewport':vp['id'],'scene':scene,'issues':result['issues']})
                if scene=='output':
                    page.locator('#output .error-text').scroll_into_view_if_needed()
                    page.screenshot(path=str(output/f'{vp["id"]}-output-diagnostic.png'))
                if scene=='forms':
                    page.locator('[data-audit-end]').first.scroll_into_view_if_needed()
                    page.screenshot(path=str(output/f'{vp["id"]}-scroll-bottom.png'))
            page.goto((HERE/'index.html').as_uri()+f'?viewport={vp["id"]}&scene=forms&density=compact',wait_until='load')
            page.wait_for_function('window.previewAudit !== undefined')
            page.screenshot(path=str(output/f'{vp["id"]}-explicit-compact.png'))
            compact_result=page.evaluate(JS_AUDIT)
            reports.append(compact_result)
            if compact_result['issues']:errors.append({'viewport':vp['id'],'scene':'explicit-compact','issues':compact_result['issues']})
            context.close()
        browser.close()
    token=manifest['tokens'];contrast_rows=[]
    for name,fg,bg in [('body/card','ink','card'),('helper/card','muted','card'),('helper/page','muted','page'),('button/soft','ink','accentSoft'),('danger/soft','danger','dangerSoft'),('warning/card','warning','card'),('success/card','success','card')]:
        ratio=contrast(token[fg],token[bg]);contrast_rows.append({'pair':name,'ratio':round(ratio,3),'required':4.5,'pass':ratio>=4.5})
    ratio=contrast('#FFFFFF',token['accent']);contrast_rows.append({'pair':'white/accent','ratio':round(ratio,3),'required':4.5,'pass':ratio>=4.5})
    for row in contrast_rows:
        if not row['pass']:errors.append({'contrast':row})
    if manifest['densityDefault']!='readable' or not manifest['explicitCompact']:
        errors.append({'densityContract':{'default':manifest['densityDefault'],'explicit':manifest['explicitCompact']}})
    final={
        'kind':manifest['kind'],'createdAt':datetime.now(timezone.utc).isoformat(),'browser':'Installed /usr/bin/chromium via Python Playwright; device scale factor 1',
        'sourceManifestSha256':hashlib.sha256((HERE/'generated/manifest.json').read_bytes()).hexdigest(),
        'summary':{'viewports':len(matrix),'scenarios':len(reports),'screenshots':len(matrix)*13,'controlsChecked':sum(r['controlsChecked'] for r in reports),'errors':len(errors)},
        'contrast':contrast_rows,'errors':errors,'results':reports,'caveats':manifest['caveats']}
    (HERE/'generated/audit.json').write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n')
    for scene in ['workspace','source','axis','media','output','diagnostic','video','dialog','forms','output-diagnostic','explicit-compact']:
        cards=[]
        for vp in matrix:
            im=Image.open(output/f'{vp["id"]}-{scene}.png').convert('RGB')
            im.thumbnail((384,520))
            canvas=Image.new('RGB',(404,555),'#d8e3e7');canvas.paste(im,((404-im.width)//2,30))
            ImageDraw.Draw(canvas).text((10,10),f'{vp["id"]} {vp["width"]}x{vp["height"]}',fill='#142d3a')
            cards.append(canvas)
        cols=3;rows=math.ceil(len(cards)/cols)
        sheet=Image.new('RGB',(404*cols,555*rows),'white')
        for i,im in enumerate(cards):sheet.paste(im,((i%cols)*404,(i//cols)*555))
        sheet.save(output/f'contact-{scene}.jpg',quality=93)
    print(json.dumps({'summary':final['summary'],'contrast':contrast_rows,'errors':errors[:12]},ensure_ascii=False,indent=2))
    return 1 if errors else 0

if __name__=='__main__':sys.exit(main())
