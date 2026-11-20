export function markdownBlocks(source){
 const blocks=[],lines=source.replaceAll('\r','').split('\n');let i=0;
 while(i<lines.length){
  if(!lines[i].trim()){i++;continue;}
  if(lines[i].startsWith('```')){const language=lines[i++].slice(3).trim(),body=[];while(i<lines.length&&!lines[i].startsWith('```'))body.push(lines[i++]);if(i<lines.length)i++;blocks.push({kind:'code',text:body.join('\n'),language});continue;}
  if(/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])){const items=[];while(i<lines.length&&/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]))items.push(lines[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/,''));blocks.push({kind:'list',items});continue;}
  const body=[];while(i<lines.length&&lines[i].trim()&&!lines[i].startsWith('```')&&!/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]))body.push(lines[i++].replace(/^#{1,6}\s+/,''));blocks.push({kind:'paragraph',text:body.join('\n')});
 }
 return blocks;
}
