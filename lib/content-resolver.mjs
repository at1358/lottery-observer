import {load} from 'cheerio/slim';
import {extractModule} from './extract.mjs';
import {encryptedShell,decryptShellPayload} from './encrypted-shell.mjs';
function decodeLiteral(literal){
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
 const regex=new RegExp(String.raw`document\s*\.\s*write(?:ln)?\s*\(\s*(${literal})\s*\)`,'g');
 return [...String(script).matchAll(regex)].map(m=>decodeLiteral(m[1])||'').join('\n');
}
function resources(html,baseUrl){
 const $=load(html),origin=new URL(baseUrl).origin,pageName=new URL(baseUrl).pathname.split('/').at(-1)?.split('.')[0];const found=[];
 $('iframe[src],frame[src],script[src]').each((_,node)=>{
  try{const url=new URL($(node).attr('src'),baseUrl);if(url.origin!==origin||!['http:','https:'].includes(url.protocol))return;
   const script=node.name==='script';const sameName=pageName&&url.pathname.split('/').at(-1)?.split('.')[0]===pageName;
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
  try{html=data.encrypted?decryptShellPayload(data.text,data.encrypted.key):data.script?staticDocumentWrites(data.text):data.text;}catch(e){lastError=e;continue;}
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
