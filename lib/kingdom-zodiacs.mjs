const animals='鼠牛虎兔龙蛇马羊猴鸡狗猪';
export const KINGDOM_PARSER_VERSION='kingdom-zodiac-v1';
export function parseKingdomZodiacs(raw){
 const text=String(raw).normalize('NFKC').replace(/吳/g,'吴').replace(/國/g,'国').replace(/龍/g,'龙').replace(/雞/g,'鸡').replace(/豬/g,'猪');
 // 当期推荐有“国”字；页尾“吴:虎兔龙蛇”等四肖对照不参与推荐。
 const matches=[...text.matchAll(/(吴|蜀|魏)国\s*[:：]\s*([^\r\n]*?)(?=(?:吴|蜀|魏)国\s*[:：]|\r?\n|$)/g)],warnings=[],zodiacGroups=[];
 for(const label of ['吴国','蜀国','魏国']){
  const rows=matches.filter(m=>m[1]+'国'===label);if(rows.length!==1){warnings.push(label+(rows.length?'重复，需确认原文':'缺少当期推荐'));continue;}
  const body=rows[0][2],tokens=body.match(new RegExp('['+animals+']','g'))||[],values=[...new Set(tokens)];
  if(tokens.length!==3||values.length!==3)warnings.push(label+'需要3个不同的生肖');
  const unknown=body.replace(new RegExp('['+animals+']','g'),'').replace(/[\s、,，.。;；|/【】\[\]()（）:：-]/g,'');
  if(unknown)warnings.push(label+'含未识别内容：'+unknown.slice(0,20));
  zodiacGroups.push({label,values});
 }
 const values=[...new Set(zodiacGroups.flatMap(group=>group.values))];
 if(zodiacGroups.length===3&&values.length!==9)warnings.push('三国推荐应合计9个不同的生肖');
 return {values,zodiacGroups,warnings,valid:warnings.length===0,parserVersion:KINGDOM_PARSER_VERSION};
}
