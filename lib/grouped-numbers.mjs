// A 主攻N码 article prints two independent N-number recommendations. Keep the
// labels and validate each group before using their union in number calculations.
export function groupedNumbers(text,title,expected){
 if(!expected||!new RegExp('主攻\\s*'+expected+'\\s*码').test(title)||!/(?:^|\n)\s*[主攻]\s*[:：]/.test(text))return null;
 const rows=[...text.matchAll(/(?:^|\n)[ \t]*([主攻])[ \t]*[:：][ \t]*([^\n]*)/g)],groups=[],warnings=[];
 const rest=text.replace(/(?:^|\n)[ \t]*[主攻][ \t]*[:：][^\n]*/g,'\n');
 if(/\d+(?:[.。．,，、\t -]+\d+){2,}/.test(rest))warnings.push('主攻分组以外还有号码，需核对完整正文');
 if(rows.length!==2||new Set(rows.map(m=>m[1])).size!==2)warnings.push('主攻分组须同时包含唯一的“主”和“攻”两组');
 for(const row of rows){
  const body=row[2].trim(),tokens=body.match(/\d+/g)||[],numbers=tokens.map(Number);
  if(!/^\d{1,2}(?:[.。．,，、 \t]+\d{1,2})*$/.test(body)||numbers.length!==expected||new Set(numbers).size!==expected||numbers.some(n=>n<1||n>49))warnings.push(`${row[1]}组须完整包含 ${expected} 个不同的01–49号码`);
  groups.push({label:row[1],numbers});
 }
 return {values:[...new Set(groups.flatMap(g=>g.numbers).filter(n=>n>=1&&n<=49))],numberGroups:groups,warnings};
}

// A compact reading of a legacy archive can omit only material after both
// original groups. The full original remains available in the detail view.
export function groupedDisplayText(row){
 const raw=row.raw||'';let parsed;try{parsed=typeof row.parsed==='string'?JSON.parse(row.parsed):row.parsed;}catch{return raw;}
 if(!parsed?.valid||parsed.numberGroups?.length!==2||(row.changed&2))return raw;
 const lines=raw.split('\n'),at=lines.findIndex(line=>/^\s*\d{1,3}\s*期/.test(line));if(at<0)return raw;
 const selected=[lines[at].trimStart()];
 for(const group of parsed.numberGroups){const line=lines.find(line=>new RegExp('^\\s*'+group.label+'\\s*[:：]').test(line)),numbers=line?.split(/[:：]/).slice(1).join(':').match(/\d+/g)?.map(Number);if(!line||JSON.stringify(numbers)!==JSON.stringify(group.numbers))return raw;selected.push(line);}
 return selected.join('\n');
}
