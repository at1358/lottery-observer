import {groupedDisplayText} from './grouped-numbers.mjs';
import {sourceDefinitions} from './source-rules.mjs';
import {parsePrediction,splitPeriods} from './domain.mjs';
// Change the reading view only. Original text, timestamps and history remain intact.
export function collectedDisplayText(row){
 let text=groupedDisplayText(row),parsed;try{parsed=typeof row.parsed==='string'?JSON.parse(row.parsed):row.parsed;}catch{}
 if(parsed?.valid&&!(row.changed&2)){
  const definition=sourceDefinitions(text);
  if(definition.footerIndex!==null){const body=text.slice(0,definition.footerIndex).trimEnd(),value=parsePrediction(body,row.kind,row.name||'');if(splitPeriods(body).length===1&&value.valid&&value.values.length===parsed.values.length&&value.values.every(v=>parsed.values.includes(v)))text=body;}
 }
 return text.replace(/\n(?:[ \t]*\n){3,}/g,'\n\n').trim();
}
