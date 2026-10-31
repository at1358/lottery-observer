import {load} from 'cheerio/slim';
import {normalize,splitPeriods,parsePrediction,inferKind} from './domain.mjs';
import {sourceDefinitions} from './source-rules.mjs';
function moduleContent(text,kind){
 const definition=sourceDefinitions(text),lastIssue=[...text.matchAll(/(?:^|\n)[ \t]*(?:\d{4}[-/])?\d{1,3}\s*期/g)].at(-1)?.index??-1;
 const body=definition.footerIndex!==null&&definition.footerIndex>lastIssue?text.slice(0,definition.footerIndex).trimEnd():text;
 return {text:body,sourceRules:definition.entries.length?{...definition.rules,definitions:definition.entries.map(({index,...entry})=>entry),warnings:definition.warnings}:null};
}
function textOf($,element){const copy=$(element).clone();copy.find('script,style,noscript').remove();copy.find('br,hr').replaceWith('\n');copy.find('p,div,tr,li,pre,h1,h2,h3,h4,section,article').append('\n');return copy.text().replace(/\u00a0/g,' ').replace(/\r\n/g,'\n').trim();}
function selectorFor($,element){
 const node=$(element),id=node.attr('id');if(id&&/^[a-zA-Z_][\w-]*$/.test(id))return '#'+id;
 const title=$(element).children('.list-title,.pb-tit,.title,h1,h2,h3').first().text().trim();
 if(title&&title.length<100)return 'title:'+encodeURIComponent(title);
 const classes=(node.attr('class')||'').split(/\s+/).filter(c=>/^[a-zA-Z_][\w-]*$/.test(c));
 if(classes.length){const s=element.name+'.'+classes.join('.');if($(s).length===1)return s;}
 const path=[];let current=node;
 for(let depth=0;depth<7&&current.length;depth++){
  const item=current[0];if(!item?.name)break;const key=current.attr('id');
  if(key&&/^[a-zA-Z_][\w-]*$/.test(key)){path.unshift('#'+key);break;}
  path.unshift(item.name+':nth-of-type('+(current.prevAll(item.name).length+1)+')');current=current.parent();
 }
 return path.join(' > ');
}
function uniquePeriods(text){const rows=splitPeriods(text),keys=new Set();for(const r of rows){const key=(r.explicitYear||r.yearOffset)+'-'+r.issue;if(keys.has(key))return null;keys.add(key);}return rows.length?rows:null;}
function boundedContent($,element,kind,name){
 const content=moduleContent(textOf($,element),kind),rows=uniquePeriods(content.text);if(!rows)return content;
 const key=r=>(r.explicitYear||'')+'-'+r.issue,expected=new Set(rows.map(key));if(expected.size!==rows.length)return content;
 const blocks=new Map();$(element).find('p,li,tr').each((_,node)=>{const values=uniquePeriods(textOf($,node));if(values?.length!==1)return;const row=values[0],id=key(row);if(!expected.has(id)||!parsePrediction(row.raw,kind,name).valid)return;const raw=row.raw.trim();if(!blocks.has(id)||raw.length<blocks.get(id).length)blocks.set(id,raw);});
 if(blocks.size!==rows.length)return content;
 // Retain the original record's whitespace; remove only text outside its complete DOM row.
 return {...content,text:rows.map(row=>{const body=blocks.get(key(row)),at=row.raw.indexOf(body);return at>=0&&!row.raw.slice(0,at).trim()?row.raw.slice(0,at+body.length).trimEnd():row.raw;}).join('\n')};
}
export function extractModule(html,{selector='auto',sample='',name='',kind='自动识别'}={}){
 const resolvedKind=kind==='自动识别'?inferKind(name+' '+sample):kind;
 if(!/<[a-z][\s\S]*>/i.test(html)){if(!uniquePeriods(html))throw Error('正文中没有匹配到独立期数，请确认资料页已完整加载');return {...moduleContent(html,resolvedKind),selector:'body',kind:resolvedKind};}
 const $=load(html);$('script,style,noscript').remove();
 const titleSelector=selector?.startsWith('title:');
 if(titleSelector){
  let title;try{title=decodeURIComponent(selector.slice(6));}catch{throw Error('栏目标题位置无效，请重新识别');}
  const clean=s=>normalize(s).replace(/\s/g,'');
  const matches=[];$('div,section,article,table').each((_,node)=>{const heading=$(node).children('.list-title,.pb-tit,.title,h1,h2,h3').first().text();if(clean(heading)===clean(title)&&uniquePeriods(textOf($,node)))matches.push(node);});
  if(matches.length!==1)throw Error('栏目标题已变化或存在重名栏目，请重新识别');
  return {...boundedContent($,matches[0],resolvedKind,name),selector,kind:resolvedKind};
 }
 if(selector&&selector!=='auto'&&selector!=='body'){
  const selected=$(selector);if(selected.length!==1){if(sample&&selector.includes('nth-of-type'))return extractModule(html,{selector:'auto',sample,name,kind});throw Error('栏目位置已变化，未能唯一定位。请重新粘贴一期样本并识别。');}
  const text=textOf($,selected[0]);if(!uniquePeriods(text))throw Error('原栏目中未找到独立期数，网页可能已经改版，请重新识别。');
  return {...boundedContent($,selected[0],resolvedKind,name),selector,kind:resolvedKind};
 }
 const example=splitPeriods(sample)[0];
 if(!example){const element=$('body')[0]||$.root()[0],text=textOf($,element);if(uniquePeriods(text))return {...boundedContent($,element,resolvedKind,name),selector:'body',kind:resolvedKind};throw Error('请粘贴该栏目完整的一期样本，用于自动定位。');}
 const parsed=parsePrediction(example.raw,resolvedKind,name);if(!parsed.valid)throw Error('样本未完整识别：'+parsed.warnings.join('；'));
 const normalizedSample=normalize(example.raw);const brackets=[...normalizedSample.matchAll(/[【《〖]([^】》〗]+)[】》〗]/g)].map(m=>m[1]).filter(s=>/码|肖|尾|头|行|段|门/.test(s));
 const candidates=[];
 $('table,section,article,div,ul,pre,body').each((_,element)=>{
  const text=textOf($,element),norm=normalize(text);if(text.length>150000||!norm.includes(example.issue+'期')&&!new RegExp('0?'+Number(example.issue)+'\\s*期').test(norm))return;
  if(!parsed.values.every(v=>typeof v==='number'?new RegExp('(?<!\\d)0?'+v+'(?!\\d)').test(norm):norm.includes(v)))return;
  const periods=uniquePeriods(text);if(!periods)return;
  const sameIssue=periods.filter(r=>r.issue===example.issue&&(!example.explicitYear||r.explicitYear===example.explicitYear));
  if(!sameIssue.some(r=>{const actual=parsePrediction(r.raw,resolvedKind,name);return actual.valid&&actual.values.length===parsed.values.length&&actual.values.every(v=>parsed.values.includes(v));}))return;
  if(brackets.length&&!brackets.some(b=>norm.includes(b)))return;
  candidates.push({element,text,periods});
 });
 if(!candidates.length)throw Error('网页中没有匹配到该样本栏目。请确认网址与样本一致；动态页面请填写实际资料页或正文接口。');
 const multi=candidates.filter(c=>c.periods.length>1);const chosen=(multi.length?multi:candidates).sort((a,b)=>a.text.length-b.text.length)[0];
 const parent=$(chosen.element).parent()[0],parentHeading=parent?$(parent).children('.list-title,.pb-tit,.title,h1,h2,h3').first().text().trim():'';
 const stable=parentHeading&&parentHeading.length<100&&uniquePeriods(textOf($,parent))?.length===chosen.periods.length?parent:chosen.element;
 return {...boundedContent($,stable,resolvedKind,name),selector:selectorFor($,stable),kind:resolvedKind};
}
