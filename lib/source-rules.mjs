// Accept only an explicit, complete partition printed in the source article.
// Do not assume that different websites use the same segment boundaries.
export function sourceSegmentRules(text){
 const matches=[...String(text).matchAll(/(?:^|\n)[ \t]*([1-7])[ \t]*段[ \t]*(?:--+|[:：])[ \t]*([^\r\n]+)/g)];
 if(matches.length!==7||new Set(matches.map(m=>m[1])).size!==7)return null;
 const segments={};for(const match of matches){if(!/^\s*\d{1,2}(?:[.。．,，、 \t]+\d{1,2})*\s*$/.test(match[2]))return null;const values=match[2].match(/\d+/g)||[];if(!values.length)return null;for(const value of values){const n=Number(value);if(n<1||n>49||segments[n]!==undefined)return null;segments[n]=Number(match[1]);}}
 if(Object.keys(segments).length!==49)return null;
 return {rules:{segments},footerIndex:matches[0].index};
}

const chinese={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
function groupType(label){
 const s=label.normalize('NFKC').replace(/\s/g,'').replace(/龍/g,'龙').replace(/雞/g,'鸡').replace(/豬/g,'猪').replace(/[【】()（）]/g,'');
 const numeric=s.replace(/[零一二两三四五六七八九]/g,c=>chinese[c]);let m;
 if((m=numeric.match(/^([1-7])段$/)))return ['segments',Number(m[1])];
 if((m=numeric.match(/^([1-5])门$/)))return ['doors',Number(m[1])];
 if((m=numeric.match(/^([0-4])头([单双])$/)))return ['halfHeads',m[1]+'头'+m[2]];
 if((m=numeric.match(/^([0-4])头$/)))return ['heads',Number(m[1])];
 if((m=numeric.match(/^([0-9])尾$/)))return ['tails',Number(m[1])];
 if((m=numeric.match(/^(?:合数?|合值)(\d{1,2})$/)))return ['sums',Number(m[1])];
 if(/^[金木水火土](?:行)?$/.test(s))return ['elements',s[0]];
 if(/^[鼠牛虎兔龙蛇马羊猴鸡狗猪](?:肖)?$/.test(s))return ['zodiacs',s[0]];
 if(/^[红蓝绿](?:波|波色)?$/.test(s))return ['waves',s[0]+'波'];
 if(/^合数?[单双]$/.test(s))return ['sumParities','合数'+s.at(-1)];
 if(/^[单双](?:数)?$/.test(s))return ['parities',s[0]];
 if(/^[春夏秋冬](?:季)?$/.test(s))return ['numberSeasons',s[0]];
 if(/^[\u4e00-\u9fff]{1,12}$/.test(s)&&!/[期开]|资料|号码|预测|网址/.test(s))return ['numberAttributes',s];
 return null;
}
export function sourceDefinitions(text){
 const original=String(text),entries=[];
 const regex=/(?:^|\n)[ \t]*([^\r\n:：=]{1,16}?)[ \t]*(?:--+|[:：=])[ \t]*(\d{1,2}(?:[.。．,，、 \t]+\d{1,2})*)[ \t]*(?=\r?\n|$)/g;
 for(const match of original.matchAll(regex)){
  const type=groupType(match[1]);if(!type)continue;
  const numbers=match[2].match(/\d+/g).map(Number),invalid=numbers.some(n=>n<1||n>49)||new Set(numbers).size!==numbers.length;
  entries.push({field:type[0],label:type[1],numbers,raw:match[0].trim(),index:match.index,...invalid?{invalid:true}:{}});
 }
 const rules={},warnings=[];
 for(const field of new Set(entries.map(e=>e.field))){
  const map={},labels=new Set();let conflict=false;
  for(const entry of entries.filter(e=>e.field===field)){
   if(entry.invalid){conflict=true;continue;}
   if(labels.has(entry.label))conflict=true;labels.add(entry.label);
   for(const n of entry.numbers){if(field==='numberAttributes')map[n]=[...(map[n]||[]),entry.label];else{if(map[n]!==undefined)conflict=true;map[n]=entry.label;}}
  }
  if(!conflict&&Object.keys(map).length===49)rules[field]=map;
  else warnings.push(`${field} 对照${conflict?'有重叠或重复分组':'未完整覆盖49个号码'}，仅保留原表，不自动补猜`);
 }
 return {rules,entries,warnings,footerIndex:entries.length?Math.min(...entries.map(e=>e.index)):null};
}
