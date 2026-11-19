import {load} from 'cheerio/slim';
import {decodeLiteral} from './content-resolver.mjs';
const quoted=String.raw`("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`;
const identifier=String.raw`([A-Za-z_$][\w$]*)`;
export function publicEntryTransports(html,base,at=Date.now()){
 const $=load(html),script=$('script').map((_,el)=>$(el).text()).get().join('\n'),links=[];
 const add=(url,label,type,request)=>{try{const target=new URL(url,base);if(!['http:','https:'].includes(target.protocol)||target.username||target.password||target.href.length>4096)return;links.push({url:target.href,label,priority:1,type,referer:base,...request?{request}:{}});}catch{}};
 // Published date-based entrance. Read its literal template and use Beijing
 // time; the unrelated random-subdomain helper is deliberately not executed.
 const dated=script.match(/const\s+domain\s*=\s*['"]([a-z0-9.-]+)['"]\s*;\s*const\s+url\s*=\s*`https:\/\/\$\{getDatePrefix\(\)\}\.\$\{domain\}:(\d{1,5})(\/index\.html#\/#)\$\{index\}`/i),index=script.match(/window\.location\.href\s*=\s*openUrl\((\d{1,2})\)/);
 if(dated&&index&&/function\s+getDatePrefix\(\)\s*\{\s*var now\s*=\s*new Date\(\);\s*var month\s*=\s*now\.getMonth\(\)\s*\+\s*1;\s*var day\s*=\s*now\.getDate\(\);\s*return month\s*\+\s*['"]-['"]\s*\+\s*day;/.test(script)&&/return url\b/.test(script)&&Number(dated[2])>0&&Number(dated[2])<=65535){const date=new Date(at+8*3600000);add(`https://${date.getUTCMonth()+1}-${date.getUTCDate()}.${dated[1]}:${dated[2]}${dated[3]}${index[1]}`,'入口公布的当日线路','page');}
 const dateLinks=/function\s+getDatePrefix\(\)/.test(script)&&/now\.getMonth\(\)\s*\+\s*1/.test(script)&&/now\.getDate\(\)/.test(script)&&/return month\s*\+\s*['"]-['"]\s*\+\s*day;/.test(script);
 if(dateLinks)for(const match of script.matchAll(/var\s+(_\d*)\s*=\s*`https:\/\/\$\{getDatePrefix\(\)\}\.([a-z0-9.-]+):(\d{1,5})(\/#\d{1,4})`\s*;/gi)){
  const variable=match[1],escaped=variable.replace(/[$]/g,'\\$&'),fn=new RegExp(String.raw`function\s+(openUrl\d+)\(\)\s*\{\s*window\.open\(${escaped}\);?\s*\}`),handler=script.match(fn),date=new Date(at+8*3600000);
  // The optional four-digit decoder references absent data on this page. Only
  // the literal fallback is used when no such encoded input is published.
  if(handler&&$('[onclick]').toArray().some(el=>$(el).attr('onclick')?.trim()===handler[1]+'()')&&!/\b(?:var|let|const)\s+uu\d*\s*=/.test(script)&&Number(match[3])>0&&Number(match[3])<=65535)add(`https://${date.getUTCMonth()+1}-${date.getUTCDate()}.${match[2]}:${match[3]}${match[4]}`,'入口公布的日期线路','page');
 }
 // A public origin/path bridge. Forward only the current public URL, never
 // cookies or other browser state, and encode both query parameters intact.
 const originBridge=script.match(/var\s+strU\s*=\s*["'](https?:\/\/[^"']+\?u=)["']\s*\+\s*window\.location\s*\+\s*["']&p=["']\s*\+\s*window\.location\.pathname\s*\+\s*window\.location\.search\s*;/);
 if(originBridge&&$('a#hao123').length===1&&/hao123\.href\s*=\s*strU\s*;/.test(script)&&/getElementById\(["']hao123["']\)\.dispatchEvent\(e\)/.test(script)){const source=new URL(base),target=new URL(originBridge[1]);target.search=new URLSearchParams({u:source.href,p:source.pathname+source.search}).toString();add(target.href,'入口公布的来源跳转','page');}
 // Literal binary URL formats used by a cosmetic countdown. Decode bytes only;
 // do not run its timers, analytics, reachability probes or event handlers.
 const binaryUrl=value=>{if(!/^[01]{8,32768}$/.test(value)||value.length%8)return;const url=value.match(/.{8}/g).map(byte=>String.fromCharCode(parseInt(byte,2))).join('');if(/^https?:\/\/[^\s]+$/i.test(url))add(url,'入口公布的二进制线路','page');};
 const binary=script.match(/const\s+level3urlBinary\s*=\s*["']([01]+)["']/);
 if(binary&&/level3urlBinary\.substring\(i,\s*i\s*\+\s*8\)/.test(script)&&/level3url\s*\+=\s*String\.fromCharCode\(parseInt\(byte,\s*2\)\)/.test(script)&&/window\.location\.href\s*=\s*urls\[0\]\.url/.test(script))binaryUrl(binary[1]);
 const binaries=script.match(/var\s+urlArray\s*=\s*(\[[\s'"01,]+\])\s*;/);
 if(binaries&&/var selectedUrl\s*=\s*urlArray\[randomIndex\]/.test(script)&&/selectedUrl\.substr\(i,\s*8\)/.test(script)&&/parseInt\(str,\s*2\)/.test(script)&&/StrHex\s*=\s*StrHex\s*\+\s*String\.fromCharCode\(n\)/.test(script)&&/window\.location\.href\s*=\s*_\s*;/.test(script)){const values=[...binaries[1].matchAll(/["']([01]+)["']/g)];if(values.length<=8)for(const value of values)binaryUrl(value[1]);}
 // Only this published URL construction is decoded; no JavaScript is executed.
 const loader=new RegExp(String.raw`\b${identifier}\.src\s*=\s*atob\(\s*${quoted}\s*\)\.concat\(encodeURIComponent\(btoa\(window\.location\.hostname\)\)\)`,'g');
 for(const match of script.matchAll(loader)){const encoded=decodeLiteral(match[2]);try{add(atob(encoded)+encodeURIComponent(btoa(new URL(base).hostname)),'入口公布的线路脚本','script');}catch{}}
 // The line checker publishes literal destination URLs. Read that bounded list;
 // never run its reachability checks, timers, click handlers or remote scripts.
 const lines=script.match(/\b(?:let|var|const)\s+jump_domains\s*=\s*(\[[^\]]{1,12000}\])\s*;/);
 if(lines&&$('#js-alert-btn').length===1&&/\bbtn\s*=\s*document\.getElementById\(["']js-alert-btn["']\)/.test(script)&&/\bbtn\.href\s*=\s*target\s*;/.test(script)&&/window\.location\.replace\(target\)/.test(script)&&/\biosSafeRedirect\(info\.url\)/.test(script)){
  try{const urls=JSON.parse(lines[1]);if(Array.isArray(urls)&&urls.length>0&&urls.length<=8&&urls.every(value=>typeof value==='string'&&value.length<=4096&&/^https?:\/\//i.test(value))){for(const url of urls)add(url.replace(/###@$/,''),'入口公布的检测线路','page');}}catch{}
 }
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
