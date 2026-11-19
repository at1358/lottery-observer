import {normalize,statistics} from './domain.mjs';
import {currentCombinationPeriod} from './combination-periods.mjs';
import {beijingDate} from './wecom-push.mjs';
import {rankingSelection,rankingRowKey} from './ranking-selection.mjs';

const issueText=n=>String(Number(n)).padStart(3,'0');
const validIssue=n=>/^\d{1,3}$/.test(String(n))&&+n>=1&&+n<=366;
const parsed=p=>typeof p.parsed==='string'?JSON.parse(p.parsed):p.parsed;
function missingThirtySix(content,row){
 const values=content?.values;
 if(!content?.valid||row.verdict?.status==='collection_failed'||!Array.isArray(values)||values.length!==36||new Set(values).size!==36||!values.every(n=>Number.isInteger(n)&&n>=1&&n<=49))return null;
 const included=new Set(values);return Array.from({length:49},(_,i)=>i+1).filter(n=>!included.has(n));
}
function numberCount(source){
 if(!['号码','自动识别','12码','15码','24码','36码'].includes(source.kind))return null;
 const kind=source.kind.match(/^(\d+)码$/);if(kind)return +kind[1];
 const label=normalize(source.name).replace(/(\d{1,2})[.)]\s*(?=码)/g,'$1');
 const value=label.match(/(?:^|[^\d一二三四五六七八九十])([一二三四五六七八九十]{1,3}|\d{1,2})\s*码/)?.[1];
 return ({十二:12,十五:15,三十六:36})[value]||Number(value)||null;
}
function summaryStats(rows,through){
 const stats=statistics(rows),byIssue=new Map(rows.map(r=>[+r.issue,r]));let currentStreak=0;
 const lastWin=rows.reduce((latest,row)=>row.verdict?.status==='win'&&(!latest||+row.issue>+latest.issue)?row:latest,null);
 const latestWin=lastWin?{year:+lastWin.year,issue:issueText(lastWin.issue)}:null;
 // A missing/unverified actual period interrupts the streak. Future forecasts
 // do not interrupt it, and cannot extend it before an actual draw exists.
 for(let issue=through;issue>=1&&byIssue.get(issue)?.verdict?.status==='win';issue--)currentStreak++;
 return {...stats,latestWin,currentStreak,streakThrough:through?issueText(through):null};
}
/** @param {{sources?: any[], predictions?: any[], materials?: any[], draws?: any[], expected?: object, year?: number|string, at?: number, selection?: object}} input */
export function buildRankingSummary({sources=[],predictions=[],materials=[],draws=[],expected={},year,at=Date.now(),selection:preferences={}}){
 const selection=rankingSelection(preferences);
 const currentYear=+beijingDate(at).slice(0,4),selected=year===undefined||year===''?currentYear:Number(year);
 if(!Number.isInteger(selected)||selected<2000||selected>2100)throw Error('排行年份应为2000–2100');
 const years=[...new Set([currentYear,...sources.map(s=>+s.year),...materials.map(m=>+m.plan.year),...draws.map(d=>+d.year)])].sort((a,b)=>b-a);
 if(!years.includes(selected))years.push(selected);years.sort((a,b)=>b-a);
 const actual=draws.filter(d=>+d.year===selected&&validIssue(d.issue)&&+d.number>=1&&+d.number<=49),known=currentCombinationPeriod(selected,draws,expected,at);
 const fallback=Math.max(0,...actual.map(d=>+d.issue),...(!actual.length?predictions.filter(p=>+p.year===selected&&validIssue(p.issue)).map(p=>+p.issue):[]));
 const period={...known,issue:known.issue||(fallback?issueText(fallback):null),basis:known.issue?'开奖管理确认当期':actual.length?'最近已存开奖期':'最近已采集期'};
 const cutoff=period.issue?+period.issue:0,through=Math.max(0,...actual.filter(d=>+d.issue<=cutoff).map(d=>+d.issue));
 const inScope=row=>+row.year===selected&&validIssue(row.issue)&&+row.issue<=cutoff;
 const groupRows={zodiacs:[],numbers:[],thirtySix:[]};
 for(const source of sources.filter(s=>!s.deleted_batch&&+s.year===selected)){
  const count=numberCount(source),group=[12,15].includes(count)?'numbers':count===36?'thirtySix':null;if(!group)continue;
  const rows=predictions.filter(p=>p.source_id===source.id&&!p.deleted_batch&&inScope(p)),latest=rows.find(p=>+p.issue===cutoff),content=latest?parsed(latest):null;
  groupRows[group].push({id:source.id,name:source.name,origin:'collected',count,href:'/materials/'+encodeURIComponent(source.id),stats:summaryStats(rows,through),latest:latest?{issue:issueText(latest.issue),values:content?.values||[],valid:!!content?.valid&&latest.verdict?.status!=='collection_failed',status:latest.verdict?.status,reason:latest.verdict?.reason,...(group==='thirtySix'?{missingNumbers:missingThirtySix(content,latest)}:{})}:null});
 }
 for(const {plan,rows:stored=[]} of materials.filter(m=>!m.plan.deletedAt&&+m.plan.year===selected)){
  const zodiac=!plan.type||plan.type==='lag-zodiac',recommended=plan.type==='manual-numbers'&&[12,15].includes(+plan.declaredCount);if(!zodiac&&!recommended)continue;
  const rows=stored.filter(inScope).map(r=>({...r,verdict:{status:r.status}})),latest=rows.find(r=>+r.issue===cutoff);
  groupRows[zodiac?'zodiacs':'numbers'].push({id:plan.id,name:plan.name,origin:'custom',count:zodiac?null:+plan.declaredCount,href:'/self-materials/'+encodeURIComponent(plan.id),stats:summaryStats(rows,through),latest:latest?{issue:issueText(latest.issue),values:zodiac?(latest.killZodiac?[latest.killZodiac]:[]):latest.killNumbers||[],numbers:latest.killNumbers||[],valid:zodiac?!!latest.killZodiac:!!latest.valid,status:latest.status,reason:latest.reason}:null});
 }
 const groups=Object.entries(groupRows).map(([id,all])=>{const excluded=new Set(selection.excluded[id]),rows=all.filter(row=>!excluded.has(rankingRowKey(row)));return {id,rows:rows.sort((a,b)=>(id==='zodiacs'?b.stats.currentStreak-a.stats.currentStreak:0)||(b.stats.rate??-1)-(a.stats.rate??-1)||a.name.localeCompare(b.name,'zh-CN')),ready:rows.filter(r=>r.latest?.valid).length,available:all.map(({id,name,origin,count})=>({id,name,origin,count,included:!excluded.has(rankingRowKey({id,origin}))}))};});
 return {year:selected,years,period,latestDrawIssue:through?issueText(through):null,groups,selection:{revision:selection.revision}};
}
