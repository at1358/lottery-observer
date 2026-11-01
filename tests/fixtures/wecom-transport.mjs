// Test runner preload. No production code path or live robot is involved.
import {appendFileSync,readFileSync} from 'node:fs';
const fetchOriginal=globalThis.fetch;
if(!process.env.QA_WECOM_LOG||!/^5\d{3}$/.test(process.env.PORT||''))throw Error('Local QA environment required');
globalThis.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url||input.href);
 if(url.hostname==='qa-articles.example'){
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
 if(url.hostname!=='qyapi.weixin.qq.com')return fetchOriginal(input,options);
 if(!['qa-only-robot-key-001','qa-only-robot-failure'].includes(url.searchParams.get('key')))throw Error('Only fake robot keys are allowed in QA');
 appendFileSync(process.env.QA_WECOM_LOG,JSON.stringify({body:JSON.parse(options.body),at:new Date().toISOString()})+'\n');
 await new Promise(resolve=>setTimeout(resolve,80));
 return Response.json(url.searchParams.get('key')==='qa-only-robot-failure'?{errcode:93000,errmsg:'test fixture rejected'}:{errcode:0,errmsg:'ok'});
};
