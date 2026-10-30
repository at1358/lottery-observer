import {load} from 'cheerio/slim';
import {normalize,validateDraw} from './domain.mjs';
export const DEFAULT_HISTORY={url:'https://2026kj.zkclhb.com:2026/am.html',year:2026,enabled:true};
export function parseHistory(html,expectedYear){
 const $=load(html);$('script,style').remove();const rows=[];const seen=new Set();
 $('#msg li').each((_,el)=>{
  const item=$(el),heading=normalize(item.find('dt').text());
  const issue=heading.match(/(\d{1,3})\s*期/)?.[1],date=heading.match(/(20\d{2}-\d{2}-\d{2})/)?.[1];
  if(!issue&&!date)return;
  if(!issue||!date)throw Error('历史开奖记录缺少期数或开奖日期');
  const year=Number(date.slice(0,4));if(year!==Number(expectedYear))throw Error('历史开奖年份与所选年份不符');
  const numbers=item.find('div.ball p span').toArray().map(el=>Number($(el).text().trim()));
  const zodiacs=item.find('div.ball p b').toArray().map(el=>normalize($(el).text().trim()));
  const d=validateDraw({year,issue,number:numbers[6],zodiac:zodiacs[6],numbers,zodiacs,drawDate:date,drawnAt:null},true);
  if(seen.has(d.issue))throw Error('历史页面含重复期数，已停止写入');seen.add(d.issue);rows.push(d);
 });
 if(!rows.length)throw Error('未找到历史开奖记录，网站可能已改变结构或限制访问');
 if(rows.length>366)throw Error('单年度历史记录超过 366 期');
 return rows.sort((a,b)=>Number(b.issue)-Number(a.issue));
}
export function historyUrl(config,year){
 if(!Number.isInteger(Number(year))||year<2000||year>2100)throw Error('请选择有效的历史年份');
 const u=new URL(config.url);if(Number(year)!==Number(config.year||2026))u.pathname=u.pathname.replace(/[^/]+$/,year+'.html');
 return u.href;
}
