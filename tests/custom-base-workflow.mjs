import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const base=process.env.QA_BASE_URL;if(!/^http:\/\/127\.0\.0\.1:5\d{3}$/.test(base||'')||!process.env.QA_CLOCK_FILE)throw Error('Isolated QA required');let cookie='';
async function api(route,data,status=200){const r=await fetch(base+'/api/'+route,{headers:{cookie,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),v=await r.json();assert.equal(r.status,status,route+':'+JSON.stringify(v));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return v;}
const db=new DatabaseSync(path.join(process.env.QA_DATA_DIR,'observer.sqlite'));
writeFileSync(process.env.QA_CLOCK_FILE,'2086-01-03T10:00:00+08:00');await api('auth/login',{username:'qa-admin',password:'Local-only-admin-Password-9276'});
const year=2086,draw=(issue,number)=>api('draw',{year,issue,number,zodiac:'牛',drawDate:year+'-01-'+String(issue).padStart(2,'0'),drawnAt:year+'-01-'+String(issue).padStart(2,'0')+'T13:38:00Z'});
await draw(1,2);await draw(2,49);
const text=count=>[1,2,3].map(issue=>String(issue).padStart(3,'0')+'期【'+Array.from({length:count},(_,i)=>String(i+1).padStart(2,'0')).join(' ')+'】').join('\n');
const small=(await api('custom-materials/save',{type:'manual-numbers',name:'QA 自建基础15码',year,declaredCount:15,sourceText:text(15)})).plan;
const large=(await api('custom-materials/save',{type:'manual-numbers',name:'QA 自建基础35码',year,declaredCount:35,sourceText:text(35)})).plan;
const kill=(await api('custom-materials/save',{type:'manual-kill',name:'QA 自建排除2号',year,declaredCount:1,layout:'before-issue',sourceText:'02 001期\n02 002期\n02 003期'})).plan;
let combo=(await api('combinations/save',{name:'QA 自建基础与排除',year,baseMode:'custom',baseCustomMaterialId:small.id,steps:[{type:'custom',materialId:kill.id,mode:'exclude'}],targetMode:'fixed',fixedIssue:'003',calculation:{enabled:false,refreshSources:false},push:{enabled:false}})).plan;
await api('combinations/save',{...combo,baseCustomMaterialId:kill.id},400);
await api('combinations/save',{...combo,year:year+1},400);
let result=(await api('combinations/calculate',{id:combo.id,issue:'003'})).result;assert.equal(result.status,'complete');assert.equal(result.baseNumbers.length,15);assert.equal(result.total,14);assert.equal(result.trace[0].role,'base');assert.equal(result.trace[0].customMaterialId,small.id);
let report=(await api('combinations?plan='+combo.id)).report;assert.equal(report.overall.settled,2);assert.equal(report.overall.rate,0);
const simulation=(await api('simulations/save',{name:'QA 自建基础联动账本',year,combinationId:combo.id,initialCapital:'1000',stakePerNumber:'10',odds:'47',selectionMode:'all',schedule:{enabled:false,time:'21:50'}})).plan;
assert.equal((await api('simulations?plan='+simulation.id)).stats.balanceCents,72000);
combo=(await api('combinations/save',{...combo,baseCustomMaterialId:large.id})).plan;
let ledger=await api('simulations?plan='+simulation.id);assert.equal(ledger.stats.balanceCents,32000);assert.ok(ledger.archives.length);
assert.notEqual((await api('combinations/calculate',{id:combo.id})).result.algorithmHash,result.algorithmHash);
let edited=(await api('custom-materials?material='+large.id)).plan;
await api('custom-materials/save',{...edited,sourceText:text(35).split('\n').filter(line=>!line.startsWith('002')).join('\n')});
report=(await api('combinations?plan='+combo.id)).report;assert.equal(report.overall.settled,1);assert.equal(report.blocked,1);assert.equal(report.periods.find(r=>r.issue==='002').status,'blocked');
await api('simulations/recalculate',{id:simulation.id});ledger=await api('simulations?plan='+simulation.id);assert.equal(ledger.stats.balanceCents,66000);assert.equal(ledger.rows.find(r=>r.issue==='002').stakeCents,0);
assert.equal((await api('combinations/preview',{...combo,targetMode:'common'})).result.issue,'003');
edited=(await api('custom-materials?material='+large.id)).plan;await api('custom-materials/save',{...edited,sourceText:text(35)});await draw(2,3);
await api('combinations/recalculate',{id:combo.id});ledger=await api('simulations?plan='+simulation.id);assert.equal(ledger.stats.balanceCents,79000);
// Historic parse-only errors are repaired from the first archive, never replaced
// with newly fetched recommendations or treated as a post-draw site revision.
const input={name:'诸葛孔明【主攻⑨码】',year:2087,kind:'号码',url:'https://qa-zhugeliang.example/',entry_mode:'navigation',entry_keyword:'诸葛孔明',selector:'auto',sample:'诸葛孔明【主攻⑨码】',interval:60,enabled:false,collectNow:true};
const preview=await api('preview',input);assert.equal(preview.total,2);assert.ok(preview.rows.every(r=>r.parsed.valid&&r.raw.split('\n').length===3));
const direct=await api('preview',{...input,url:'https://qa-zhugeliang.example/article',entry_mode:'direct'});assert.deepEqual(direct.rows.map(r=>r.raw),preview.rows.map(r=>r.raw));
const source=await api('source',input),originals=db.prepare('SELECT id,raw,first_seen FROM predictions WHERE source_id=? ORDER BY issue').all(source.id);
db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('sourceReference:'+source.id+':2087',JSON.stringify({rules:{definitions:[{field:'numberAttributes',label:'主',numbers:[1,2]},{field:'numberAttributes',label:'攻',numbers:[3,4]}]}}));
await api('draw',{year:2087,issue:309,number:13,zodiac:'马',drawDate:'2087-11-05',drawnAt:'2087-11-05T13:38:00Z'});
for(const row of originals){const old=JSON.parse(db.prepare('SELECT parsed FROM predictions WHERE id=?').get(row.id).parsed);delete old.numberGroups;old.valid=false;old.warnings=['标注 9 码，识别到 18 个不同号码'];db.prepare('UPDATE predictions SET parsed=?,latest_parsed=? WHERE id=?').run(JSON.stringify(old),JSON.stringify(old),row.id);}
const first=originals[0];db.prepare("INSERT INTO collection_periods(id,source_id,year,issue,deadline_at,status,reason,finalized_at) VALUES(?,?,?,?,?,'failed',?,?)").run(crypto.randomUUID(),source.id,2087,'309','2087-11-05T13:35:00Z','当期资料未通过完整性识别','2087-11-05T13:35:00Z');
await api('recheck',{source:source.id});let rows=(await api('state?source='+source.id)).rows;
assert.equal(rows.find(r=>r.issue==='309').verdict.status,'win');assert.ok(rows.every(r=>r.parsed.valid&&r.parsed.values.length===18));
assert.equal(db.prepare('SELECT value FROM settings WHERE key=?').get('sourceReference:'+source.id+':2087'),undefined);
const auditCount=db.prepare("SELECT COUNT(*) AS n FROM revisions WHERE prediction_id=? AND change_type='audit'").get(first.id).n;
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revisions WHERE prediction_id=? AND change_type='audit' AND raw LIKE '[系统解析修复：主、攻%'").get(first.id).n,1);
assert.deepEqual(db.prepare('SELECT id,raw,first_seen FROM predictions WHERE source_id=? ORDER BY issue').all(source.id),originals);
assert.equal((await api('crawl',{id:source.id})).changed,0);assert.equal((await api('history?id='+first.id)).filter(r=>r.change_type==='prediction').length,0);
await api('recheck',{source:source.id});assert.equal(db.prepare("SELECT COUNT(*) AS n FROM revisions WHERE prediction_id=? AND change_type='audit'").get(first.id).n,auditCount);
// The user's formula18 was saved as a kill with the wrong input format. Changing
// its purpose must keep its ID/raw text, archive the preceding rule and score hits.
const formulaText=[1,2,3].map(issue=>String(issue).padStart(3,'0')+'期: 公式18码【'+Array.from({length:18},(_,i)=>String(i+1).padStart(2,'0')).join(' ')+'】').join('\n');
for(const [issue,number] of [[1,5],[2,49]])await api('draw',{year:2088,issue,number,zodiac:'牛',drawDate:'2088-01-0'+issue,drawnAt:'2088-01-0'+issue+'T13:38:00Z'});
const wrong=(await api('custom-materials/save',{type:'manual-kill',name:'QA 公式18码',year:2088,declaredCount:18,sourceText:formulaText,layout:'before-issue'})).plan;assert.equal((await api('custom-materials?material='+wrong.id)).stats.settled,0);
const fixed=(await api('custom-materials/save',{...wrong,type:'manual-numbers',layout:'issue-brackets'})).plan;assert.equal(fixed.id,wrong.id);assert.equal(fixed.sourceText,formulaText);
const formula=await api('custom-materials?material='+wrong.id);assert.equal(formula.stats.win,1);assert.equal(formula.stats.loss,1);assert.equal(formula.stats.pending,1);assert.equal(formula.stats.review,0);assert.ok(db.prepare('SELECT value FROM settings WHERE key=?').get('customMaterialArchive:'+wrong.id+':'+wrong.revision));
await api('auth/login',{username:'qa-viewer',password:'Reset-local-only-password-9276'});await api('combinations/save',{...combo,name:'不可修改'},403);
writeFileSync(process.env.QA_CLOCK_FILE,'');db.close();
console.log('PASS: self-created recommendation base, same-period exclusions, full history and missing-data denominator, base rule invalidation and manual ledger refresh, common periods, draw correction, same-author navigation, direct source line breaks, audited first-archive repair, immutable raw and no false site revisions.');
