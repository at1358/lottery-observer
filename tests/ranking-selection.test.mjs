import test from'node:test';import assert from'node:assert/strict';
import{rankingSelection,updateRankingSelection,rankingRowKey}from'../lib/ranking-selection.mjs';import{buildRankingSummary}from'../lib/ranking-summary.mjs';
const at=Date.parse('2026-11-20T10:30:00+08:00'),source=(id,count)=>({id,name:id+count+'码',kind:count+'码',year:2026}),row=(id,origin='collected')=>({id,origin}),material=id=>({plan:{id,name:id,type:'manual-numbers',declaredCount:12,year:2026},rows:[]});
test('ranking preferences default to all eligible rows and independently remove/add each group',()=>{
 const candidates=[row('a'),row('b','custom')],previous={},input={group:'numbers',action:'remove',keys:['collected:a','custom:b'],revision:''},snapshot=structuredClone({previous,input,candidates});
 const removed=updateRankingSelection(previous,input,candidates);assert.equal(removed.changed,2);assert.ok(removed.selection.revision);assert.deepEqual(removed.selection.excluded.numbers,input.keys);assert.deepEqual(removed.selection.excluded.zodiacs,[]);
 const restored=updateRankingSelection(removed.selection,{...input,action:'add',revision:removed.selection.revision},candidates);assert.equal(restored.changed,2);assert.deepEqual(restored.selection.excluded.numbers,[]);assert.deepEqual({previous,input,candidates},snapshot);
 assert.deepEqual(rankingSelection().excluded,{zodiacs:[],numbers:[],thirtySix:[]});
 const noop=updateRankingSelection({}, {...input,action:'add'},candidates);assert.equal(noop.changed,0);assert.equal(noop.selection.revision,'');
});
test('ranking mutations reject stale revisions, wrong groups, invalid keys and cross-category or deleted rows',()=>{
 const input={group:'numbers',action:'remove',keys:['collected:a'],revision:''},candidates=[row('a')];
 for(const bad of [{...input,group:'__proto__'},{...input,action:'delete-source'},{...input,keys:[]},{...input,keys:['source:a']},{...input,keys:['collected:a;DROP TABLE sources']},{...input,keys:Array(501).fill('collected:a')},{...input,keys:['custom:a']},{...input,keys:['collected:deleted']}])assert.throws(()=>updateRankingSelection({},bad,candidates));
 assert.throws(()=>updateRankingSelection({revision:'new'},input,candidates),error=>error.status===409);
 assert.throws(()=>updateRankingSelection({},input,[]),/不属于|已被删除/);
});
test('scope changes preserve statistics and 36-code complements and keep same IDs in different origins distinct',()=>{
 const sources=[source('same',15),source('wide',36)],materials=[material('same'),{plan:{id:'lag',name:'n-1',type:'lag-zodiac',year:2026},rows:[]}],values=Array.from({length:36},(_,i)=>i+1),predictions=[{source_id:'wide',year:2026,issue:'324',parsed:{valid:true,values},verdict:{status:'win'}}],options={sources,materials,predictions,year:2026,at,draws:[{year:2026,issue:'324',number:1}]},before=structuredClone(options),summary=buildRankingSummary(options),group=(data,id)=>data.groups.find(g=>g.id===id);
 const wideBefore=group(summary,'thirtySix').rows[0],preferences={revision:'rev',excluded:{numbers:['collected:same'],thirtySix:['collected:wide'],zodiacs:['custom:lag']}};
 const filtered=buildRankingSummary({...options,selection:preferences});assert.deepEqual(group(filtered,'numbers').rows.map(rankingRowKey),['custom:same']);assert.equal(group(filtered,'thirtySix').rows.length,0);assert.equal(group(filtered,'thirtySix').ready,0);assert.equal(group(filtered,'zodiacs').rows.length,0);assert.equal(group(filtered,'thirtySix').available[0].included,false);assert.deepEqual(options,before);
 const update=updateRankingSelection(preferences,{group:'thirtySix',action:'add',keys:['collected:wide'],revision:'rev'},group(summary,'thirtySix').rows),restored=buildRankingSummary({...options,selection:update.selection});assert.deepEqual(group(restored,'thirtySix').rows[0],wideBefore);assert.deepEqual(group(restored,'thirtySix').rows[0].latest.missingNumbers,Array.from({length:13},(_,i)=>i+37));assert.equal(group(restored,'numbers').rows.length,1);
 const next=buildRankingSummary({...options,sources:[...sources,source('new',15)],selection:preferences});assert.ok(group(next,'numbers').rows.some(r=>r.id==='new'));
});
