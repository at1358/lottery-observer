import {ZODIACS,referenceCoverage,referenceNumberRows} from './number-reference.mjs';

const calendar=new Intl.DateTimeFormat('en-u-ca-chinese',{year:'numeric',timeZone:'Asia/Shanghai'});
function lunarYear(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 const at=new Date(date+'T12:00:00+08:00');if(!Number.isFinite(+at)||at.toISOString().slice(0,10)!==date)return null;
 const part=calendar.formatToParts(at).find(p=>p.type==='relatedYear');return part?Number(part.value):null;
}
const array=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
// Historical maps use only earlier calendar years. A target's winning number
// never supplies its own exclusion map, and conflicting/incomplete maps fail closed.
export function periodZodiacResolver(year,profile,draws,expected=[]){
 if(profile?.enabled===false)return ()=>null;
 const groups=new Map(),dates=new Map(expected.filter(p=>p.year===year).map(p=>[String(p.issue).padStart(3,'0'),p.date]));
 for(const draw of draws){
  if(draw.year===year&&draw.draw_date)dates.set(draw.issue,draw.draw_date);
  if(draw.year>=year)continue;const lunar=lunarYear(draw.draw_date);if(!lunar)continue;
  let group=groups.get(lunar);if(!group){group={values:{},conflict:false,sources:new Set()};groups.set(lunar,group);}
  const numbers=array(draw.numbers),zodiacs=array(draw.zodiacs);if(!Array.isArray(numbers)||numbers.length!==7||!Array.isArray(zodiacs)||zodiacs.length!==7)continue;
  for(let i=0;i<7;i++){const n=numbers[i],z=zodiacs[i];if(!Number.isInteger(n)||n<1||n>49||!ZODIACS.includes(z))continue;if(group.values[n]&&group.values[n]!==z)group.conflict=true;group.values[n]=z;}
  if(draw.provenance)group.sources.add(draw.provenance);
 }
 const current=profile?.year===year&&profile.enabled!==false&&referenceCoverage(profile).zodiacs.count===49?Object.fromEntries(referenceNumberRows(profile).map(row=>[row.number,row.zodiac])):null;
 return issue=>{
  const date=dates.get(issue),lunar=lunarYear(date),history=lunar&&lunar<year?groups.get(lunar):null;
  if(history&&!history.conflict&&Object.keys(history.values).length===49)return {zodiacs:history.values,origin:`农历${lunar}年历史对照（来自已采集往年七码生肖）`,lunarYear:lunar,provenance:[...history.sources].sort()};
  return current?{zodiacs:current,origin:`${year}年已配置生肖号码对照`,lunarYear:lunar,provenance:profile.contentUrl||profile.url||'手工对照'}:null;
 };
}
