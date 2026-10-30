import {load} from 'cheerio/slim';
import {normalize,splitPeriods,parsePrediction,inferKind} from './domain.mjs';
import {sourceSegmentRules} from './source-rules.mjs';
function moduleContent(text,kind){const definition=kind==='杀段'?sourceSegmentRules(text):null;return {text:definition?text.slice(0,definition.footerIndex).trimEnd():text,sourceRules:definition?.rules||null};}
function textOf($,element){const copy=$(element).clone();copy.find('script,style,noscript').remove();copy.find('br,hr').replaceWith('\n');copy.find('p,div,tr,li,pre,h1,h2,h3,h4,section,article').append('\n');return copy.text().replace(/\u00a0/g,' ').replace(/\r\n/g,'\n').trim();}
function selectorFor($,element){
 const node=$(element),id=node.attr('id');if(id&&/^[a-zA-Z_][\w-]*$/.test(id))return '#'+id;
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
export function extractModule(html,{selector='auto',sample='',name='',kind='自动识别'}={}){
 const resolvedKind=kind==='自动识别'?inferKind(name+' '+sample):kind;
 if(!/<[a-z][\s\S]*>/i.test(html)){if(!uniquePeriods(html))throw Error('正文中没有匹配到独立期数，请确认资料页已完整加载');return {...moduleContent(html,resolvedKind),selector:'body',kind:resolvedKind};}
 const $=load(html);$('script,style,noscript').remove();
 if(selector&&selector!=='auto'&&selector!=='body'){
  const selected=$(selector);if(selected.length!==1)throw Error('栏目位置已变化，未能唯一定位。请重新粘贴一期样本并识别。');
  const text=textOf($,selected[0]);if(!uniquePeriods(text))throw Error('原栏目中未找到独立期数，网页可能已经改版，请重新识别。');
  return {...moduleContent(text,resolvedKind),selector,kind:resolvedKind};
 }
 const example=splitPeriods(sample)[0];
 if(!example){const text=textOf($,$('body')[0]||$.root()[0]);if(uniquePeriods(text))return {...moduleContent(text,resolvedKind),selector:'body',kind:resolvedKind};throw Error('请粘贴该栏目完整的一期样本，用于自动定位。');}
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
 return {...moduleContent(chosen.text,resolvedKind),selector:selectorFor($,chosen.element),kind:resolvedKind};
}
