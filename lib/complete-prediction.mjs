const read=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
// An unpublished placeholder is retained as evidence, but is not the first
// complete recommendation. Never replace an already valid original forecast.
export function effectivePrediction(row){
 if(!row||read(row.parsed)?.valid||!read(row.first_complete_parsed)?.valid||!row.first_complete_raw||!row.first_complete_kind||!time(row.first_complete_seen_at))return row;
 return {...row,raw:row.first_complete_raw,parsed:typeof row.parsed==='string'?row.first_complete_parsed:read(row.first_complete_parsed),kind:row.first_complete_kind,first_seen:row.first_complete_seen_at,initial_raw:row.raw,initial_first_seen:row.first_seen,recoveredFromPlaceholder:true};
}
export function firstCompleteObservation(row,observation){
 if(!row||read(row.parsed)?.valid||row.first_complete_seen_at)return null;
 // Older edited complete versions lack the original complete text/time. Do not
 // silently substitute their latest version as a historical first forecast.
 if(row.latest_version>0)return null;
 const previous=read(row.latest_parsed),candidate=previous?.valid&&row.latest_raw?{raw:row.latest_raw,parsed:previous,kind:row.latest_kind||row.kind,at:row.last_seen}:observation;
 if(!candidate?.parsed?.valid||!candidate.raw||!candidate.kind||!time(candidate.at)||!time(row.first_seen)||Date.parse(candidate.at)<Date.parse(row.first_seen))return null;
 return candidate;
}
