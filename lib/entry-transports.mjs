import {load} from 'cheerio/slim';
import {decodeLiteral} from './content-resolver.mjs';
const quoted=String.raw`("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`;
const identifier=String.raw`([A-Za-z_$][\w$]*)`;
export function publicEntryTransports(html,base){
 const $=load(html),script=$('script').map((_,el)=>$(el).text()).get().join('\n'),links=[];
 const add=(url,label,type,request)=>{try{const target=new URL(url,base);if(!['http:','https:'].includes(target.protocol)||target.username||target.password||target.href.length>4096)return;links.push({url:target.href,label,priority:1,type,referer:base,...request?{request}:{}});}catch{}};
 // Only this published URL construction is decoded; no JavaScript is executed.
 const loader=new RegExp(String.raw`\b${identifier}\.src\s*=\s*atob\(\s*${quoted}\s*\)\.concat\(encodeURIComponent\(btoa\(window\.location\.hostname\)\)\)`,'g');
 for(const match of script.matchAll(loader)){const encoded=decodeLiteral(match[2]);try{add(atob(encoded)+encodeURIComponent(btoa(new URL(base).hostname)),'入口公布的线路脚本','script');}catch{}}
 // Public hostname-only POST router. Domain/path/port ranges are all literal
 // values published by the entry; no cookies, challenge answers or JS are run.
 const endpoints=script.match(/\bvar\s+endpoints\s*=\s*\[([^\]]{1,8000})\]\s*;/),ports=script.match(/\bvar\s+port\s*=\s*(\d{1,5})\s*\+\s*Math\.floor\(Math\.random\(\)\s*\*\s*(\d{1,2})\)/);
 const form=$('form#f'),input=form.find('input#d[name="d"][type="hidden"]');
 if(endpoints&&ports&&form.length===1&&String(form.attr('method')).toUpperCase()==='POST'&&!form.attr('action')&&form.find('input').length===1&&input.length===1&&/endpoint\s*=\s*endpoints\[Math\.floor\(Math\.random\(\)\*endpoints\.length\)\]/.test(script)&&/subdomain\s*=\s*Math\.random\(\)\.toString\(36\)\.slice\(2,10\)/.test(script)&&/form\s*=\s*document\.getElementById\(["']f["']\)/.test(script)&&/input\s*=\s*document\.getElementById\(["']d["']\)/.test(script)&&/form\.action\s*=\s*["']https:\/\/["']\+subdomain\+["']\.["']\+endpoint\.domain\+["']:["']\+port\+endpoint\.path/.test(script)&&/input\.value\s*=\s*btoa\(window\.location\.hostname\)/.test(script)&&/(?:HTMLFormElement\.prototype\.submit\.call\(form\)|form\.submit\(\))/.test(script)){
  const item=new RegExp(String.raw`\{\s*domain\s*:\s*${quoted}\s*,\s*path\s*:\s*${quoted}\s*\}`,'g'),matches=[...endpoints[1].matchAll(item)],first=Number(ports[1]),count=Number(ports[2]);
  if(matches.length>0&&matches.length<=10&&!endpoints[1].replace(item,'').replace(/[,\s]/g,'')&&first>0&&count>0&&count<=16&&first+count-1<=65535){
   for(const match of matches){const domain=decodeLiteral(match[1]),path=decodeLiteral(match[2]);if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain||'')||!/^[\/]_[a-z0-9]{1,40}$/i.test(path||''))continue;const random=crypto.randomUUID().replaceAll('-',''),port=first+parseInt(random.slice(8,10),16)%count;add('https://'+random.slice(0,8)+'.'+domain+':'+port+path,'入口公布的域名表单线路','form',{method:'POST',body:new URLSearchParams({d:btoa(new URL(base).hostname)}).toString()});}
  }
 }
 // Exact auto-submit bridge: forward only literal public transport fields.
 // Never read cookies, environment values, JS expressions, or login fields.
 const action=new RegExp(String.raw`\b${identifier}\.setAttribute\(\s*["']action["']\s*,\s*atob\(\s*${quoted}\s*\)\s*\)`),bridge=script.match(action);
 if(bridge){
  const form=bridge[1],escaped=form.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),method=new RegExp(String.raw`\b${escaped}\.setAttribute\(\s*["']method["']\s*,\s*["']post["']\s*\)`,'i'),submit=new RegExp(String.raw`\b${escaped}\.submit\(\s*\)`);
  const fields=[],field=new RegExp(String.raw`\b${identifier}\.setAttribute\(["']type["'],["']hidden["']\)\s*,\s*\1\.setAttribute\(["']name["'],${quoted}\)\s*,\s*\1\.setAttribute\(["']value["'],${quoted}\)`,'g');
  for(const match of script.matchAll(field))fields.push([decodeLiteral(match[2]),decodeLiteral(match[3])]);
  if(method.test(script)&&submit.test(script)&&fields.length===2&&new Set(fields.map(([name])=>name)).size===2&&fields.every(([name,value])=>['data','checked'].includes(name)&&typeof value==='string')&&fields.find(([name])=>name==='checked')?.[1]==='ok'&&/^U2FsdGVkX1[A-Za-z0-9+/=]{20,8000}$/.test(fields.find(([name])=>name==='data')?.[1]||'')){
   try{add(atob(decodeLiteral(bridge[2])),'入口公布的自动跳转表单','form',{method:'POST',body:new URLSearchParams(fields).toString()});}catch{}
  }
 }
 // Literal-only location IIFE used after the public bridge, including hex escapes.
 const redirect=new RegExp(String.raw`\(function\(a,b,c,d\)\{d\[c\]\[b\]=a\}\)\(\s*${quoted}\s*,\s*${quoted}\s*,\s*${quoted}\s*,\s*window\s*\)`,'g');
 for(const match of script.matchAll(redirect))if(decodeLiteral(match[2])==='href'&&decodeLiteral(match[3])==='location')add(decodeLiteral(match[1]),'入口公布的目标地址','page');
 return links;
}
