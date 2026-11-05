import {validateSchedule,nextScheduledRun} from './schedule.mjs';

export const DEFAULT_CUSTOM_MATERIAL_SCHEDULE={mode:'daily',time:'21:45',interval:60,enabled:true,timezone:'Asia/Shanghai'};
export function customMaterialSchedulePlan(input={},runtime={},at=Date.now()){
 const schedule=validateSchedule({...DEFAULT_CUSTOM_MATERIAL_SCHEDULE,...input,mode:'daily'}),time=Number(new Date(at));
 if(!Number.isFinite(time))throw Error('无法计算自建资料更新时间');
 const date=new Date(time+8*3600000).toISOString().slice(0,10),scheduledAt=Date.parse(date+'T'+schedule.time+':00+08:00');
 const successAt=Date.parse(runtime.lastSuccessAt),alreadyDone=runtime.lastSuccessDate===date&&(!Number.isFinite(successAt)||successAt>=scheduledAt),retry=Date.parse(runtime.retryAt),due=schedule.enabled&&!alreadyDone&&time>=scheduledAt&&(!Number.isFinite(retry)||time>=retry);
 const nextRun=!schedule.enabled?null:alreadyDone||time<scheduledAt?nextScheduledRun(schedule,time):new Date(Math.max(scheduledAt,Number.isFinite(retry)?retry:scheduledAt)).toISOString();
 return {schedule,date,due,nextRun};
}
