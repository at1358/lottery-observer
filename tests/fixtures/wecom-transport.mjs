// Test runner preload. No production code path or live robot is involved.
import {appendFileSync,readFileSync} from 'node:fs';
import {publicLoader,publicBridge,publicPortal,publicLine,publicColumn,entryToken} from './public-entry.mjs';
const fetchOriginal=globalThis.fetch;
if(!process.env.QA_WECOM_LOG||!/^5\d{3}$/.test(process.env.PORT||''))throw Error('Local QA environment required');
const RealDate=Date;
if(process.env.QA_CLOCK_FILE){const now=()=>{try{const text=readFileSync(process.env.QA_CLOCK_FILE,'utf8').trim();if(text.startsWith('{')){const clock=JSON.parse(text),base=RealDate.parse(clock.base),started=Number(clock.startedAt);if(Number.isFinite(base)&&Number.isFinite(started))return base+RealDate.now()-started;}const value=RealDate.parse(text);return Number.isFinite(value)?value:RealDate.now();}catch{return RealDate.now();}};globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now()]));}static now(){return now();}};}
globalThis.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url||input.href);
 if(url.hostname==='qa-scope-source.example')return new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+(url.pathname==='/a'?'/history-scope-a.html':'/history-scope-b.html'))),{headers:{'Content-Type':'text/html; charset=utf-8'}});
 if(url.hostname==='qa-baofu.example')return new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+'/baofu-column.html')),{headers:{'Content-Type':'text/html; charset=utf-8'}});
 if(url.hostname==='qa-baofu.example')return new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+'/baofu-column.html')),{headers:{'Content-Type':'text/html; charset=utf-8'}});
 if(url.hostname==='qa-tail-fallback.example')return new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+(url.pathname==='/body.html'?'/tail-fallback-body.html':'/tail-fallback-entry.html'))),{headers:{'Content-Type':'text/html; charset=utf-8'}});
 if(url.hostname==='qa-zhugeliang.example')return new Response(url.pathname==='/'?'<a href="/other">310期:【梅兰竹菊】诸葛孔明</a><a href="/article">310期:【主攻⑨码】诸葛孔明</a>':readFileSync(new URL('zhugeliang-nine.html',import.meta.url)),{headers:{'Content-Type':'text/html; charset=utf-8'}});
 if(url.hostname==='qa-bridge-entry.example')return new Response(publicLoader);
 if(url.hostname==='qa-bridge-script.example')return new Response(publicBridge);
 if(url.hostname==='qa-bridge-action.example'){
  const fields=Object.fromEntries(new URLSearchParams(options.body));if(options.method!=='POST'||fields.data!==entryToken||fields.checked!=='ok'||options.headers['Content-Type']!=='application/x-www-form-urlencoded'||options.headers.Origin!=='https://qa-bridge-entry.example')throw Error('Incorrect public bridge submission');
  return new Response(null,{status:303,headers:{Location:'https://qa-bridge-portal.example/'}});
 }
 if(url.hostname==='qa-bridge-portal.example'){if(options.method==='POST'||options.body)throw Error('303 must switch to GET');return new Response(publicPortal);}
 if(url.hostname==='qa-bridge-line.example')return new Response(url.pathname==='/column.html'?publicColumn:publicLine);
 if(url.hostname==='qa-2025-history.example'){
  const zodiacs=[...'鼠牛虎兔龙蛇马羊猴鸡狗猪'];let html='<ul id="msg">';
  for(let issue=365;issue>=1;issue--){let date=new RealDate(RealDate.UTC(2025,0,issue)).toISOString().slice(0,10);if([240,241,243].includes(issue))date=date.replace('-08-','-8-');const zodiac=zodiacs[issue%12];html+=`<li><dt><b>${String(issue).padStart(3,'0')}</b>期(开奖时间:${date})</dt><dl>`+[1,2,3,4,5,6,7].map(number=>`<div class="ball"><p><span>${String(number).padStart(2,'0')}</span><b>${zodiac}</b></p></div>`).join('')+'</dl></li>';}
  return new Response(html+'</ul>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
 }
 if(url.hostname.startsWith('qa-')&&process.env.QA_FETCH_LOG)appendFileSync(process.env.QA_FETCH_LOG,JSON.stringify({url:url.href,at:new Date().toISOString()})+'\n');
 if(url.hostname==='qa-hourly.example'){
  const name=url.pathname.slice(1);if(!['base','tail','kill'].includes(name))return new Response('Temporary source error',{status:503});
  return new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+'/hourly-'+name+'.html')),{headers:{'Content-Type':'text/html; charset=utf-8'}});
 }
 if(url.hostname==='qa-13349.example'){
  const file=url.pathname==='/'?'7011-entry.html':url.pathname==='/assets/main.js'?'13349-main.js':url.pathname==='/payloads/dh.html'?'7011-frame.html':url.pathname==='/column.html'?'13349-column.html':null;
  return file?new Response(readFileSync(new URL(file,import.meta.url)),{headers:{'Content-Type':'text/html; charset=utf-8'}}):new Response('Not found',{status:404});
 }
 if(url.hostname==='qa-7011.example'){
  const file=url.pathname==='/'?'7011-entry.html':url.pathname==='/assets/main.js'?'7011-main.js':url.pathname==='/seryuq/dh.html'?'7011-frame.html':url.pathname==='/column.html'?'7011-column.html':null;
  return file?new Response(readFileSync(new URL(file,import.meta.url)),{headers:{'Content-Type':'text/html; charset=utf-8'}}):new Response('Not found',{status:404});
 }
 if(url.hostname==='qa-redirect.example'){
  const target=readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+'/redirect-destination.txt'),'utf8').trim();
  return new Response(null,{status:302,headers:{Location:target}});
 }
 if(['qa-landing-one.example','qa-landing-two.example'].includes(url.hostname)){
  if(url.pathname.startsWith('/_1491'))return new Response('<iframe src="/wz/am.html"></iframe>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
  if(url.pathname==='/wz/am.html')return new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+'/redirect-column.html')),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  return new Response('Not found',{status:404});
 }
 if(url.hostname==='qa-entry.example'){
  const name=url.pathname==='/'?'entry-root.html':url.pathname==='/line'?'entry-line.html':url.pathname==='/column'?'entry-column.html':null;
  return name?new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+'/'+name)),{headers:{'Content-Type':'text/html; charset=utf-8'}}):new Response('Not found',{status:404});
 }
 if(url.hostname==='qa-articles.example'){
  if(url.pathname==='/kingdom.html')return new Response(readFileSync(new URL('kingdom-zodiacs.html',import.meta.url)),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  if(['/history-shell.html','/history-body.html','/history-moved.html','/history-again.html'].includes(url.pathname))return new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+'/'+url.pathname.slice(1))),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  if(url.pathname==='/draws.json')return Response.json([{year:2026,issue:302,number:8,zodiac:'羊',drawn_at:'2026-10-29T21:35:00+08:00'}]);
  if(['/latest-base.html','/latest-tail.html'].includes(url.pathname))return new Response(readFileSync(new URL('file:///'+process.env.QA_DATA_DIR.replaceAll('\\','/')+'/'+url.pathname.slice(1).replace('.html','.txt'))),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  if(url.pathname==='/unrelated.html')return new Response(null,{status:302,headers:{Location:'https://unrelated.example/'}});
  const file=url.pathname==='/white.html'?'white-305.html':url.pathname==='/shell.html'?'encrypted-shell-0.html':url.pathname==='/enc/articles/086.json'?'encrypted-payload-0.json':null;
  if(!file)return new Response('Not found',{status:404});return new Response(readFileSync(new URL(file,import.meta.url)),{headers:{'Content-Type':file.endsWith('.json')?'application/json':'text/html; charset=utf-8'}});
 }
 if(url.hostname==='qa-history.example'){
  appendFileSync(process.env.QA_WECOM_LOG,JSON.stringify({kind:'history'})+'\n');
  const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10),numbers=[8,28,40,3,38,49,17],zodiacs=[...'猪兔兔龙蛇马虎'];
  return new Response('<ul id="msg"><li><dt>366期 '+date+'</dt><div class="ball">'+numbers.map((n,i)=>'<p><span>'+n+'</span><b>'+zodiacs[i]+'</b></p>').join('')+'</div></li></ul>');
 }
 if(url.hostname!=='qyapi.weixin.qq.com'){
  if(['127.0.0.1','localhost'].includes(url.hostname)&&/^5\d{3}$/.test(url.port))return fetchOriginal(input,options);
  throw Error('Isolated QA: external request has no fixture');
 }
 if(!['qa-only-robot-key-001','qa-only-robot-failure'].includes(url.searchParams.get('key')))throw Error('Only fake robot keys are allowed in QA');
 appendFileSync(process.env.QA_WECOM_LOG,JSON.stringify({body:JSON.parse(options.body),at:new Date().toISOString()})+'\n');
 await new Promise(resolve=>setTimeout(resolve,80));
 return Response.json(url.searchParams.get('key')==='qa-only-robot-failure'?{errcode:93000,errmsg:'test fixture rejected'}:{errcode:0,errmsg:'ok'});
};
