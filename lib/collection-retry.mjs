import {effectiveSchedule,nextScheduledRun} from './schedule.mjs';
export const COLLECTION_RETRY_MINUTES=60;
export const COLLECTION_STOP_TIME='21:30';
const local=at=>new Date(Number(new Date(at))+8*3600000).toISOString();
export function collectionWindowOpen(at=Date.now(),cutoff=COLLECTION_STOP_TIME){return local(at).slice(11,16)<(cutoff<COLLECTION_STOP_TIME?cutoff:COLLECTION_STOP_TIME);}
export function nextRecoveryAt(at=Date.now(),cutoff=COLLECTION_STOP_TIME){
 const now=Number(new Date(at)),candidate=now+COLLECTION_RETRY_MINUTES*60000,day=local(now).slice(0,10),stop=cutoff<COLLECTION_STOP_TIME?cutoff:COLLECTION_STOP_TIME;
 return local(candidate).slice(0,10)===day&&local(candidate).slice(11,16)<stop?new Date(candidate).toISOString():null;
}
export function nextCollectionDay(source,defaults,at=Date.now()){
 const schedule=effectiveSchedule(source,defaults),day=new Date(Number(new Date(local(at).slice(0,10)+'T00:00:00Z'))+86400000).toISOString().slice(0,10);
 // Interval collection resumes on the next business day. Daily sources keep
 // their chosen start time; a late configured start is still gated by tick.
 return new Date(day+'T'+(schedule.mode==='daily'?schedule.time:'00:00')+':00+08:00').toISOString();
}
export function nextSourceCollection(source,defaults,failed=false,at=Date.now()){
 if(failed)return nextRecoveryAt(at,source?.cutoff_time||COLLECTION_STOP_TIME)||nextCollectionDay(source,defaults,at);
 const next=nextScheduledRun(effectiveSchedule(source,defaults),at);
 return collectionWindowOpen(next,source?.cutoff_time||COLLECTION_STOP_TIME)?next:nextCollectionDay(source,defaults,next);
}
