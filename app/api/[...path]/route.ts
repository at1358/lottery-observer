import {getChatGPTUser} from '../../chatgpt-auth';
import * as svc from '../../../lib/service';
import * as account from '../../../lib/accounts';
import * as manage from '../../../lib/manage';
import {exportBackup} from '../../../lib/backup';
import {readNumberReference,saveNumberReference} from '../../../lib/reference-service';
import {pushState,savePush,testPush,sendLatestDraw} from '../../../lib/wecom';
import {combinationState,saveCombination,saveCombinationPush,calculateCombination,previewCombination,pushCombination,scheduledCombinations} from '../../../lib/combination-service';
export const dynamic='force-dynamic';
async function handle(request:Request,context:any){
 const url=new URL(request.url);const path=url.pathname.replace(/^\/api\//,'');
 try{
  // /tick is a shared updater behind this owner-private Site's platform access boundary.
  // All browser data and mutations additionally require visitor identity.
  const publicAuth=['auth/login','auth/bootstrap','auth/logout'];
  if(['tick','service'].includes(path))await account.authorizeService(request);
  else if(!publicAuth.includes(path))await account.requirePrincipal(request.method!=='GET'&&path!=='account/password',path.startsWith('users')||path==='settings'||path==='backup'||(path.startsWith('number-reference')||path.startsWith('wecom/'))&&request.method!=='GET');
  if(request.method==='GET'){
   if(path==='state')return Response.json(await svc.state(url.searchParams),{headers:{'Cache-Control':'no-store'}});
   if(path==='wecom')return Response.json(await pushState(),{headers:{'Cache-Control':'no-store'}});
   if(path==='combinations')return Response.json(await combinationState(url.searchParams.get('plan')||undefined),{headers:{'Cache-Control':'no-store'}});
   if(path==='history')return Response.json(await svc.history(url.searchParams.get('id')||''));
   if(path==='users')return Response.json(await account.users());
   if(path==='number-reference')return Response.json(await readNumberReference(url.searchParams.get('year')),{headers:{'Cache-Control':'no-store'}});
   if(path==='backup')return Response.json(await exportBackup(),{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="period-observer-backup.json"'}});
   if(path==='snapshot'){
    const s=await svc.snapshot(url.searchParams.get('source')||'');if(!s)return new Response('尚无网页快照，请先执行在线采集',{status:404});
    const csp="default-src 'none'; style-src 'unsafe-inline' https: http:; img-src data: https: http:; font-src https:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox";
    return new Response(s.html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
   }
   return Response.json({error:'接口不存在'},{status:404});
  }
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return Response.json({error:'请求来源不匹配'},{status:403});
  if(Number(request.headers.get('content-length')||0)>1500000)return Response.json({error:'输入内容过大'},{status:413});
  const body:any=await request.json();let result:any;
  switch(path){
   case 'auth/login':case 'auth/bootstrap':{const r=await(path==='auth/login'?account.login(body,request):account.bootstrap(body,request));return Response.json({user:r.user},{headers:{'Set-Cookie':r.cookie,'Cache-Control':'no-store'}});}
   case 'auth/logout':return Response.json({signedOut:true},{headers:{'Set-Cookie':await account.logout(request),'Cache-Control':'no-store'}});
   case 'users/create':result=await account.createUser(body);break;
   case 'number-reference/preview':result=await svc.previewNumberReference(body);break;
   case 'number-reference/save':{for(const value of [body.url,body.contentUrl])if(value)svc.checkUrl(value);result=await saveNumberReference(body);break;}
   case 'users/update':result=await account.updateUser(body);break;
   case 'account/password':result=await account.changePassword(body);break;
   case 'sources/delete':result=await manage.deleteSources(body);break;
   case 'records/delete':result=await manage.deleteRecords(body);break;
   case 'folders/save':result=await manage.saveFolder(body);break;
   case 'folders/move':result=await manage.move(body);break;
   case 'folders/reorder':result=await manage.reorder(body);break;
   case 'folders/delete':result=await manage.deleteFolder(body);break;
   case 'trash/restore':result=await manage.restore(body.id);break;
   case 'preview':{const p=await svc.previewSource(body);result={kind:p.kind,selector:p.selector,contentUrl:p.url,followedPages:p.followedPages,rows:p.rows.slice(0,10),total:p.rows.length};break;}
   case 'source':result=await svc.saveSource(body);break;
   case 'recheck':result=await svc.recheckResults(body);break;
   case 'wecom/save':result=await savePush(body);break;
   case 'wecom/test':result=await testPush();break;
   case 'wecom/send':result=await sendLatestDraw(true);break;
   case 'combinations/save':{const actor=await account.requirePrincipal(true);result=await saveCombination(body,actor.role==='admin');break;}
   case 'combinations/preview':result=await previewCombination(body);break;
   case 'combinations/calculate':result=await calculateCombination(body);break;
   case 'combinations/push-config':await account.requirePrincipal(true,true);result=await saveCombinationPush(body);break;
   case 'combinations/send':await account.requirePrincipal(true,true);result=await pushCombination(body);break;
   case 'source-toggle':result=await svc.toggleSource(body.id,body.enabled===true);break;
   case 'crawl':result=await svc.crawl(body.id,body.text);break;
   case 'draw':result=await svc.saveDraw(body);break;
   case 'draw-sync':result=await svc.syncDraws();break;
   case 'history-sync':result=await svc.syncHistory(body.year);break;
   case 'tick':result=await svc.tick();break;
   case 'service':{
    if(body.operation==='configureDrawSource'){if(body.value.url)svc.checkUrl(body.value.url);await svc.putSetting('drawSource',body.value);result={saved:true};}
    else if(body.operation==='readStatus'){result=await svc.state(new URLSearchParams(body.query||{}));}
    else if(body.operation==='syncDraws')result=await svc.syncDraws();
    else if(body.operation==='syncHistory')result=await svc.syncHistory(body.year);
    else if(body.operation==='crawlSource')result=await svc.crawl(body.id);
    else if(body.operation==='runCombinations')result=await scheduledCombinations(svc.crawl);
    else if(body.operation==='runDrawUpdate'){result=await svc.scheduledDrawUpdate();await svc.finalizeCollections();}
    else if(body.operation==='previewSource'){const p=await svc.previewSource(body.source);result={kind:p.kind,total:p.rows.length,contentUrl:p.url,followedPages:p.followedPages,first:p.rows[0],last:p.rows.at(-1)};}
    else throw Error('未知后台操作');break;
   }
   case 'revise':result=await svc.revise(body.id,body.raw,body.kind);break;
   case 'settings':{
    if(body.key==='collectionSchedule'){result=await svc.saveCollectionSchedule(body.value);break;}
    if(body.key==='drawSchedule'){result=await svc.saveDrawSchedule(body.value);break;}
    if(!['rules','drawSource','historySource','overviewDisplay'].includes(body.key))throw Error('未知设置');
    if(body.key==='overviewDisplay'&&(![10,20,50].includes(body.value.range)||!['line','area'].includes(body.value.chart)||typeof body.value.showLoss!=='boolean'))throw Error('图表配置无效');
    if(body.key==='drawSource'&&body.value.url)svc.checkUrl(body.value.url);
    if(body.key==='historySource'){svc.checkUrl(body.value.url);if(!Number.isInteger(Number(body.value.year))||body.value.year<2000||body.value.year>2100)throw Error('请选择有效的历史年份');}
    await svc.putSetting(body.key,body.value);result={saved:true};break;
   }
   default:return Response.json({error:'接口不存在'},{status:404});
  }
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e:any){return Response.json({error:e.message||'操作失败'},{status:e.status||400});}
}
export const GET=handle;export const POST=handle;
