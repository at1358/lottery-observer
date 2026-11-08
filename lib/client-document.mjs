import {createDecipheriv} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {load} from 'cheerio/slim';

// These public data URLs are published by the sites' book-detail component.
// Decode literal data only; never evaluate the downloaded JavaScript.
export function clientDocumentRoute(value){
 let url;try{url=new URL(value);}catch{return null;}
 if(url.protocol!=='https:'||url.port||url.username||url.password||!/^\w+\.wanpz\.com$/.test(url.hostname))return null;
 const dynamic=url.pathname.match(/^\/script\/(\d{1,9})\/dynamic_(\d{1,12})_1\.js$/);
 if(dynamic)return {type:'dynamic',site:dynamic[1],rule:dynamic[2]};
 // This widget has a published template with two lines of twelve numbers.
 if(url.hostname==='g3.wanpz.com'&&url.pathname==='/site/merge/hbs/data'&&url.searchParams.get('siteKey')==='1903'&&url.searchParams.get('path')==='/'&&url.searchParams.get('type')==='1'&&url.searchParams.get('layout')==='52012')return {type:'baote',widget:52012};
 return null;
}
export function dynamicClientDocument(text,url){
 const route=clientDocumentRoute(url);if(route?.type!=='dynamic')return null;
 const expression=new RegExp('^\\s*var\\s+G_dynamic_'+route.rule+'_1\\s*=\\s*JSON\\.parse\\(__ras\\(atob\\([\'"]([A-Za-z0-9+/=]+)[\'"]\\)\\)\\)\\s*;');
 const match=String(text).match(expression);if(!match||match[1].length>1600000)throw Error('公开正文文件的格式已变化');
 let html;try{const data=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));html=JSON.parse(data.html);}catch{throw Error('公开正文不是有效的静态文字资料');}
 if(typeof html!=='string'||html.length>1200000||!/<(?:div|table|section)\b/i.test(html))throw Error('公开正文文件没有有效资料');
 const $=load(html);$('.ny_tit').each((_,node)=>{const title=$(node).text().trim().replace(/^\d{1,3}\s*期\s*/, '');$(node).replaceWith($('<h2>').text(title));});
 return $.html();
}
// The website publishes its AES-CTR transport key in the response's iv header.
// Match only the verified public widget, without changing TLS or other responses.
/** @param {string} text @param {string} url @param {string|null|undefined} iv @returns {string} */
export function decodeClientResponse(text,url,iv){
 const route=clientDocumentRoute(url);if(route?.type!=='baote')return text;
 if(!/^[a-f\d]{96}$/i.test(iv||'')||!text||text.length>2400000||text.length%2||!/^[a-f\d]+$/i.test(text))throw Error('公开栏目接口的响应格式已变化');
 let payload;try{const decipher=createDecipheriv('aes-256-ctr',Buffer.from(iv.slice(32),'hex'),Buffer.from(iv.slice(0,32),'hex'));payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(text,'hex')),decipher.final()]).toString('utf8'));}catch{throw Error('公开栏目接口未返回有效资料');}
 const matches=payload?.data?.filter(item=>item.widgetId===route.widget);if(matches?.length!==1||payload.fail?.length)throw Error('公开栏目接口缺少指定栏目');
 const data=matches[0].data;if(data?.ruleId!=='2052012'||data.title!=='升序24码中特'||!Array.isArray(data.data)||!data.data.length||data.data.length>500)throw Error('公开栏目的身份已变化，请重新核对');
 const seen=new Set(),rows=[...data.data].reverse().map(row=>{
  if(!Number.isInteger(row.issue)||Math.floor(row.issue/1000)<2000||Math.floor(row.issue/1000)>2100||row.issue%1000!==+row.shortIssue||+row.shortIssue<1||+row.shortIssue>366||seen.has(row.issue))throw Error('公开栏目的期数无效或重复');seen.add(row.issue);
  const numbers=row.g?.v1;if(!Array.isArray(numbers)||numbers.length!==24||new Set(numbers).size!==24||!numbers.every(n=>typeof n==='string'&&/^(?:0[1-9]|[1-3]\d|4[0-9])$/.test(n)))throw Error('24码爆特的号码尚未完整公布');
  let result='？00';if(row.ok===1){const draw=row.w?.[6];if(!draw||!/^\d{2}$/.test(draw.c)||!/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/.test(draw.z)||draw.z.length!==1||+draw.c<1||+draw.c>49)throw Error('公开栏目的开奖标注无效');result=draw.z+draw.c;}
  return '<p>'+row.shortIssue+'期:【24码爆特】开【'+result+'】中<br>'+numbers.slice(0,12).join(' ')+'<br>'+numbers.slice(12).join(' ')+'</p>';
 });
 return '<section><h2>1903兔年【24码爆特】精彩好料</h2>'+rows.join('\n')+'</section>';
}
