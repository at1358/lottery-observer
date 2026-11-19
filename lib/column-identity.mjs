// Only an explicit author field can discard the surrounding headline text.
// Keep legacy names intact rather than guessing an author from their wording.
export function explicitAuthorColumn(value){
 const text=String(value??''),columns=[...text.matchAll(/【([^【】\r\n]{1,60})】/gu)],authors=[...text.matchAll(/作者\s*[:：]\s*/gu)];
 if(columns.length!==1||authors.length!==1)return text;
 const column=columns[0],field=authors[0],start=field.index+field[0].length;
 const author=(column.index>=start?text.slice(start,column.index):column.index+column[0].length<=field.index?text.slice(start):'').trim();
 if(!author||author.length>40||/[\r\n【】]/u.test(author)||!column[1].trim())return text;
 return `${author}【${column[1].trim()}】`;
}
