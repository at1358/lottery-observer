const token=process.env.COLLECTOR_SERVICE_TOKEN;if(!token)throw Error('COLLECTOR_SERVICE_TOKEN is required');
const base='http://127.0.0.1:'+(process.env.PORT||3000);
for(let i=0;i<12;i++){
 const response=await fetch(base+'/api/tick',{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(180000)});
 const result=await response.json();if(!response.ok||result.failed)throw Error(result.error||'Collection or draw sync failed; see application logs');
 if(!result.remaining)break;
}
