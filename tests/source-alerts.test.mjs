import test from 'node:test';import assert from 'node:assert/strict';
import {validateSourceAlert,alertTerms,evaluateSourceAlert,sourceAlertMessage} from '../lib/source-alerts.mjs';
const at=Date.parse('2026-11-08T15:00:00+08:00'),source={id:'s',name:'全年无错【绝杀一行】',kind:'杀行',year:2026},period={year:2026,issue:'312',date:'2026-11-08'},p=(issue,values,extra={})=>({source_id:'s',year:2026,issue,kind:'杀行',raw:issue+'期:绝杀一行【'+values.join('')+'行】开？00准',parsed:{valid:true,values,warnings:[]},...extra}),draw={year:2026,issue:'311',number:17,element:'金',draw_date:'2026-11-07'},context={sources:[source],predictions:[p('311',['水']),p('312',['水'])],draws:[draw],expected:{'2026-312':period},failures:[],rules:{}},rule={...validateSourceAlert({name:'水行提醒',sourceId:'s',trigger:'content',values:'水行',message:'出现水行注意',enabled:true},source),id:'r'};
test('parsed value conditions match the prediction, not reference footers or drawing annotations',()=>{
 assert.equal(evaluateSourceAlert(rule,context,at).eligible,true);const other={...context,predictions:[p('312',['金'],{raw:'312期杀一行【金行】\n附表：水行：01 02 03'})]};assert.equal(evaluateSourceAlert(rule,other,at).eligible,false);assert.equal(evaluateSourceAlert({...rule,matchMode:'text'},other,at).eligible,true);
 assert.deepEqual(alertTerms('08,18','15码'),['8','18']);assert.deepEqual(alertTerms('三段','杀段'),['3']);assert.deepEqual(alertTerms('虎肖','杀肖'),['虎']);assert.throws(()=>alertTerms('12尾','杀尾'));assert.throws(()=>alertTerms('水行','15码'));
 const all={...rule,values:'水行、金行',matchLogic:'all'};assert.equal(evaluateSourceAlert(all,context,at).eligible,false);assert.equal(evaluateSourceAlert({...all,matchLogic:'any'},context,at).eligible,true);
});
test('only trusted current undrawn periods with complete, non-failed records are eligible',()=>{
 for(const change of [{expected:{}},{draws:[draw,{year:2026,issue:'312',number:2}]},{predictions:[p('311',['水'])]},{predictions:[p('312',['水'],{parsed:{valid:false,values:['水'],warnings:['不完整']}})]},{failures:[{source_id:'s',year:2026,issue:'312',status:'failed'}]},{sources:[{...source,deleted_batch:'deleted'}]}])assert.equal(evaluateSourceAlert(rule,{...context,...change},at).eligible,false);
 assert.equal(evaluateSourceAlert(rule,context,Date.parse('2026-11-08T21:35:00+08:00')).eligible,false);assert.equal(evaluateSourceAlert(rule,{...context,expected:{future:{...period,date:'2026-11-09'}}},at).eligible,false);
});
test('previous-win reminders use actual independent evaluation and the immediate prior period',()=>{
 const r={...rule,trigger:'previous_win',timing:'collected',message:'上期正确，这期注意'};const checked=evaluateSourceAlert(r,context,at);assert.equal(checked.eligible,true);assert.match(checked.content,/311.*正确/);assert.match(checked.content,/312/);
 assert.equal(evaluateSourceAlert(r,{...context,draws:[{...draw,element:'水'}]},at).eligible,false);assert.equal(evaluateSourceAlert(r,{...context,predictions:[p('310',['水']),p('312',['水'])]},at).eligible,false);assert.equal(evaluateSourceAlert(r,{...context,failures:[{source_id:'s',year:2026,issue:'311',status:'failed'}]},at).eligible,false);
 assert.equal(evaluateSourceAlert(r,{...context,draws:[{...draw,draw_date:'2026-01-01'}]},at).eligible,false);assert.equal(evaluateSourceAlert(r,{...context,predictions:[p('311',['水'])]},at).eligible,false);
 const immediate=evaluateSourceAlert({...r,timing:'after_draw'},{...context,predictions:[p('311',['水'])]},at);assert.equal(immediate.eligible,true);assert.match(immediate.content,/尚未采集/);
});
test('post-draw reminders can target the announced next day; cross-year uses the actual year end',()=>{
 const r={...rule,trigger:'previous_win',timing:'after_draw'},late=Date.parse('2026-11-08T21:45:00+08:00'),ctx={...context,predictions:[p('312',['水'])],draws:[{...draw,issue:'312',draw_date:'2026-11-08'}],expected:{next:{year:2026,issue:'313',date:'2026-11-09'}}};assert.equal(evaluateSourceAlert(r,ctx,late).eligible,true);
 const next=Date.parse('2027-01-01T10:00:00+08:00'),yearEnd={...context,sources:[{...source,year:2027}],predictions:[p('365',['水'])],draws:[{...draw,issue:'365',draw_date:'2026-12-31'}],expected:{next:{year:2027,issue:'001',date:'2027-01-01'}}};const result=evaluateSourceAlert(r,yearEnd,next);assert.equal(result.eligible,true);assert.deepEqual(result.previous,{year:2026,issue:'365',status:'win'});assert.equal(evaluateSourceAlert(r,{...yearEnd,draws:[{...yearEnd.draws[0],draw_date:'2026-12-30'}]},next).eligible,false);
});
test('rule validation bounds input and messages fit a conservative UTF-8 size',()=>{
 assert.throws(()=>validateSourceAlert({...rule,message:''},source));assert.throws(()=>validateSourceAlert({...rule,cutoff:'25:00'},source));assert.throws(()=>validateSourceAlert({...rule,trigger:'eval'},source));const text=sourceAlertMessage({...rule,message:'水'.repeat(300)},{...source,name:'来源'.repeat(100)},{period,raw:'长原文'.repeat(1000)});assert.ok(new TextEncoder().encode(text).length<=1800);
});
