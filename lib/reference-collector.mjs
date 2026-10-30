import {load} from 'cheerio';
import {emptyReference,validateReference,validateReferenceYear,referenceCoverage,ZODIACS,ELEMENTS,WAVES,SUM_PARITIES} from './number-reference.mjs';
const numbers=text=>(String(text).match(/(?<!\d)\d{1,2}(?!\d)/g)||[]).map(Number).filter(n=>n>=1&&n<=49);
function literalArray(html,name){const body=html.match(new RegExp('(?:var|let|const)\\s+'+name+'\\s*=\\s*(\\[[^;]+\\])\\s*;'))?.[1];if(!body)return null;try{return JSON.parse(body);}catch{return null;}}
export function parseReferencePage(html,selectedYear,url=''){
 const year=validateReferenceYear(selectedYear),profile=emptyReference(year),$=load(html),compact=html.replace(/\s/g,'');profile.url=url;profile.contentUrl=url;
 const fixedYear=Number(html.match(/\bLunarCalendarYear\s*=\s*(20\d{2})\b/)?.[1]);if(fixedYear&&fixedYear!==year)throw Error(`参考页标注 ${fixedYear} 年，与所选 ${year} 年不一致`);
 const zodiacArray=literalArray(html,'sxdy'),elementArray=literalArray(html,'wxsx');
 const knownZodiac=Array.isArray(zodiacArray)&&zodiacArray.length===12&&zodiacArray.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(a=>ZODIACS.includes(a)))&&compact.includes('(2016-LunarCalendarYear+num+23)%12');
 const knownElements=Array.isArray(elementArray)&&elementArray.length===30&&elementArray.every(e=>ELEMENTS.includes(e))&&compact.includes('(120+LunarCalendarYear-1983-parseInt(si))%30');
 if(knownZodiac){for(let n=1;n<=49;n++){const z=zodiacArray[((2016-year+(n-1)%12+1+23)%12+12)%12][0];(profile.zodiacs[z]??=[]).push(n);}profile.title=year+zodiacArray[((2016-year+24)%12+12)%12][0]+'年号码对照';}
 if(knownElements)for(let n=1;n<=49;n++){const e=elementArray[((120+year-1983-n)%30+30)%30];(profile.elements[e]??=[]).push(n);}
 $('script,style,noscript').remove();
 const body=$('body').text();const shownYears=[...body.matchAll(/(20\d{2})\s*[鼠牛虎兔龙蛇马羊猴鸡狗猪]?年\s*[（(]?(?:十二生肖对照|五行对照)/g)].map(m=>+m[1]);
 if(shownYears.some(y=>y!==year))throw Error(`参考页标注 ${[...new Set(shownYears)].join('、')} 年，与所选 ${year} 年不一致`);
 $('dl').each((_,e)=>{const label=$(e).find('dt').first().text().trim()[0],values=numbers($(e).find('dd').text());if(ZODIACS.includes(label)&&values.length)profile.zodiacs[label]=values;});
 $('table').each((_,table)=>{
  const title=$(table).find('th,.title').first().text()||$(table).find('tr').first().text();
  const key=/五行对照/.test(title)?'elements':/波色对照/.test(title)?'waves':/合数单双/.test(title)?'sumParities':/十二生肖对照/.test(title)?'zodiacs':'';
  if(key)$(table).find('tr').each((_,row)=>{const cells=$(row).find('td'),label=cells.first().text().trim(),allowed=key==='elements'?ELEMENTS:key==='waves'?WAVES:key==='sumParities'?SUM_PARITIES:ZODIACS;if(allowed.includes(label)){const values=numbers(cells.slice(1).text());if(values.length)profile[key][label]=values;}});
  if(/生肖属性/.test(title))$(table).find('tr').slice(1).each((_,row)=>{const text=$(row).text().replace(/[（(][^）)]*[）)]/g,'');for(const m of text.matchAll(/([\u4e00-\u9fff]{1,8})[：:]\s*([鼠牛虎兔龙蛇马羊猴鸡狗猪、，,\s]+)/g)){const name=m[1],value=m[2].trim();if(value&&!profile.attributes.some(a=>a.name===name))profile.attributes.push({name,value});}});
 });
 const validated=validateReference(profile),coverage=referenceCoverage(validated);return {...validated,coverage,score:Object.values(coverage).reduce((n,v)=>n+v.count,0)+validated.attributes.length};
}
function candidates(text,url){
 const $=load(text),items=[];const add=(path,kind,label='')=>{try{if(!path||/[\\'\"<>]/.test(path))return;const u=new URL(path,url);u.hash='';if(u.origin!==new URL(url).origin||!['http:','https:'].includes(u.protocol)||u.username||u.password)return;const score=/sx\/|sxb|shengxiao|生肖|对照|属性/.test(u.pathname+label)?100:/\/payloads\//.test(u.pathname)?80:/\/am\.(?:html?|js)/.test(u.pathname)?60:kind==='script'?10:0;if(score)items.push({url:u.href,score});}catch{}};
 $('iframe[src],frame[src]').each((_,e)=>add($(e).attr('src'),'frame',$(e).attr('title')||''));
 $('a[href]').each((_,e)=>{if(/生肖.*(?:对照|属性)|五行对照|波色对照/.test($(e).text()))add($(e).attr('href'),'link',$(e).text());});
 $('script[src]').each((_,e)=>{const src=$(e).attr('src');if(!/jquery|lunar|analytics|advert|danchuang/i.test(src))add(src,'script');});
 // Recognize literal iframe markup in document.write without executing website code.
 for(const m of text.matchAll(/src\s*=\s*\\?['"]([^'"\\\s>]+)/g))if(/\.html?(?:[?#]|$)|payloads\//.test(m[1]))add(m[1],'frame');
 return items;
}
export async function collectReference({url,year},download){
 if(!url)throw Error('请填写参考网页地址');const queue=[{url,score:200,depth:0}],seen=new Set(),errors=[];let best=null;
 while(queue.length&&seen.size<12){queue.sort((a,b)=>b.score-a.score);const item=queue.shift();if(seen.has(item.url)||item.depth>5)continue;seen.add(item.url);
  try{const page=await download(item.url);const parsed=parseReferencePage(page.text,year,page.url);if(!best||parsed.score>best.score)best={...parsed,url,contentUrl:page.url};if(Object.values(parsed.coverage).every(v=>v.count===49)&&parsed.attributes.length)break;for(const next of candidates(page.text,page.url))if(!seen.has(next.url))queue.push({...next,depth:item.depth+1});}
  catch(e){errors.push(e.message);if(/与所选.*年不一致/.test(e.message))throw e;}
 }
 if(!best?.score)throw Error('未找到有效的年度号码对照表。请填写对照表的实际页面地址，或手动添加。'+(errors[0]?'（'+errors[0]+'）':''));
 const {score,...profile}=best;return {...profile,collectedAt:new Date().toISOString(),visitedPages:seen.size,warnings:Object.entries(profile.coverage).filter(([,v])=>v.count<49).map(([k,v])=>`${k==='zodiacs'?'生肖':k==='elements'?'五行':k==='waves'?'波色':'合数单双'}识别 ${v.count}/49 个号码，可手动补齐`)};
}
