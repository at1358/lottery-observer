export const DEFAULT_PUSH={enabled:false,time:'21:40'};
export function validateWebhook(value){
 let url;try{url=new URL(String(value).trim());}catch{throw Error('请填写完整的企业微信群机器人 Webhook 地址');}
 if(url.protocol!=='https:'||url.hostname!=='qyapi.weixin.qq.com'||url.port||url.pathname!=='/cgi-bin/webhook/send'||url.username||url.password||url.hash||[...url.searchParams.keys()].some(k=>k!=='key')||url.searchParams.getAll('key').length!==1||!/^[A-Za-z0-9_-]{8,128}$/.test(url.searchParams.get('key')||''))throw Error('请使用企业微信提供的 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=… 地址');
 return url.href;
}
export function beijingDate(at=Date.now()){return new Date(at+8*3600000).toISOString().slice(0,10);}
export function drawDay(draw){return draw.draw_date||(draw.drawn_at?beijingDate(Date.parse(draw.drawn_at)):null);}
export function knownDrawDate(draw,periods={}){
 if(!draw||draw.draw_date||draw.drawn_at)return draw;
 const period=periods[draw.year+'-'+draw.issue],date=period?.date;
 if(Number(period?.year)!==draw.year||String(period?.issue)!==String(draw.issue)||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||Number(date.slice(0,4))!==draw.year)return draw;
 // This period's date was explicitly announced by the trusted feed beforehand.
 // Never infer its date from today's clock or the following period's time.
 return {...draw,draw_date:date};
}
export function completeDraw(draw){return !!draw&&Array.isArray(draw.numbers)&&draw.numbers.length===7&&new Set(draw.numbers).size===7&&draw.numbers.every(n=>Number.isInteger(n)&&n>=1&&n<=49)&&draw.numbers[6]===draw.number;}
export function drawMessage(draw){
 if(!completeDraw(draw))throw Error('最新开奖尚未提供完整的六个平码和特码，暂不推送');
 const animals=[...'鼠牛虎兔龙蛇马羊猴鸡狗猪'],label=(n,i)=>String(n).padStart(2,'0')+'（'+(animals.includes(draw.zodiacs?.[i])?draw.zodiacs[i]:i===6&&animals.includes(draw.zodiac)?draw.zodiac:'生肖未提供')+'）';
 return `新澳门开奖结果\n${draw.year} 年第 ${String(draw.issue).padStart(3,'0')} 期\n开奖日期：${drawDay(draw)||'来源未提供'}\n平码：${draw.numbers.slice(0,6).map(label).join('、')}\n特码：${label(draw.number,6)}`;
}
export function pushEligibility(config,draw,at=Date.now(),manual=false){
 if(!config.webhook)return '请先保存企业微信 Webhook';
 if(!manual&&!config.enabled)return '每日自动推送已暂停';
 if(!manual&&new Date(at+8*3600000).toISOString().slice(11,16)<config.time)return '尚未到每日推送时间';
 if(!draw||drawDay(draw)!==beijingDate(at))return '等待当天的开奖结果，不推送往期记录';
 if(draw.drawn_at&&Date.parse(draw.drawn_at)>at)return '尚未到该期实际开奖时间';
 if(!completeDraw(draw))return '等待当天完整的六个平码和特码';
 return null;
}
export function needsDrawRefresh(config,draw,at=Date.now()){
 return !!config.enabled&&!!config.webhook&&new Date(at+8*3600000).toISOString().slice(11,16)>=config.time&&(!draw||drawDay(draw)!==beijingDate(at)||!completeDraw(draw));
}
export async function postWecom(webhook,content,transport=fetch){
 const url=validateWebhook(webhook);let response;
 try{response=await transport(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json'},body:JSON.stringify({msgtype:'text',text:{content}})});}catch{throw Error('企业微信连接失败或超时，请稍后重试');}
 if(!response.ok)throw Error('企业微信返回 HTTP '+response.status);
 let data;try{data=await response.json();}catch{throw Error('企业微信返回了无法识别的响应');}
 if(data.errcode!==0)throw Error('企业微信拒绝推送（错误码 '+String(data.errcode??'未知').replace(/[^\d-]/g,'').slice(0,12)+'），请检查机器人是否可用');
 return {sent:true};
}
