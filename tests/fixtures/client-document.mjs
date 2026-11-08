import {createCipheriv} from 'node:crypto';
export const clientNumbers=Array.from({length:24},(_,i)=>String(i+1).padStart(2,'0'));
export const clientUrl='https://h8.wanpz.com/script/901/dynamic_2031909_1.js';
export const baoteUrl='https://g3.wanpz.com/site/merge/hbs/data?siteKey=1903&path=%2F&type=1&layout=52012';
export const clientName='901.com【经典24码】作者：小辣椒';
export const clientRaw='313期【经典24码】开:？00准\n【'+clientNumbers.slice(0,12).join('.')+'】\n【'+clientNumbers.slice(12).join('.')+'】';
export function clientScript(html='<div class="ny_box"><div class="ny_tit">'+clientName+'</div><ul><li>'+clientRaw.replaceAll('\n','<br>')+'</li><li>314期【经典24码】开:？00准<br>【00.00.00】</li></ul></div>'){
 return "var G_dynamic_2031909_1 = JSON.parse(__ras(atob('"+Buffer.from(JSON.stringify({widgetId:31909,html:JSON.stringify(html)})).toString('base64')+"')));window.JS_READY=true;";
}
export function baotePayload(){return {data:[{widgetId:52012,data:{ruleId:'2052012',title:'升序24码中特',data:[{issue:2026313,shortIssue:313,ok:2,g:{v1:clientNumbers},w:[]},{issue:2026312,shortIssue:312,ok:1,g:{v1:clientNumbers},w:Array.from({length:7},()=>({c:'23',z:'猴'}))}]}}],fail:[]};}
export function encryptedClientResponse(payload=baotePayload()){
 const iv='0123456789abcdef0123456789abcdef',key='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',cipher=createCipheriv('aes-256-ctr',Buffer.from(key,'hex'),Buffer.from(iv,'hex'));
 return {text:Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]).toString('hex'),iv:iv+key};
}
export function clientResponse(url){
 if(url.hostname==='entry.qa-client.example')return new Response('<title>安全验证</title>请拖动滑块，将拼图移动到正确位置');
 if(url.href===clientUrl)return new Response(clientScript());
 if(url.href===baoteUrl){const r=encryptedClientResponse();return new Response(r.text,{headers:{iv:r.iv}});}
 return null;
}
