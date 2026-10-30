export const ZODIACS = [...'鼠牛虎兔龙蛇马羊猴鸡狗猪'];
export const ELEMENTS = [...'金木水火土'];
export const WAVES = ['红波','蓝波','绿波'];
export const SUM_PARITIES = ['合数单','合数双'];
export const REFERENCE_GROUPS = {zodiacs:ZODIACS,elements:ELEMENTS,waves:WAVES,sumParities:SUM_PARITIES};
export const padNumber = n => String(n).padStart(2,'0');
export function validateReferenceYear(value){const year=Number(value);if(!Number.isInteger(year)||year<2000||year>2100)throw Error('年份应为 2000–2100');return year;}
export function numberList(value){
 if(Array.isArray(value)){if(value.some(n=>typeof n!=='number'||!Number.isInteger(n)||n<1||n>49))throw Error('号码只能填写 01–49');if(new Set(value).size!==value.length)throw Error('同一分组不能重复填写号码');return [...value].sort((a,b)=>a-b);}
 const text=String(value??'').normalize('NFKC').trim();if(!text)return [];
 if(/[^\d\s,，.。、;；|/]/.test(text))throw Error('号码请用空格、逗号或点分隔');
 const tokens=text.split(/[\s,，.。、;；|/]+/).filter(Boolean);if(tokens.some(t=>!/^\d{1,2}$/.test(t)))throw Error('每个号码须为 1–2 位，号码之间请加分隔符');
 return numberList(tokens.map(Number));
}
export function emptyReference(year){return {year:validateReferenceYear(year),title:'年度号码对照',url:'',contentUrl:'',enabled:true,zodiacs:{},elements:{},waves:{},sumParities:{},attributes:[],revision:null};}
export function attributeMembers(value){return [...new Set(String(value).match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/g)||[])];}
export function validateReference(input){
 const result={...emptyReference(input.year),title:String(input.title||'年度号码对照').trim(),url:String(input.url||'').trim(),contentUrl:String(input.contentUrl||'').trim(),enabled:input.enabled!==false,revision:input.revision??null};
 if(result.title.length>80||result.url.length>2048||result.contentUrl.length>2048)throw Error('对照表名称或网址过长');
 for(const [key,labels] of Object.entries(REFERENCE_GROUPS)){
  const seen=new Map();for(const label of labels){const values=numberList(input[key]?.[label]||[]);result[key][label]=values;for(const n of values){if(seen.has(n))throw Error(`${key==='zodiacs'?'生肖':key==='elements'?'五行':key==='waves'?'波色':'合数单双'}中 ${padNumber(n)} 同时出现在「${seen.get(n)}」和「${label}」`);seen.set(n,label);}}
 }
 for(const label of SUM_PARITIES)for(const n of result.sumParities[label]){if((Math.floor(n/10)+n%10)%2!==(label==='合数单'?1:0))throw Error(`${padNumber(n)} 的合数单双应为${label==='合数单'?'合数双':'合数单'}`);}
 if(!Array.isArray(input.attributes||[])||(input.attributes||[]).length>100)throw Error('生肖属性最多添加 100 项');
 const names=new Set();result.attributes=(input.attributes||[]).map(item=>{const name=String(item.name||'').trim(),value=String(item.value||'').normalize('NFKC').replace(/[（(][^）)]*[）)]/g,'').trim();if(!name||name.length>20||names.has(name))throw Error('生肖属性名称不能为空或重复，最多 20 字');names.add(name);if(value.length>200||/[^鼠牛虎兔龙蛇马羊猴鸡狗猪\s、，,;；.。/|\-]/.test(value)||!attributeMembers(value).length)throw Error(`「${name}」请填写生肖，多个分组用顿号分隔`);return {name,value};});
 return result;
}
export function referenceCoverage(profile){return Object.fromEntries(Object.keys(REFERENCE_GROUPS).map(key=>{const values=new Set(Object.values(profile?.[key]||{}).flatMap(v=>{try{return numberList(v);}catch{return [];}}));return [key,{count:values.size,missing:Array.from({length:49},(_,i)=>i+1).filter(n=>!values.has(n))}];}));}
export function referenceNumberRows(profile){
 const find=(key,n)=>Object.entries(profile?.[key]||{}).find(([,values])=>{try{return numberList(values).includes(n);}catch{return false;}})?.[0]||'';
 return Array.from({length:49},(_,i)=>{const number=i+1,zodiac=find('zodiacs',number),head=Math.floor(number/10),tail=number%10,sum=head+tail;return {number,zodiac,element:find('elements',number),wave:find('waves',number),head,tail,sum,sumParity:sum%2?'合数单':'合数双',attributes:(profile?.attributes||[]).filter(a=>attributeMembers(a.value).includes(zodiac)).map(a=>a.name)};});
}
export function rulesWithReference(rules={},profile){
 if(!profile||profile.enabled===false)return rules;
 const rows=referenceNumberRows(profile),result={...rules};
 for(const [field,key] of [['zodiac','zodiacs'],['element','elements'],['wave','waves']])result[key]={...rules[key],...Object.fromEntries(rows.filter(r=>r[field]).map(r=>[r.number,r[field]]))};
 const seasons=Object.fromEntries((profile.attributes||[]).filter(a=>['春','夏','秋','冬'].includes(a.name)).flatMap(a=>attributeMembers(a.value).map(z=>[z,a.name])));result.seasons={...rules.seasons,...seasons};
 result.attributes=Object.fromEntries(ZODIACS.map(z=>[z,(profile.attributes||[]).filter(a=>attributeMembers(a.value).includes(z)).map(a=>a.name)]));return result;
}
