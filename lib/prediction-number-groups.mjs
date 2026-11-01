// Display only the classification captured with this record. Keep the original
// text intact and never assume another column uses the same segment boundaries.
export function predictionNumberGroups(row){
 const field=({'杀段':'segments','杀行':'elements','五行':'elements'})[row?.kind];
 if(!field||row.synthetic)return null;
 let parsed;try{parsed=typeof row.parsed==='string'?JSON.parse(row.parsed):row.parsed;}catch{return null;}
 if(!parsed?.valid||!Array.isArray(parsed.values)||!parsed.values.length)return null;
 const map=parsed.sourceRules?.[field],numbers=Array.from({length:49},(_,i)=>i+1);
 const valid=value=>field==='segments'?Number.isInteger(value)&&value>=1&&value<=7:['金','木','水','火','土'].includes(value);
 if(!map||numbers.some(n=>!valid(map[n])))return {groups:[],warning:'本栏目暂无完整号码对照，暂无法展开。'};
 const groups=[...new Set(parsed.values)].map(value=>({label:String(value)+(field==='segments'?'段':'行'),numbers:numbers.filter(n=>map[n]===value)}));
 if(groups.some(g=>!g.numbers.length))return {groups:[],warning:'本栏目号码对照中未找到本期分组，暂无法展开。'};
 return {groups,warning:null};
}
