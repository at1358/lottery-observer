import {list,run} from './db';
import {DEFAULT_PUSH,validateWebhook,drawMessage,pushEligibility,postWecom,knownDrawDate,needsDrawRefresh} from './wecom-push.mjs';
import {DEFAULT_DRAW_SCHEDULE} from './collection-deadline.mjs';
const now=()=>new Date().toISOString();
async function setting(key:string,fallback:any={}){const [row]=await list('SELECT value FROM settings WHERE key=?',key);return row?JSON.parse(row.value):fallback;}
async function store(key:string,value:any){await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));}
async function audit(status:string,message:string){await run('INSERT INTO jobs(id,name,status,message,count,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'企业微信推送',status,message,status==='success'?1:0,now());}
async function latest(){const [row]=await list('SELECT * FROM draws ORDER BY year DESC,issue DESC LIMIT 1');return row?knownDrawDate({...row,numbers:JSON.parse(row.numbers||'[]'),zodiacs:JSON.parse(row.zodiacs||'[]')},await setting('expectedDrawPeriods')):null;}
export async function refreshPendingPush(refresh:()=>Promise<any>){
 const config=await setting('wecomPush',DEFAULT_PUSH),draw=await latest();
 if(!needsDrawRefresh(config,draw)||!(await setting('drawSchedule',DEFAULT_DRAW_SCHEDULE)).enabled)return {skipped:true};
 const scheduled=await setting('drawScheduleState'),key='wecomDrawRefresh',[stored]=await list('SELECT value FROM settings WHERE key=?',key),before=stored?JSON.parse(stored.value):{};
 if(Date.parse(scheduled.lastRun||'')>Date.now()-5*60000||before.nextCheck>now())return {skipped:true};
 const value={lastRun:now(),nextCheck:new Date(Date.now()+5*60000).toISOString()},serialized=JSON.stringify(value);
 const claimed=stored?await run('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,key,stored.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,serialized);
 if(!claimed.meta.changes)return {skipped:true};
 try{const result=await refresh();await store(key,{...value,error:result.errors?.join('；')||null});return result;}
 catch{await store(key,{...value,error:'等待开奖结果时同步失败，五分钟后重试'});return {failed:true};}
}
export async function pushState(){
 const config=await setting('wecomPush',DEFAULT_PUSH),draw=await latest(),deliveries=await list("SELECT value FROM settings WHERE key LIKE 'wecomDelivery:%' ORDER BY key DESC LIMIT 12");
 let preview='',reason=pushEligibility(config,draw,Date.now(),true);try{if(draw)preview=drawMessage(draw);}catch{}
 return {enabled:!!config.enabled,time:config.time||DEFAULT_PUSH.time,configured:!!config.webhook,preview,reason,last:await setting('wecomPushState'),deliveries:deliveries.map(r=>JSON.parse(r.value))};
}
export async function savePush(input:any){
 const old=await setting('wecomPush',DEFAULT_PUSH),time=String(input.time||'');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||typeof input.enabled!=='boolean')throw Error('请选择每日推送时间和启用状态');
 const webhook=input.clearWebhook?'':input.webhook?.trim()?validateWebhook(input.webhook):old.webhook||'';
 if(input.enabled&&!webhook)throw Error('启用每日推送前请先填写 Webhook');
 await store('wecomPush',{enabled:input.enabled,time,webhook});await audit('success','每日推送配置已保存：'+(input.enabled?'北京时间 '+time:'已暂停'));
 return pushState();
}
export async function testPush(){
 const config=await setting('wecomPush');if(!config.webhook)throw Error('请先保存 Webhook');
 // A conditional database lease also bounds repeated button clicks across browser tabs.
 const key='wecomTestLease',stamp=Date.now(),value=String(stamp+60000);
 const claimed=await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<=?',key,value,stamp);
 if(!claimed.meta.changes)throw Error('测试消息每分钟最多发送一次，请稍后再试');
 try{await postWecom(config.webhook,'期数采集台：企业微信群推送连接测试成功。');await audit('success','连接测试消息已发送');return {sent:true};}
 catch(e:any){await audit('error',e.message);throw e;}
}
export async function sendLatestDraw(manual=false){
 const config=await setting('wecomPush',DEFAULT_PUSH),draw=await latest(),reason=pushEligibility(config,draw,Date.now(),manual);
 if(reason){if(manual)throw Error(reason);return {skipped:true,reason};}
 const key='wecomDelivery:'+draw.year+':'+draw.issue,[stored]=await list('SELECT value FROM settings WHERE key=?',key),before=stored?JSON.parse(stored.value):null;
 if(before?.status==='sent')return {skipped:true,reason:'该期开奖结果已推送',issue:draw.issue};
 if(before?.retryAt&&before.retryAt>now())return {skipped:true,reason:before.status==='sending'?'该期正在推送':'失败后等待五分钟重试'};
 const value={year:draw.year,issue:draw.issue,status:'sending',attemptAt:now(),retryAt:new Date(Date.now()+5*60000).toISOString()},serialized=JSON.stringify(value);
 const claimed=stored?await run('UPDATE settings SET value=? WHERE key=? AND value=?',serialized,key,stored.value):await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',key,serialized);
 if(!claimed.meta.changes)return {skipped:true,reason:'已有推送任务执行中'};
 try{
  await postWecom(config.webhook,drawMessage(draw));const result={...value,status:'sent',sentAt:now(),retryAt:null,error:null};await store(key,result);await store('wecomPushState',result);await audit('success',`${draw.year} 年第 ${draw.issue} 期完整开奖结果已推送`);return {sent:true,issue:draw.issue};
 }catch(e:any){const result={...value,status:'failed',error:e.message};await store(key,result);await store('wecomPushState',result);await audit('error',`${draw.year} 年第 ${draw.issue} 期：${e.message}`);if(manual)throw e;return {failed:true,error:e.message};}
}
