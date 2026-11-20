import readline from 'node:readline';
const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line),ok=result=>send({id:m.id,result});
 if(m.method==='initialize')ok({});
 if(m.method==='account/read')ok({account:{type:'chatgpt'}});
 if(m.method==='model/list')ok({data:[{id:'test-model',isDefault:true}]});
 if(m.method==='config/read')ok({config:{mcp_servers:{}}});
 if(m.method==='thread/start')ok({thread:{id:'project-test'}});
 if(m.method==='turn/start'){
  ok({turn:{id:'plan-test'}});const prompt=m.params.input[0].text;
  const output=JSON.stringify({title:'图书阅读记录',resource:'books',itemTitle:'第一本书',scenario:'这是一个个人阅读记录接口项目。先按编号读取书籍记录，再处理列表与未知编号。新增记录时，在写入之前检查标题和布尔完成状态，使用不同状态码表达成功和失败。最后迁移到独立归档资源，验证两个集合互不影响。本课程使用内存集合保存数据，重启清空，通过请求、控制器、内存和响应的数据流帮助学员理解接口契约。'});
  setTimeout(()=>send({method:'item/agentMessage/delta',params:{threadId:'project-test',turnId:'plan-test',delta:prompt.includes('QUOTA')?'partial':prompt.includes('INVALID')?'invalid-json':output}}),50);
  if(prompt.includes('SLOW'))return;
  setTimeout(()=>send({method:'turn/completed',params:{threadId:'project-test',turn:{id:'plan-test',status:prompt.includes('QUOTA')?'failed':'completed',error:prompt.includes('QUOTA')?{codexErrorInfo:'usageLimitExceeded'}:undefined}}}),100);
 }
 if(m.method==='turn/interrupt'){ok({});send({method:'turn/completed',params:{threadId:'project-test',turn:{id:'plan-test',status:'interrupted'}}});}
});
