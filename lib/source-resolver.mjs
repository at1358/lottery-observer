import {discoverEntry} from './entry-navigation.mjs';
import {resolveModule} from './content-resolver.mjs';
import {splitPeriods,parsePrediction,normalize} from './domain.mjs';
const identityKey=value=>normalize(value||'').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
export async function resolveNavigationSource(source,options,downloadEntry,downloadDirect){
 try{return await discoverEntry(source.url,{...options,entryMode:source.entry_mode,keyword:source.entry_keyword||(source.entry_mode==='redirect'?(String(source.name||'').match(/【([^】]+)】/)?.[1]||source.name):''),line:source.entry_mode==='navigation'?source.entry_line:''},downloadEntry);}
 catch(entryError){
  if(source.entry_mode!=='navigation'||entryError.code==='UNSAFE_SOURCE_URL')throw entryError;
  const cached=source.content_url,identity=identityKey(options.identity);
  if(!cached||cached===source.url||!identity)throw entryError;
  try{
   const result=await resolveModule(await downloadDirect(cached),options,downloadDirect);
   if(identityKey(result.identity)!==identity)throw Error('备用正文不是已核验的同一栏目');
   if(!splitPeriods(result.text).some(row=>parsePrediction(row.raw,result.kind,source.name).valid))throw Error('备用正文尚无完整资料');
   return {...result,entryFallback:true,entryError:entryError.message,navigation:[{label:'固定入口暂不可用',url:source.url},{label:'使用上次核验的同栏目正文',url:result.url}]};
  }catch(error){throw Error(entryError.message+'；上次正文也未通过核验：'+error.message);}
 }
}
