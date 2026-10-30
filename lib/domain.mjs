export const KINDS = ['自动识别','36码','24码','15码','号码','尾数','生肖','头数','半头','五行','波色','合数','合数单双','生肖属性','单双','杀尾','杀肖','杀头','杀半头','杀行','杀号码','杀段','杀门','季节'];
const animals = '鼠牛虎兔龙蛇马羊猴鸡狗猪';
function declaredNumberCount(text){
 const value=normalize(text).match(/(?:^|[^\d])([0-9]{1,2}|[一二两三四五六七八九十]{1,3})\s*码/)?.[1];if(!value)return 0;if(/^\d+$/.test(value))return Number(value);
 const digits={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};if(value.includes('十')){const [tens,ones]=value.split('十');return (tens?digits[tens]:1)*10+(ones?digits[ones]:0);}return digits[value]||0;
}
export function normalize(s) { return String(s).normalize('NFKC').replace(/碼/g,'码').replace(/龍/g,'龙').replace(/雞/g,'鸡').replace(/豬/g,'猪').replace(/殺/g,'杀').replace(/頭/g,'头').replace(/單/g,'单').replace(/雙/g,'双'); }
export function inferKind(title) {
 const full=normalize(title);const primary=full.match(/[【(《〖]([^】)》〗]+)[】)》〗]/)?.[1];const s=primary&&/码|尾|肖|头|行|单双|季|段|门/.test(primary)&&!/^\s*[1-7]\s*[段门]\s*$/.test(primary)?primary:full;
 if(/杀|不出|不开|稳杀|排除/.test(s)) {
  if(/半头/.test(s))return '杀半头';
  if(/尾/.test(s))return '杀尾'; if(/肖/.test(s))return '杀肖'; if(/头/.test(s))return '杀头';
  if(/行|金|木|水|火|土/.test(s))return '杀行'; if(/段/.test(s))return '杀段'; if(/门/.test(s))return '杀门'; return '杀号码';
 }
 if(/36.*码/.test(s))return '36码'; if(/24.*码/.test(s))return '24码'; if(/15.*码/.test(s))return '15码';
 if(/\d+肖.*\d+码/.test(s))return '号码';
 if(/合数单双|合数[单双]|合[单双]/.test(s))return '合数单双';
 if(/合数|合值/.test(s))return '合数';
 if(/波色|[红蓝绿]波/.test(s))return '波色';
 if(/生肖属性/.test(s))return '生肖属性';
 if(/半头/.test(s))return '半头';
 if(/尾/.test(s))return '尾数'; if(/肖/.test(s))return '生肖'; if(/头/.test(s))return '头数';
 if(/五行|行中特/.test(s))return '五行'; if(/单双/.test(s))return '单双'; if(/季/.test(s))return '季节'; return '号码';
}
export function parsePrediction(raw, kind, title='') {
 const s=normalize(raw); const warnings=[];
 const cleaned=s.replace(/^\s*(?:\d{4}[-/])?\d{1,3}\s*期\s*[:：;；]?/,'').replace(/(?:特开|开奖|开)[\s:：》>]*[【\[（(]?[?？\u4e00-\u9fff]*\s*\d{1,2}[^\n]*/g,'');
 const groups=[...cleaned.matchAll(/[【{〖\[（(《「『]([^】}〗\]）)》」』]+)[】}〗\]）)》」』]/g)].map(m=>m[1]);
 let values=[];
 if(['生肖','杀肖'].includes(kind)) {values=[...new Set(groups.join('').match(new RegExp('['+animals+']','g'))||[])];if(/一国三肖/.test(normalize(title)))warnings.push('一国三肖含多个候选分组，需确认实际推荐的一组');}
 else if(['五行','杀行'].includes(kind))values=[...new Set(groups.join('').match(/[金木水火土]/g)||[])];
 else if(kind==='单双')values=[...new Set(groups.join('').match(/[单双]/g)||[])];
 else if(kind==='波色')values=[...new Set((groups.join('').match(/[红蓝绿]/g)||[]).map(v=>v+'波'))];
 else if(kind==='合数单双')values=[...new Set((groups.join('').match(/[单双]/g)||[]).map(v=>'合数'+v))];
 else if(kind==='合数'){const tokens=groups.join(' ').match(/\d+/g)||[];values=[...new Set(tokens.map(Number))];if(tokens.some(t=>t.length>2)||values.some(v=>v<1||v>13))warnings.push('合数应为 1–13');}
 else if(kind==='生肖属性')values=[...new Set(groups.join('、').split(/[\s、，,./|]+/).filter(Boolean))];
 else if(kind==='季节')values=[...new Set(groups.join('').match(/[春夏秋冬]/g)||[])];
 else if(['半头','杀半头'].includes(kind)){
  const body=groups.join('').replace(/\s/g,'');
  values=[...new Set([...body.matchAll(/([0-4])头([单双])/g)].map(m=>m[1]+'头'+m[2]))];
  if(/[5-9]头/.test(body))warnings.push('头数应为 0–4');
  if(!values.length)warnings.push('半头需要同时提供头数和单双，例如 0头双、3头单');
 }
 else if(['尾数','杀尾','头数','杀头','杀段','杀门'].includes(kind)) {
  if(['头数','杀头'].includes(kind)&&/\d\s*头\s*[单双]/.test(cleaned))warnings.push('内容含头数与单双组合，应选择半头或杀半头');
  const cn={'零':'0','一':'1','二':'2','两':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9'};
  let body=groups.filter(g=>/\d|[零一二两三四五六七八九].*[尾头段门]/.test(g)&&!/精准|稳准|主攻|中特|推荐|绝杀|资料/.test(g)).join(' ').replace(/[零一二两三四五六七八九]/g,c=>cn[c]);
  if(!body)body=(cleaned.match(/(?:杀|尾|头|段|门)[^\n]*\d[^\n]*/)||[''])[0];
  values=[...new Set((body.match(/\d/g)||[]).map(Number))];
  const max=['头数','杀头','杀门'].includes(kind)?(kind==='杀门'?5:4):kind==='杀段'?7:9;
  if(values.some(v=>v>max)||(kind==='杀段'||kind==='杀门')&&values.includes(0)) warnings.push('分类数值超出范围');
 } else {
  const numericLines=cleaned.split('\n').flatMap(l=>[...l.matchAll(/(?<!\d)\d+(?:[.。．,，、\t -]+\d+){2,}(?!\d)/g)].map(m=>m[0]));
  const numericGroups=groups.filter(g=>/^\s*\d+(?:[.。．,，、\s-]+\d+)+\s*$/.test(g));
  let body=numericLines.join('\n');
  if(!body)body=numericGroups.join(' ');
  const tokens=body.match(/\d+/g)||[];
  if(tokens.some(n=>n.length>2))warnings.push('号码粘连，需人工拆分');
  const nums=tokens.map(Number);
  if(nums.some(n=>n<1||n>49))warnings.push('号码超出 01–49');
  values=[...new Set(nums.filter(n=>n>=1&&n<=49))];
  if(values.length!==nums.length)warnings.push('号码重复或无效');
  const expected=declaredNumberCount(title+' '+raw)||Number(kind.replace('码',''));
  if(expected&&values.length!==expected)warnings.push(`标注 ${expected} 码，识别到 ${values.length} 个不同号码`);
 }
 if(!values.length)warnings.push('没有完整的预测内容');
 return {values,warnings,valid:warnings.length===0};
}
export function splitPeriods(text) {
 const s=String(text).replace(/\r\n/g,'\n');
 const matches=[...s.matchAll(/(?:^|\n)[ \t]*(?:(\d{4})[-/])?(\d{1,3})\s*期/g)];
 return assignYearOffsets(matches.map((m,i)=>({issue:String(Number(m[2])).padStart(3,'0'),explicitYear:m[1]?Number(m[1]):null,raw:s.slice(m.index+(s[m.index]==='\n'?1:0),matches[i+1]?.index??s.length).trimEnd()})));
}
export function assignYearOffsets(rows){
 let desc=0,asc=0;for(let i=1;i<rows.length;i++){const delta=+rows[i].issue-(+rows[i-1].issue);if(Math.abs(delta)<60){if(delta<0)desc++;if(delta>0)asc++;}}
 const descending=desc>=asc;let offset=0;
 const assigned=rows.map((r,i)=>{if(i){const prev=+rows[i-1].issue,n=+r.issue;if(descending&&prev<=40&&n>=320)offset--;if(!descending&&prev>=320&&n<=40)offset++;}return {...r,yearOffset:offset};});
 const max=Math.max(0,...assigned.map(r=>r.yearOffset));return assigned.map(r=>({...r,yearOffset:r.yearOffset-max}));
}
export function evaluate(p, draw, rules={}) {
 const parsed=typeof p.parsed==='string'?JSON.parse(p.parsed):p.parsed;
 if(!parsed?.valid)return {status:'review',reason:parsed?.warnings?.join('；')||'无法识别'};
 if(!draw)return {status:'pending',reason:'等待同年份、同期数的开奖结果'};
 let actual;const n=Number(draw.number);
 if(['36码','24码','15码','号码','杀号码'].includes(p.kind))actual=n;
 else if(['尾数','杀尾'].includes(p.kind))actual=n%10;
 else if(['头数','杀头'].includes(p.kind))actual=Math.floor(n/10);
 else if(['半头','杀半头'].includes(p.kind))actual=Math.floor(n/10)+'头'+(n%2?'单':'双');
 else if(['生肖','杀肖'].includes(p.kind))actual=draw.zodiac||rules.zodiacs?.[n];
 else if(['五行','杀行'].includes(p.kind))actual=draw.element||rules.elements?.[n];
 else if(p.kind==='单双')actual=n%2?'单':'双';
 else if(p.kind==='波色')actual=rules.waves?.[n];
 else if(p.kind==='合数')actual=Math.floor(n/10)+n%10;
 else if(p.kind==='合数单双')actual=(Math.floor(n/10)+n%10)%2?'合数单':'合数双';
 else if(p.kind==='生肖属性')actual=rules.attributes?.[draw.zodiac||rules.zodiacs?.[n]];
 else if(p.kind==='季节')actual=rules.seasons?.[draw.zodiac||rules.zodiacs?.[n]];
 else if(p.kind==='杀段')actual=parsed.sourceRules?.segments?.[n]??rules.segments?.[n];
 else if(p.kind==='杀门')actual=rules.doors?.[n];
 if(actual===null||actual===undefined||actual===''||Array.isArray(actual)&&!actual.length)return {status:'review',reason:'缺少生肖、五行、波色或分组映射，请先配置号码对照'};
 if(p.kind==='生肖属性'&&parsed.values.some(v=>!Object.values(rules.attributes||{}).flat().includes(v)))return {status:'review',reason:'生肖属性尚未在同年份号码对照中定义'};
 const hit=Array.isArray(actual)?parsed.values.some(v=>actual.includes(v)):parsed.values.includes(actual);const win=p.kind.startsWith('杀')?!hit:hit;
 return {status:win?'win':'loss',reason:`${p.kind.startsWith('杀')?'排除':'包含'} ${parsed.values.join('、')}；开奖属性 ${actual}`};
}
export function statistics(rows) {
 const win=rows.filter(r=>r.verdict?.status==='win').length,loss=rows.filter(r=>r.verdict?.status==='loss').length;
 const settled=win+loss;
 return {total:rows.length,win,loss,settled,collectionFailed:rows.filter(r=>r.verdict?.status==='collection_failed').length,pending:rows.filter(r=>r.verdict?.status==='pending').length,review:rows.filter(r=>r.verdict?.status==='review').length,rate:settled?100*win/settled:null,errorRate:settled?100*loss/settled:null};
}
export function validateDraw(d,allowUnknownTime=false) {
 if(!Number.isInteger(d.year)||d.year<2000||d.year>2100)throw Error('年份应为 2000–2100');
 if(!/^\d{1,3}$/.test(String(d.issue))||+d.issue<1||+d.issue>366)throw Error('期数应为 001–366');
 if(!Number.isInteger(d.number)||d.number<1||d.number>49)throw Error('特码应为 01–49');
 if(d.zodiac&&!animals.includes(d.zodiac))throw Error('生肖无效');
 if(d.element&&!['金','木','水','火','土'].includes(d.element))throw Error('五行无效');
 if(d.numbers?.length){if(d.numbers.length!==7||new Set(d.numbers).size!==7||d.numbers.some(n=>!Number.isInteger(n)||n<1||n>49)||d.numbers[6]!==d.number)throw Error('开奖结果需包含六个平码及一个特码，且七码不能重复');}
 if(d.zodiacs?.length){if(d.zodiacs.length!==7||d.zodiacs.some(z=>!animals.includes(z)||z.length!==1)||d.zodiacs[6]!==d.zodiac||d.numbers?.length!==7)throw Error('七码生肖需与开奖号码逐一对应');}
 if(d.drawDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(d.drawDate)||!Number.isFinite(Date.parse(d.drawDate))||new Date(d.drawDate).toISOString().slice(0,10)!==d.drawDate||Number(d.drawDate.slice(0,4))!==d.year))throw Error('开奖日期无效或年份不符');
 if(!(allowUnknownTime&&d.drawnAt===null)&&(!d.drawnAt||!Number.isFinite(Date.parse(d.drawnAt))))throw Error('必须提供真实开奖时间');
 return {...d,issue:String(+d.issue).padStart(3,'0')};
}
export function parseMacauSocket(message){
 if(!String(message).startsWith('am'))return null;
 const [codes,labels]=String(message).slice(2).split('|');const values=codes.split(','),names=(labels||'').split(',');
 if(values.length<13)throw Error('开奖推送格式不完整');
 const numbers=values.slice(1,8).map(Number);if(numbers.some(n=>!Number.isInteger(n)||n<1||n>49))throw Error('仍在开奖中，七码未完整公布');
 if(new Set(numbers).size!==7)throw Error('开奖推送含重复号码');
 const nextYear=Number(values[9].match(/^(\d{4})\//)?.[1]);if(!nextYear)throw Error('开奖推送缺少可确认的年份');
 const year=nextYear-(Number(values[8])<Number(values[0])?1:0);
 const zodiacs=names.slice(1,8).map(normalize);
 const draw=validateDraw({year,issue:values[0],number:numbers[6],zodiac:zodiacs[6]||null,element:null,drawnAt:null,numbers,zodiacs},true);
 return {...draw,numbers,nextIssue:values[8],nextDrawText:values[9],raw:message};
}
