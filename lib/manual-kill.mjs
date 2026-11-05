const zodiac='鼠牛虎兔龙蛇马羊猴鸡狗猪';
const issueText=v=>String(Number(v)).padStart(3,'0');
const normalized=v=>String(v||'').normalize('NFKC').replace(/\r\n/g,'\n');
export function parseManualKill(text,{layout='before-issue',declaredCount=6,issueCorrections=[]}={}){
 if(!['before-issue','draw-seven','issue-brackets'].includes(layout))throw Error('请选择号码在期数前、期数后括号号码，或历史开奖七码格式');
 if(!Number.isInteger(declaredCount)||declaredCount<1||declaredCount>49)throw Error('标称杀码数量应为1–49');
 if(typeof text!=='string'||!text.trim()||text.length>180000)throw Error('请粘贴18万字以内的按期杀码资料');
 if(!Array.isArray(issueCorrections)||issueCorrections.length>100)throw Error('期号修正配置无效');
 const corrections=new Map();for(const c of issueCorrections){const key=String(c.raw||'').trim(),issue=Number(c.issue);if(!key||key.length>2000||!Number.isInteger(issue)||issue<1||issue>366)throw Error('期号修正须包含完整原文和001–366目标期数');if(corrections.has(key))throw Error('同一行不能重复配置期号修正');corrections.set(key,{issue:issueText(issue),note:String(c.note||'人工确认期号').slice(0,200)});}
 const grouped=new Map(),unparsed=[],headers=[];let parsedLines=0,corrected=0;
 const lines=text.replace(/\r\n/g,'\n').split('\n');
 for(let i=0;i<lines.length;i++){
  const raw=lines[i].trim();if(!raw)continue;const line=normalized(raw);
  if(!/\d{1,3}\s*期/.test(line)){if(/\d\s*\+/.test(line))unparsed.push({line:i+1,raw,reason:'号码行未找到期数'});else headers.push(raw);continue;}
  let match,issue,numberText,suffix='',referenceZodiac=null,referenceElement=null,claimIssue=null;
  if(layout==='before-issue'){
   match=line.match(/^(.*?)\s*(\d{1,3})\s*期(.*)$/);if(match){numberText=match[1];issue=match[2];suffix=match[3];}
  }else if(layout==='issue-brackets'){
   match=line.match(/^\s*(\d{1,3})\s*期[^【\[\n]*[【\[]([\d\s.,、]+)[】\]](.*)$/);if(match){issue=match[1];numberText=match[2];suffix=match[3];}
  }else{
   match=line.match(new RegExp('^\\s*(\\d{1,3})\\s*期\\s*([\\d\\s+.,、]+?)\\s*(['+zodiac+'])(?:\\s*[/／]\\s*([金木水火土]))?(.*)$'));
   if(match){issue=match[1];numberText=match[2];referenceZodiac=match[3];referenceElement=match[4]||null;const tail=match[5],target=tail.match(/(\d{1,3})\s*期(.*)$/);if(target){claimIssue=issueText(target[1]);suffix=target[2];}else suffix='';}
  }
  if(!match||!/^\d{1,3}$/.test(issue)||+issue<1||+issue>366){unparsed.push({line:i+1,raw,reason:'未能识别期数和号码，请检查所选格式'});continue;}
  const originalIssue=issueText(issue),correction=corrections.get(raw);issue=correction?.issue||originalIssue;if(correction)corrected++;
  const tokens=String(numberText).trim().split(/[\s+.,、]+/).filter(Boolean),warnings=[];
  if(tokens.length<1||tokens.length>declaredCount||tokens.some(n=>!/^\d{1,2}$/.test(n)||+n<1||+n>49))warnings.push('号码应为01–49，数量不超过标称'+declaredCount+'码');
  if(claimIssue&&claimIssue!==originalIssue)warnings.push('参考期与末尾目标期不一致，需确认期数');
  const rawNumbers=tokens.filter(n=>/^\d{1,2}$/.test(n)&&+n>=1&&+n<=49).map(Number),values=[...new Set(rawNumbers)],claimed=suffix.match(new RegExp('(['+zodiac+'])\\s*(\\d{1,2})'));
  if(layout==='issue-brackets'&&values.length!==declaredCount)warnings.push('推荐号码应为完整'+declaredCount+'个不同号码，缺失或重复时等待确认');
  const candidate={issue,raw,rawNumbers,values,line:i+1,originalIssue,correction:correction?{...correction,from:originalIssue}:null,referenceZodiac,referenceElement,claimedNumber:claimed&&+claimed[2]>=1&&+claimed[2]<=49?+claimed[2]:null,claimedZodiac:claimed?.[1]||null,claimedError:/错/.test(suffix),warnings,valid:!warnings.length};
  if(!grouped.has(issue))grouped.set(issue,[]);grouped.get(issue).push(candidate);parsedLines++;
 }
 if(!parsedLines)throw Error('未识别到按期杀码资料，请检查粘贴内容与格式');
 const records=[...grouped].map(([issue,candidates])=>{
  const row=candidates[0],signatures=new Set(candidates.map(r=>JSON.stringify([...r.values].sort((a,b)=>a-b)))),conflict=signatures.size>1;
  return {...row,issue,rawLines:candidates.map(r=>({raw:r.raw,line:r.line,originalIssue:r.originalIssue,correction:r.correction})),valid:candidates.every(r=>r.valid)&&!conflict,warnings:[...new Set([...candidates.flatMap(r=>r.warnings),...(conflict?['同一期存在不同杀码，保留原文并等待确认']:[])])],conflict};
 }).sort((a,b)=>+a.issue-+b.issue);
 const present=new Set(records.map(r=>r.issue)),last=Math.max(...records.map(r=>+r.issue));
 return {records,unparsed,headers,summary:{lines:parsedLines,periods:records.length,valid:records.filter(r=>r.valid).length,conflicts:records.filter(r=>r.conflict).length,short:records.filter(r=>r.values.length<declaredCount).length,corrected,unparsed:unparsed.length,missing:Array.from({length:last},(_,i)=>issueText(i+1)).filter(i=>!present.has(i))}};
}
export function buildManualKill(plan,draws,previous=null,at=new Date().toISOString()){
 const index=new Map(draws.filter(d=>d.year===plan.year).map(d=>[issueText(d.issue),d])),prior=new Map((previous?.ruleKey===plan.ruleKey?previous.rows:[]).map(r=>[r.issue,r]));
 return plan.records.map(record=>{
  const actual=index.get(record.issue),old=prior.get(record.issue),signature=JSON.stringify([record.values,record.valid,record.rawLines]),unchanged=old?.basisKey===signature;
  const generatedAt=unchanged?old.generatedAt:at,wasBacktest=unchanged?old.wasBacktest:!!actual;
  const recommended=plan.type==='manual-numbers',hit=record.values.includes(actual?.number),status=!record.valid?'review':!actual?'pending':hit==recommended?'win':'loss';
  const reason=!record.valid?record.warnings.join('；'):!actual?'等待该期实际开奖':recommended?(hit?'实际特码在推荐号码内':'实际特码不在推荐号码内'):status==='loss'?'实际特码在被杀号码内':'实际特码不在被杀号码内';
  const actualTime=actual?.drawn_at?Date.parse(actual.drawn_at):NaN,mode=wasBacktest?'history':!actual?'forecast':Number.isFinite(actualTime)&&Date.parse(generatedAt)<actualTime?'forecast':Number.isFinite(actualTime)?'history':'unconfirmed';
  return {year:plan.year,issue:record.issue,manual:true,killZodiac:null,killNumbers:record.values,raw:record.raw,rawLines:record.rawLines,rawNumbers:record.rawNumbers,declaredCount:plan.declaredCount,valid:record.valid,warnings:record.warnings,correction:record.correction,claimedNumber:record.claimedNumber,claimedZodiac:record.claimedZodiac,claimedError:record.claimedError,claimMismatch:!!actual&&(record.claimedNumber!==null&&record.claimedNumber!==actual.number||!!record.claimedZodiac&&!!actual.zodiac&&record.claimedZodiac!==actual.zodiac),actualNumber:actual?.number||null,actualZodiac:actual?.zodiac||null,status,reason,mode,generatedAt,wasBacktest,basisKey:signature,firstSeen:old?.firstSeen||at,updatedAt:unchanged&&old.actualNumber===(actual?.number||null)&&old.actualZodiac===(actual?.zodiac||null)?old.updatedAt:at};
 }).sort((a,b)=>+b.issue-+a.issue);
}
