export const RULE_FIELDS={'生肖':'zodiacs','五行':'elements','波色':'waves','头数':'heads','尾数':'tails','半头':'halfHeads','合数':'sums','合数单双':'sumParities','单双':'parities','段':'segments','门':'doors','季节':'numberSeasons','生肖属性':'numberAttributes'};
export function baseKind(kind){return ({杀号码:'号码',杀码:'号码',杀尾:'尾数',杀头:'头数',杀半头:'半头',杀肖:'生肖',杀行:'五行',杀段:'段',杀门:'门','36码':'号码','24码':'号码','15码':'号码'})[kind]||kind;}
export function numberAttribute(kind,number,rules={},sourceRules={},draw=null){
 const category=baseKind(kind),field=RULE_FIELDS[category],own=field&&sourceRules[field];
 if(own)return {value:own[number],origin:'栏目自带对照'};
 if(field&&sourceRules.definitions?.some(e=>e.field===field))return {value:undefined,origin:'栏目自带对照不完整'};
 const zodiac=sourceRules.zodiacs?.[number]||draw?.zodiac||rules.zodiacs?.[number];
 if(category==='号码')return {value:number,origin:'号码本身'};
 if(category==='尾数')return {value:number%10,origin:'号码尾数'};
 if(category==='头数')return {value:Math.floor(number/10),origin:'号码头数'};
 if(category==='半头')return {value:Math.floor(number/10)+'头'+(number%2?'单':'双'),origin:'头数与单双'};
 if(category==='单双')return {value:number%2?'单':'双',origin:'号码单双'};
 if(category==='合数')return {value:Math.floor(number/10)+number%10,origin:'十位与个位之和'};
 if(category==='合数单双')return {value:(Math.floor(number/10)+number%10)%2?'合数单':'合数双',origin:'合数单双'};
 if(category==='生肖')return {value:draw?.zodiac||rules.zodiacs?.[number],origin:draw?.zodiac?'开奖源生肖':'同年份号码对照'};
 if(category==='五行')return {value:draw?.element||rules.elements?.[number],origin:draw?.element?'开奖源五行':'同年份号码对照'};
 if(category==='季节')return {value:rules.numberSeasons?.[number]||rules.seasons?.[zodiac],origin:'同年份季节对照'};
 if(category==='生肖属性')return {value:rules.attributes?.[zodiac],origin:'同年份生肖属性'};
 return {value:field?rules[field]?.[number]:undefined,origin:'同年份号码对照'};
}
