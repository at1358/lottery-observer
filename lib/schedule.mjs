export const DEFAULT_SCHEDULE={mode:'interval',time:'16:30',interval:60,enabled:true,timezone:'Asia/Shanghai'};
export const CHECK_MINUTE=30;
const CHINA_OFFSET=8*60*60*1000;
export function validateSchedule(value,allowInherit=false){
 const mode=value.mode||'interval';
 if(!['interval','daily',...(allowInherit?['inherit']:[])].includes(mode))throw Error('请选择按间隔或每天固定时间采集');
 const time=value.time||'16:30';if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('采集时间应为 00:00–23:59');
 const interval=Number(value.interval??60);if(!Number.isInteger(interval)||interval<60||interval>10080)throw Error('采集间隔应为 60–10080 分钟');
 return {mode,time,interval,enabled:value.enabled!==false,timezone:'Asia/Shanghai'};
}
export function effectiveSchedule(source,defaults=DEFAULT_SCHEDULE){
 const global={...DEFAULT_SCHEDULE,...defaults};
 if(!source||!source.schedule_mode||source.schedule_mode==='inherit')return global;
 return {...global,mode:source.schedule_mode,time:source.daily_time||global.time,interval:Number(source.interval)||global.interval};
}
export function nextScheduledRun(schedule,after=Date.now()){
 const s=validateSchedule({...DEFAULT_SCHEDULE,...schedule});const now=Number(new Date(after));
 if(!Number.isFinite(now))throw Error('无法计算采集时间');
 if(s.mode==='interval')return new Date(now+s.interval*60000).toISOString();
 const local=new Date(now+CHINA_OFFSET),[hour,minute]=s.time.split(':').map(Number);
 let target=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),hour,minute)-CHINA_OFFSET;
 if(target<=now)target+=86400000;
 return new Date(target).toISOString();
}
export function estimatedExecution(planned,now=Date.now(),runtime='sites'){
 const time=Math.max(Number(new Date(planned)),Number(new Date(now)));
 if(!Number.isFinite(time))return null;
 if(runtime==='standalone')return new Date(Math.ceil(time/60000)*60000).toISOString();
 const checkpoint=new Date(time);checkpoint.setUTCMinutes(CHECK_MINUTE,0,0);
 if(checkpoint.getTime()<time)checkpoint.setUTCHours(checkpoint.getUTCHours()+1);
 return checkpoint.toISOString();
}
export function scheduleLabel(source,defaults=DEFAULT_SCHEDULE){
 const s=effectiveSchedule(source,defaults);
 return s.mode==='daily'?'每天 '+s.time:'每 '+s.interval+' 分钟';
}
