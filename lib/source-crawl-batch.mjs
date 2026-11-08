/** @param {any[]} sources @param {(id:string)=>Promise<any>} collect @param {(report:any)=>void} [onProgress] */
export async function collectSourceBatch(sources,collect,onProgress=()=>{}){
 const rows=[...new Map(sources.map(s=>[s.id,{id:s.id,name:s.name,url:s.url,status:s.url?'queued':'skipped',message:s.url?'等待采集':'未配置网址，已跳过',inserted:0,changed:0}])).values()];
 const report=()=>({rows:rows.map(r=>({...r})),total:rows.length,finished:rows.filter(r=>['success','error','skipped'].includes(r.status)).length,success:rows.filter(r=>r.status==='success').length,failed:rows.filter(r=>r.status==='error').length,skipped:rows.filter(r=>r.status==='skipped').length,inserted:rows.reduce((n,r)=>n+r.inserted,0),changed:rows.reduce((n,r)=>n+r.changed,0)});
 onProgress(report());
 for(const row of rows){
  if(row.status==='skipped')continue;
  row.status='running';row.message='正在识别并采集';onProgress(report());
  try{const result=await collect(row.id);row.status='success';row.inserted=Number(result.inserted)||0;row.changed=Number(result.changed)||0;row.message=`新增 ${row.inserted} 条，内容变更 ${row.changed} 条`;}
  catch(error){row.status='error';row.message=error instanceof Error?error.message:String(error);}
  onProgress(report());
 }
 return report();
}
