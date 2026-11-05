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
