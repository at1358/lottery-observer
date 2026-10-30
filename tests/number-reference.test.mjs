import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseReferencePage,collectReference} from '../lib/reference-collector.mjs';
import {validateReference,numberList,referenceNumberRows,referenceCoverage,rulesWithReference,emptyReference} from '../lib/number-reference.mjs';
import {inferKind,parsePrediction,evaluate} from '../lib/domain.mjs';
const fixture=readFileSync(new URL('./fixtures/reference-2026.html',import.meta.url),'utf8');
const profile=()=>parseReferencePage(fixture,2026,'https://reference.example/sx/sxb.html');
const prediction=(kind,body)=>({kind,parsed:parsePrediction('303期'+kind+'【'+body+'】',kind)});
test('reference template produces the 2026 mappings actually displayed by the source',()=>{
 const p=profile();assert.ok(Object.values(referenceCoverage(p)).every(v=>v.count===49));assert.deepEqual(p.zodiacs.马,[1,13,25,37,49]);assert.deepEqual(p.zodiacs.虎,[5,17,29,41]);
 assert.deepEqual(p.elements.水,[1,14,15,22,23,30,31,44,45]);assert.deepEqual(p.elements.火,[2,3,10,11,18,19,32,33,40,41,48,49]);
 const row=referenceNumberRows(p)[16];assert.deepEqual([row.zodiac,row.element,row.wave,row.head,row.tail,row.sum,row.sumParity],['虎','木','绿波',1,7,8,'合数双']);
 assert.equal(p.attributes.find(a=>a.name==='三合').value,'鼠龙猴、牛蛇鸡、虎马狗、兔羊猪');assert.ok(row.attributes.includes('野兽'));assert.ok(row.attributes.includes('春'));
});
test('collector follows the observed wrapper, scripts and nested frames without executing them',async()=>{
 const origin='https://reference.example',pages=new Map([
  [origin+'/home','<iframe src="/payloads/"></iframe>'],
  [origin+'/payloads/','<iframe src="https://ads.example/ad"></iframe><script src="/wz/am.js"></script>'],
  [origin+'/wz/am.js',String.raw`document.write('<iframe src=\'/wz/am.html\'></iframe>');globalThis.untrustedExecuted=true;`],
  [origin+'/wz/am.html','<iframe src="sx/sxb.html"></iframe>'],[origin+'/wz/sx/sxb.html',fixture]
 ]),visits=[];
 const r=await collectReference({url:origin+'/home',year:2026},async url=>{visits.push(url);if(!pages.has(url))throw Error('Unexpected '+url);return {url,text:pages.get(url)};});
 assert.equal(r.contentUrl,origin+'/wz/sx/sxb.html');assert.equal(r.visitedPages,5,JSON.stringify(visits));assert.equal(r.warnings.length,0);assert.equal(globalThis.untrustedExecuted,undefined);assert.ok(visits.every(u=>u.startsWith(origin)));
});
test('literal year mismatch and changed dynamic formulas do not silently reuse current-year data',()=>{
 assert.throws(()=>parseReferencePage('<table><tr><th>2025年五行对照</th></tr></table>',2026),/不一致/);
 assert.throws(()=>parseReferencePage('<script>var LunarCalendarYear=2025;</script>'+fixture,2026),/不一致/);
 const next=parseReferencePage(fixture,2027);assert.ok(next.zodiacs.羊.includes(1));assert.ok(!next.zodiacs.马.includes(1));
 const changed=parseReferencePage(fixture.replace('2016 - LunarCalendarYear + num + 23','2017 - LunarCalendarYear + num + 23'),2026);assert.equal(referenceCoverage(changed).zodiacs.count,0);
});
test('range errors, duplicate assignments, contradictory sums and invalid attributes are rejected',()=>{
 assert.deepEqual(numberList('０１，13.25 37、49'),[1,13,25,37,49]);for(const input of ['-1','00 02','50','0102','01 01',[NaN],[1.5]])assert.throws(()=>numberList(input));
 const p=profile();assert.throws(()=>validateReference({...p,zodiacs:{...p.zodiacs,虎:[1,5,17,29,41]}}),/同时/);
 assert.throws(()=>validateReference({...p,sumParities:{合数单:[19]}}),/合数双/);
 assert.throws(()=>validateReference({...p,attributes:[{name:'动物',value:'象'}]}),/填写生肖/);
});
test('partial manual data stays partial and disabled references preserve previous rules',()=>{
 const p=validateReference({...emptyReference(2026),zodiacs:{虎:'05 17'}});assert.equal(referenceCoverage(p).zodiacs.count,2);assert.equal(referenceNumberRows(p)[0].zodiac,'');
 const original={elements:{17:'金'},doors:{17:2}};assert.equal(rulesWithReference(original,{...p,enabled:false}),original);assert.equal(rulesWithReference(original,p).doors[17],2);
});
test('new kinds use digit sums and annual reference rules while draw attributes take priority',()=>{
 const rules=rulesWithReference({},profile());assert.equal(inferKind('白小姐【合数单双】'),'合数单双');assert.equal(inferKind('白小姐【波色】'),'波色');
 assert.equal(evaluate(prediction('生肖','虎'),{number:17},rules).status,'win');assert.equal(evaluate(prediction('生肖','虎'),{number:17,zodiac:'猪'},rules).status,'loss');
 assert.equal(evaluate(prediction('五行','木'),{number:17},rules).status,'win');assert.equal(evaluate(prediction('五行','木'),{number:17,element:'火'},rules).status,'loss');
 assert.equal(evaluate(prediction('波色','绿波'),{number:17},rules).status,'win');assert.equal(evaluate(prediction('波色','绿波'),{number:17}).status,'review');
 assert.equal(evaluate(prediction('合数单双','合数双'),{number:17}).status,'win');assert.equal(evaluate(prediction('合数单双','合数单'),{number:10}).status,'win');assert.equal(evaluate(prediction('合数','13'),{number:49}).status,'win');
 assert.equal(evaluate(prediction('生肖属性','野兽'),{number:17},rules).status,'win');assert.equal(evaluate(prediction('生肖属性','未定义'),{number:17},rules).status,'review');assert.equal(evaluate(prediction('季节','春'),{number:17},rules).status,'win');
});
