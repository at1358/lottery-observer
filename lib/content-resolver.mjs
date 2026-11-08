import {load} from 'cheerio/slim';
import {extractModule} from './extract.mjs';
import {encryptedShell,decryptShellPayload} from './encrypted-shell.mjs';
export function decodeLiteral(literal){
 const quote=literal[0];if(!['"',"'",'`'].includes(quote)||literal.at(-1)!==quote)return null;
 const body=literal.slice(1,-1);if(quote==='`'&&body.includes('${'))return null;
 return body.replace(/\\(u\{[\da-f]+\}|u[\da-f]{4}|x[\da-f]{2}|\r?\n|.)/gi,(_,escape)=>{
  if(escape[0]==='u')return String.fromCodePoint(parseInt(escape.startsWith('u{')?escape.slice(2,-1):escape.slice(1),16));
  if(escape[0]==='x')return String.fromCharCode(parseInt(escape.slice(1),16));
  return ({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','\n':'','\r\n':''})[escape]??escape;
 });
}
export function staticDocumentWrites(script){
 const literal=String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60)`;
 const regex=new RegExp(String.raw`document\s*\.\s*write(ln)?\s*\(\s*(?:(utf8to16)\s*\(\s*strdecode\s*\(\s*(${literal})\s*\)\s*\)|(${literal}))\s*\)`,'g');
 let result='';
 for(const match of String(script).matchAll(regex)){
  let text=decodeLiteral(match[3]||match[4])||'';
  if(match[2]){if(text.length>1600000||!text||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))continue;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text),c=>c.charCodeAt(0)));}catch{continue;}}
  result+=text+(match[1]?'\n':'');if(result.length>2000000)throw Error('来源脚本的公开正文过大');
 }
 return result;
}
// The entry publishes an XOR-encoded HTML document as two literal strings.
// Recognize its exact byte loop; never execute the surrounding script.
function publishedXorDocument(html){
 if(!html.includes('_k.charCodeAt')||!html.includes('document.write(_h)'))return html;
 const $=load(html);for(const el of $('script:not([src])').toArray()){
  const script=$(el).text(),data=script.match(/\bvar\s+_d\s*=\s*("[A-Za-z0-9+/=]+")\s*;/),key=script.match(/\bvar\s+_k\s*=\s*("[\w-]{1,128}")\s*;/);
  if(!data||!key||data[1].length>1600002||!/\bvar\s+_r\s*=\s*atob\(_d\)/.test(script)||!/_b\[_i\]\s*=\s*_r\.charCodeAt\(_i\)\s*\^\s*_k\.charCodeAt\(_i%_k\.length\)/.test(script)||!/document\.write\(_h\)/.test(script))continue;
  try{const encoded=decodeLiteral(data[1]),secret=decodeLiteral(key[1]),bytes=Uint8Array.from(atob(encoded),(c,i)=>c.charCodeAt(0)^secret.charCodeAt(i%secret.length)),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/<html\b/i.test(text))return text;}catch{}
 }return html;
}
// Materialize literal document.write data in place. Remote JavaScript is never run.
export function materializeDocumentWrites(html){return publishedXorDocument(String(html)).replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(whole,attributes,script)=>/\bsrc\s*=/i.test(attributes)?whole:whole+staticDocumentWrites(script));}
// These pages explicitly place their encoded document on a public content CDN.
// Follow only the published document scripts, excluding general third-party assets.
export function publishedDocumentScripts(html,baseUrl){
 const $=load(html);if(!/utf8to16\s*\(\s*strdecode\s*\(/.test(html)&&!$('script[src]').toArray().some(node=>/\/static\/label\/label-com4-[\w.-]+\.js(?:[?#]|$)/i.test($(node).attr('src')||'')))return [];
 const found=[];$('.cgi-body script[src]').each((_,node)=>{try{const url=new URL($(node).attr('src'),baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!/^\/upload\/script\/\d+\/[a-f0-9]+\.js$/i.test(url.pathname))return;found.push({url:url.href,script:true,baseUrl,priority:1});}catch{}});
 return [...new Map(found.map(resource=>[resource.url,resource])).values()];
}
function resources(html,baseUrl){
 const $=load(html),origin=new URL(baseUrl).origin,pageName=new URL(baseUrl).pathname.split('/').at(-1)?.split('.')[0];const found=publishedDocumentScripts(html,baseUrl);
 $('iframe[src],frame[src],script[src]').each((_,node)=>{
  try{const url=new URL($(node).attr('src'),baseUrl);if(url.origin!==origin||!['http:','https:'].includes(url.protocol))return;
   if(found.some(resource=>resource.url===url.href))return;const script=node.name==='script';const sameName=pageName&&url.pathname.split('/').at(-1)?.split('.')[0]===pageName;
   found.push({url:url.href,script,baseUrl,priority:sameName?0:script?2:1});
  }catch{}
 });
 return found.sort((a,b)=>a.priority-b.priority);
}
export async function resolveModule(initial,options,download,{maxRequests=8,maxDepth=3,timeoutMs=30000}={}){
 const deadline=Date.now()+timeoutMs;
 const queue=[{...initial,depth:0,baseUrl:initial.url,script:false}],visited=new Set();let requests=0,lastError;
 while(queue.length){
  if(Date.now()>deadline)throw Error('正文定位超时，配置可以先保存后重试');
  const current=queue.shift();if(visited.has(current.url))continue;visited.add(current.url);
  let data=current;
  if(!('text' in current)){if(requests>=maxRequests)break;requests++;try{data={...current,...await download(current.url)};}catch(e){lastError=e;continue;}}
  let html;
  try{html=data.encrypted?decryptShellPayload(data.text,data.encrypted.key):data.script?staticDocumentWrites(data.text):materializeDocumentWrites(data.text);}catch(e){lastError=e;continue;}
  if(!html)continue;
  if(!data.script){
   try{const result=extractModule(html,options);return {...result,html,url:data.encrypted?.shellUrl||data.url,visited:visited.size};}catch(e){lastError=e;if(data.encrypted&&/\d{1,3}\s*期/.test(html))throw e;}
  }else{
   try{const result=extractModule(html,options);return {...result,html,url:data.baseUrl,visited:visited.size};}catch{}
  }
  if(data.depth>=maxDepth)continue;
  if(!data.script&&!data.encrypted){const encrypted=encryptedShell(html,data.url);if(encrypted){queue.unshift({url:encrypted.dataUrl,encrypted,script:false,baseUrl:encrypted.shellUrl,depth:data.depth+1});continue;}}
  queue.unshift(...resources(html,data.encrypted?.shellUrl||(data.script?data.baseUrl:data.url)).filter(resource=>!visited.has(resource.url)).map(resource=>({...resource,depth:data.depth+1})));
 }
 throw Error(lastError?.message||'没有找到对应栏目，请确认样本与网址对应；配置仍可保存后重新识别');
}
