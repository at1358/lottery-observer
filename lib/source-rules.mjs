// Accept only an explicit, complete partition printed in the source article.
// Do not assume that different websites use the same segment boundaries.
export function sourceSegmentRules(text){
 const matches=[...String(text).matchAll(/(?:^|\n)[ \t]*([1-7])[ \t]*段[ \t]*(?:--+|[:：])[ \t]*([^\r\n]+)/g)];
 if(matches.length!==7||new Set(matches.map(m=>m[1])).size!==7)return null;
 const segments={};for(const match of matches){if(!/^\s*\d{1,2}(?:[.。．,，、 \t]+\d{1,2})*\s*$/.test(match[2]))return null;const values=match[2].match(/\d+/g)||[];if(!values.length)return null;for(const value of values){const n=Number(value);if(n<1||n>49||segments[n]!==undefined)return null;segments[n]=Number(match[1]);}}
 if(Object.keys(segments).length!==49)return null;
 return {rules:{segments},footerIndex:matches[0].index};
}
