export const DEFAULT_DRAW_SCHEDULE={mode:'daily',time:'21:40',interval:1440,enabled:true,timezone:'Asia/Shanghai'};
export function deadlineAt(date,time='21:35'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('采集截止时间无效');
 const result=new Date(date+'T'+time+':00+08:00');if(!Number.isFinite(result.getTime()))throw Error('采集截止日期无效');return result.toISOString();
}
export function collectionOutcome(source,prediction,date,at=Date.now()){
 const deadline=deadlineAt(date,source.cutoff_time||'21:35');
 if(!source.enabled||!source.tracking_from||source.tracking_from>=deadline||Number(new Date(at))<Date.parse(deadline))return null;
 let parsed=prediction?.parsed;try{if(typeof parsed==='string')parsed=JSON.parse(parsed);}catch{parsed=null;}
 if(parsed?.valid&&prediction.first_seen<=deadline)return {status:'collected',deadline,reason:'截止前已采集有效资料'};
 const detail=!prediction?'未采集到当期资料':prediction.first_seen>deadline?'开奖后才采集到资料':'当期资料未通过完整性识别';
 return {status:'failed',deadline,reason:`采集失败：截至 ${date} ${source.cutoff_time||'21:35'}（北京时间）${detail}${source.error?'；'+source.error:''}`};
}
