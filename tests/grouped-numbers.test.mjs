import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractModule} from '../lib/extract.mjs';
import {parsePrediction,splitPeriods,evaluate} from '../lib/domain.mjs';
import {sourceDefinitions} from '../lib/source-rules.mjs';
import {resolveModule,staticDocumentWrites} from '../lib/content-resolver.mjs';
import {discoverEntry} from '../lib/entry-navigation.mjs';
import {groupedDisplayText} from '../lib/grouped-numbers.mjs';
const name='诸葛孔明【主攻⑨码】',html=readFileSync(new URL('./fixtures/zhugeliang-nine.html',import.meta.url),'utf8');
test('real two-group recommendation keeps line breaks, all 18 numbers, and excludes the footer',()=>{
 const result=extractModule(html,{name,kind:'号码',sample:name}),rows=splitPeriods(result.text);
 assert.deepEqual(rows.map(r=>r.issue),['309','310']);assert.equal(result.sourceRules,null);
 assert.equal(rows[1].raw,'310期:【主攻⑨码】特开:？00准\n主:04 16 21 27 28 31 33 42 45\n攻:08 09 23 24 34 36 39 40 47');
 for(const row of rows){const parsed=parsePrediction(row.raw,'号码',name);assert.equal(parsed.valid,true);assert.equal(parsed.values.length,18);assert.deepEqual(parsed.numberGroups.map(g=>[g.label,g.numbers.length]),[['主',9],['攻',9]]);assert.equal(sourceDefinitions(row.raw).entries.length,0);}
 assert.equal(evaluate({kind:'号码',parsed:parsePrediction(rows[0].raw,'号码',name)},{number:13}).status,'win');
});
test('each group must be complete; a plain nine-code article still rejects 18 numbers',()=>{
 const raw=splitPeriods(extractModule(html,{name,kind:'号码'}).text)[1].raw;
 for(const candidate of [raw.replace('04 16','04'),raw.replace('04 16','04 04'),raw.replace('攻:08','攻:50'),raw.replace('攻:08','另一组:08')])assert.equal(parsePrediction(candidate,'号码',name).valid,false);
 const shared=raw.replace('攻:08','攻:04'),parsed=parsePrediction(shared,'号码',name);assert.equal(parsed.valid,true);assert.equal(parsed.values.length,17);
 assert.equal(parsePrediction('310期:【主攻⑨码】\n01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18','号码',name).valid,false);
 assert.equal(parsePrediction(raw+'\n01 02 03','号码',name).valid,false);
 const legacy=raw+'\n\n\n\n站点页脚',row={raw:legacy,parsed:parsePrediction(raw,'号码',name)};
 assert.equal(groupedDisplayText(row),raw);assert.equal(row.raw,legacy);assert.equal(groupedDisplayText({...row,changed:2}),legacy);
});
test('same-author menus identify the exact column even when author and title are reversed',async()=>{
 for(const keyword of ['诸葛孔明',name]){
  const calls=[],result=await discoverEntry('https://entry.example/',{name,kind:'号码',keyword,sample:name},async url=>{calls.push(url);return {url,text:url.endsWith('/article')?html:'<a href="/other">310期:【梅兰竹菊】诸葛孔明</a><a href="/article">310期:【主攻⑨码】诸葛孔明</a>'};});
  assert.deepEqual(calls,['https://entry.example/','https://entry.example/article']);assert.equal(result.url,calls[1]);
 }
});
test('visible HTML line breaks survive inline script writes without invented newlines',async()=>{
 const script='document.write("<section><h2>九码</h2><p>310期:【主攻⑨码】特开:？00准<br>主:");document.write("<b>04 16 21 27 28 31 33 42 45</b><br>攻:");document.write("<b>08 09 23 24 34 36 39 40 47</b></p></section>");';
 assert.ok(staticDocumentWrites(script).includes('主:<b>04'));
 const result=await resolveModule({url:'https://article.example/310.html',text:'<script src="/310.js"></script>'},{kind:'号码',name},async url=>({url,text:script}));
 assert.equal(splitPeriods(result.text)[0].raw.split('\n').length,3);
 const pre=extractModule('<section><pre>310期:【号码】\n  01 02 03\n\n  04 05 06</pre></section>',{kind:'号码'});assert.match(pre.text,/\n  01 02 03\n\n  04 05 06/);
});
