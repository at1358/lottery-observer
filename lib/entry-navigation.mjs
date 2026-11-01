import {load} from 'cheerio/slim';
import {staticDocumentWrites,resolveModule} from './content-resolver.mjs';
import {extractModule} from './extract.mjs';
import {encryptedShell,decryptShellPayload} from './encrypted-shell.mjs';
const normalize=v=>String(v||'').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'');
const decode=v=>{try{return new TextDecoder().decode(Uint8Array.from(atob(v),c=>c.charCodeAt(0)));}catch{return '';}};
const literal=String.raw`["']([^"']+)["']`;
// Decode only the published data formats. Never evaluate remote JavaScript.
export function navigationLinks(html,base,keyword,line='',at=Date.now()){
 const $=load(html),found=[];const origin=new URL(base).origin;
 const add=(href,label,priority=4,type='page')=>{try{const u=new URL(href,base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return;u.hash='';found.push({url:u.href,label,priority,type,referer:base});}catch{}};
 const match=v=>normalize(v).includes(normalize(keyword));
 $('a[href]').each((_,el)=>{const label=$(el).text().trim(),href=$(el).attr('href');if(match(label))add(href,label,0,'column');else if(/线路|入口|进入网站|访问网站/.test(label)&&(!line||normalize(label).includes(normalize(line))))add(href,label,2);});
 const scripts=$('script').map((_,el)=>$(el).text()).get().join('\n');
 for(const m of scripts.matchAll(/JSON\s*\.\s*parse\s*\(\s*atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)\s*\)/g)){
  try{const data=JSON.parse(decode(m[1]));for(const item of Array.isArray(data.quick)?data.quick:[]){if(item.url&&(!line||normalize(item.title).includes(normalize(line))))add(item.url,item.title||'线路入口',2);}}catch{}
 }
 // This public dispatcher constructs a daily script URL from month/day and the
 // encoded entry address. Recognize that exact format instead of running it.
 if(/getMonth\(\)\s*\+\s*1/.test(scripts)&&/api\.2\.JS\?1,/.test(scripts)&&/btoa\(l\)/.test(scripts)){
  const date=new Date(at+8*3600000),md=String(date.getUTCMonth()+1)+date.getUTCDate(),address=base.replace(/^https?:\/\//,'');
  for(const m of scripts.matchAll(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/g)){const suffix=decode(m[1]);if(/^\.[a-z0-9.-]+$/.test(suffix))add('https://gn'+md+suffix+'/api.2.JS?1,'+btoa(address),'入口线路分配',1,'dispatcher');}
 }
 const assigned=scripts.match(/(?:var|let|const)\s+bajm2\s*=\s*atob\(['"]([A-Za-z0-9+/=]+)['"]\)/);
 if(assigned&&/SjFanMiao/.test(scripts)&&/window\.location\.href=/.test(decode(scripts.match(/bajm1\s*=\s*atob\(['"]([^'"]+)/)?.[1]||''))){
  const random=crypto.randomUUID().replace(/-/g,'').slice(0,5);add(decode(assigned[1]).replace(/\+SjFanMiao\+/g,random).replace(/\|/g,'.'),'入口公布的当前线路',1);
 }
 for(const m of scripts.matchAll(new RegExp(String.raw`(?:window\.)?location\s*(?:\.\s*href)?\s*=\s*${literal}`,'g')))add(m[1],'入口跳转',3);
 $('meta[http-equiv]').each((_,el)=>{if($(el).attr('http-equiv')?.toLowerCase()==='refresh'){const url=$(el).attr('content')?.match(/url\s*=\s*['"]?([^'"\s]+)/i)?.[1];if(url)add(url,'入口跳转',3);}});
 $('iframe[src],frame[src],script[src]').each((_,el)=>{try{const url=new URL($(el).attr('src'),base);if(url.origin!==origin)return;const script=el.name==='script';if(script&&!/(?:\/am(?:[-.]|tiezi)|\/index\.|\/nav\.|\/menu\.|\/entry\.|\/bbs|\/payload)/i.test(url.pathname))return;if(/(?:\/xg\.|\/hk\.|\/kuaile\.)/i.test(url.pathname))return;add(url.href,script?'站内栏目脚本':'站内正文',4,script?'script':'page');}catch{}});
 const seen=new Set();return found.sort((a,b)=>a.priority-b.priority).filter(r=>{if(seen.has(r.url))return false;seen.add(r.url);return true;});
}
export async function discoverEntry(entry,options,download,{maxRequests=28,timeoutMs=90000}={}){
 const keyword=String(options.keyword||'').trim();if(!normalize(keyword))throw Error('请填写入口查找的栏目关键词');
 const queue=[{url:entry,type:'page',label:'固定入口',depth:0}],visited=new Set(),started=Date.now();let requests=0,lastError;
 while(queue.length&&requests<maxRequests&&Date.now()-started<timeoutMs){
  const item=queue.shift();if(visited.has(item.url)||item.depth>9)continue;visited.add(item.url);requests++;
  try{
   const data=await download(item.url,item.referer);const trail=[...(item.trail||[]),{label:item.label,url:data.url}];
   if(data.redirectUrl){queue.unshift({url:data.redirectUrl,referer:data.url,label:'入口公布的跳转',depth:item.depth+1,trail});continue;}
   let html=item.encrypted?decryptShellPayload(data.text,item.encrypted.key):item.type==='script'?staticDocumentWrites(data.text):data.text;
   // Dispatcher responses are script data, parsed by navigationLinks below.
   if(item.type==='dispatcher')html='<script>'+data.text+'</script>';
   const base=item.encrypted?.shellUrl||item.documentUrl||data.url;
   if(item.type==='column'){
    const result=await resolveModule({...data,text:html,url:base},options,(url)=>download(url,base));return {...result,navigation:trail,visited:requests+result.visited};
   }
   if(/\d{1,3}\s*期/.test(html)){
    try{const result=extractModule(html,options);return {...result,html,url:base,navigation:trail,visited:requests};}catch(e){lastError=e;}
   }
   const encrypted=encryptedShell(html,base);if(encrypted){queue.unshift({url:encrypted.dataUrl,encrypted,label:'站内栏目列表',depth:item.depth+1,trail});continue;}
   const links=navigationLinks(html,base,keyword,options.line);
   const columns=links.filter(l=>l.type==='column');if(new Set(columns.map(l=>l.url)).size>1)throw Error('入口中有多个同名栏目，请使用完整作者及栏目关键词');
   queue.unshift(...links.map(link=>({...link,depth:item.depth+1,trail,documentUrl:link.type==='script'?base:undefined})));
  }catch(e){if(/多个同名栏目/.test(e.message))throw e;lastError=e;}
 }
 throw Error('固定入口未找到「'+keyword+'」的有效正文（已检查 '+requests+' 个页面）：'+(lastError?.message||'入口未公布可识别的线路或栏目链接'));
}
