import {validateSchedule} from './schedule.mjs';
export function validateSourceScheduleBatch(input){
 if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>500||input.ids.some(id=>typeof id!=='string'||!id||id.length>100))throw Error('请选择1–500个采集来源');
 const ids=[...new Set(input.ids)],value=input.schedule;
 if(!value||!['daily','interval','inherit'].includes(value.mode))throw Error('请选择批量设置的采集方式');
 if(value.mode==='daily'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time||''))throw Error('请填写每天开始时间（00:00–23:59）');
 if(value.mode==='interval'&&(value.interval===undefined||value.interval===''))throw Error('请填写采集间隔');
 const schedule=validateSchedule({mode:value.mode,time:value.mode==='daily'?value.time:'16:30',interval:value.mode==='interval'?value.interval:60},true);
 return {ids,schedule};
}
