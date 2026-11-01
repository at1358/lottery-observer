import {parsePrediction} from './domain.mjs';
import {RULE_FIELDS,baseKind} from './number-attributes.mjs';
import {sourceDefinitions} from './source-rules.mjs';
export function interpretation(raw,kind,name='',rules){
 const definition=sourceDefinitions(raw),body=definition.footerIndex===null?raw:raw.slice(0,definition.footerIndex),value=parsePrediction(body,kind,name),own=definition.entries.length?{...rules,...definition.rules,definitions:definition.entries.map(({index,...entry})=>entry),warnings:definition.warnings}:rules;return {...value,...own?{sourceRules:own}:{}};
}
export function compareRecommendations(before,after,beforeKind,afterKind){
 if(!before?.valid||!after?.valid)return {changed:false,comparable:false};
 const canonical=values=>JSON.stringify([...new Set(values)].sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b))));
 if(beforeKind!==afterKind||canonical(before.values)!==canonical(after.values))return {changed:true,comparable:true};
 const field=RULE_FIELDS[baseKind(beforeKind)],a=before.sourceRules?.[field],b=after.sourceRules?.[field],numbers=Array.from({length:49},(_,i)=>i+1);
 // Newly captured reference metadata is an enrichment, not evidence of edited
 // recommendations. Compare an explicit table only when both versions have it.
 if(a&&b&&numbers.every(n=>a[n]!==undefined&&b[n]!==undefined)){
  const matches=(map,n)=>Array.isArray(map[n])?map[n].some(v=>before.values.includes(v)):before.values.includes(map[n]);
  if(numbers.some(n=>matches(a,n)!==matches(b,n)))return {changed:true,comparable:true,tableChanged:true};
 }
 return {changed:false,comparable:true};
}
export function afterDrawStatus(draw,observedAt,observedWithDraw=false){
 if(!draw)return false;
 if(draw.drawn_at&&Number.isFinite(Date.parse(draw.drawn_at)))return Date.parse(observedAt)>=Date.parse(draw.drawn_at);
 if(observedWithDraw)return true;
 const day=new Date(Date.parse(observedAt)+8*3600000).toISOString().slice(0,10);
 if(draw.draw_date&&day!==draw.draw_date)return day>draw.draw_date;
 if(draw.updated_at&&observedAt>=draw.updated_at)return true;
 return null; // A source date alone cannot establish when a same-day edit happened.
}
