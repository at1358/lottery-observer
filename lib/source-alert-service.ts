import {list,run} from './db';
import {validateSourceAlert,evaluateSourceAlert} from './source-alerts.mjs';
import {rulesWithReference} from './number-reference.mjs';
import {sendRobotContent} from './wecom';
const now=()=>new Date().toISOString(),ruleKey=(id:string)=>'sourceAlertRule:'+id;
async function setting(key:string,fallback:any={}){const [r]=await list('SELECT value FROM settings WHERE key=?',key);return r?JSON.parse(r.value):fallback;}
async function store(key:string,value:any){await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
async function rules(){return (await list("SELECT value FROM settings WHERE key LIKE 'sourceAlertRule:%'")).map(r=>JSON.parse(r.value));}
async function audit(status:string,message:string){await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'资料特别提醒',status,message,status==='success'?1:0,now());}
async function context(ids:string[]){
 const sources=await list('SELECT id,name,kind,year,deleted_batch FROM sources'),unique=[...new Set(ids)],where=unique.length?'source_id IN ('+unique.map(()=>'?').join(',')+')':'0';
 const [predictions,failures,draws,expected,base,refs]=await Promise.all([list('SELECT * FROM predictions WHERE deleted_batch IS NULL AND '+where,...unique),list("SELECT * FROM collection_periods WHERE status='failed' AND deleted_batch IS NULL AND "+where,...unique),list('SELECT * FROM draws'),setting('expectedDrawPeriods'),setting('rules'),list("SELECT value FROM settings WHERE key LIKE 'numberReference:%'")]);
 const references=new Map(refs.map(r=>{const v=JSON.parse(r.value);return [+v.year,v];})),years=[...new Set([...predictions.map(p=>+p.year),...draws.map(d=>+d.year)])],effective:any={};for(const year of years)effective[year]=rulesWithReference(base.years?.[year]||{},references.get(year));
 return {sources,predictions,failures,draws,expected,rules:effective};
}
export async function readSourceAlerts(){
 const plans=await rules(),ctx=await context(plans.filter(r=>!r.deletedAt).map(r=>r.sourceId)),deliveries=(await list("SELECT value FROM settings WHERE key LIKE 'sourceAlertDelivery:%' ORDER BY json_extract(value,'$.attemptAt') DESC LIMIT 30")).map(r=>JSON.parse(r.value));
 return {configured:!!(await setting('wecomPush')).webhook,sources:ctx.sources.filter(s=>!s.deleted_batch),rules:plans.filter(r=>!r.deletedAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>({...r,check:evaluateSourceAlert(r,ctx)})),archived:plans.filter(r=>r.deletedAt),deliveries};
}
export async function previewSourceAlert(input:any){const ctx=await context([input.sourceId]),source=ctx.sources.find(s=>s.id===input.sourceId),value=validateSourceAlert(input,source);return evaluateSourceAlert(value,ctx);}
export async function saveSourceAlert(input:any){
 const id=input.id||crypto.randomUUID();if(typeof id!=='string'||id.length>100)throw Error('提醒编号无效');const [stored]=await list('SELECT value FROM settings WHERE key=?',ruleKey(id)),old=stored?JSON.parse(stored.value):null;
 if(input.id&&!old)throw Error('提醒规则不存在');if(old&&(old.deletedAt||input.revision!==old.revision))throw Error('规则已修改或删除，请刷新后重试');
 const [source]=await list('SELECT id,name,kind,deleted_batch FROM sources WHERE id=?',input.sourceId),value=validateSourceAlert(input,source);if(value.enabled&&!(await setting('wecomPush')).webhook)throw Error('启用提醒前请先在企业微信推送中保存机器人地址');
 if(!old&&(await rules()).filter(r=>!r.deletedAt).length>=100)throw Error('最多保留100条使用中的提醒规则');
 const plan={...value,id,revision:crypto.randomUUID(),createdAt:old?.createdAt||now(),updatedAt:now()},serialized=JSON.stringify(plan),result=stored?await run('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,ruleKey(id),stored.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',ruleKey(id),serialized);
 if(!result.meta.changes)throw Error('规则存在并发修改，请刷新后重试');await audit('success',`提醒「${plan.name}」已保存，${plan.enabled?'已启用':'已暂停'}；同一规则同年同期只推送一次`);return {rule:plan};
}
export async function archiveSourceAlert(input:any,restore=false){
 const key=ruleKey(input.id),[stored]=await list('SELECT value FROM settings WHERE key=?',key);if(!stored)throw Error('提醒规则不存在');const old=JSON.parse(stored.value);if(old.revision!==input.revision)throw Error('规则已修改，请刷新后重试');if(restore&&!old.deletedAt||!restore&&old.deletedAt)throw Error('规则状态已变化，请刷新');
 const value={...old,enabled:false,deletedAt:restore?null:now(),revision:crypto.randomUUID(),updatedAt:now()},result=await run('UPDATE settings SET value=? WHERE key=? AND value=?',JSON.stringify(value),key,stored.value);if(!result.meta.changes)throw Error('规则存在并发修改，请刷新');await audit('success',`提醒「${old.name}」已${restore?'恢复，保持暂停':'移入回收站'}`);return {saved:true};
}
async function deliver(rule:any,ctx:any,manual=false){
 if(!rule.enabled||rule.deletedAt)return {skipped:true,reason:'规则已暂停或删除'};const check=evaluateSourceAlert(rule,ctx),period=check.period;if(!check.eligible||!period)return {skipped:true,reason:check.reason};
 if(!(await setting('wecomPush')).webhook)return {skipped:true,reason:'尚未配置企业微信机器人'};
 const key=`sourceAlertDelivery:${rule.id}:${period.year}:${period.issue}`,[stored]=await list('SELECT value FROM settings WHERE key=?',key),before=stored?JSON.parse(stored.value):null;
 if(before?.status==='sent')return {skipped:true,reason:'本规则该期已推送，不重复发送'};if(before?.retryAt>now())return {skipped:true,reason:'正在推送或等待五分钟重试'};
 const value={ruleId:rule.id,ruleName:rule.name,sourceId:rule.sourceId,sourceName:rule.sourceName,year:period.year,issue:period.issue,trigger:rule.trigger,status:'sending',attemptAt:now(),retryAt:new Date(Date.now()+300000).toISOString(),content:check.content},serialized=JSON.stringify(value),claimed=stored?await run('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,key,stored.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,serialized);
 if(!claimed.meta.changes)return {skipped:true,reason:'已有推送检查执行中'};
 const current=await setting(ruleKey(rule.id));if(!current.enabled||current.deletedAt||current.revision!==rule.revision){await store(key,{...value,status:'cancelled',retryAt:null,error:'规则已变更，已取消本次发送'});return {skipped:true,reason:'规则已变更'};}
 try{await sendRobotContent(check.content);await store(key,{...value,status:'sent',sentAt:now(),retryAt:null,error:null});await audit('success',`「${rule.name}」${period.year}年第${period.issue}期资料提醒已推送`);return {sent:true,issue:period.issue};}
 catch(e:any){await store(key,{...value,status:'failed',error:e.message});await audit('error',`「${rule.name}」推送失败：${e.message}`);if(manual)throw e;return {failed:true,error:e.message};}
}
export async function sendSourceAlert(input:any){const rule=await setting(ruleKey(input.id));if(!rule.id)throw Error('提醒规则不存在');return deliver(rule,await context([rule.sourceId]),true);}
export async function scheduledSourceAlerts(){const plans=(await rules()).filter(r=>r.enabled&&!r.deletedAt);if(!plans.length)return {sent:0,failed:0};const ctx=await context(plans.map(r=>r.sourceId));let sent=0,failed=0;for(const rule of plans){if(sent+failed>=15)break;const result=await deliver(rule,ctx);if(result.sent)sent++;if(result.failed)failed++;}return {sent,failed};}
