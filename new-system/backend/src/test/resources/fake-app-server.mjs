import readline from 'node:readline';
const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line),ok=result=>send({id:m.id,result});
 if(m.method==='initialize')ok({});
 if(m.method==='account/read')ok({account:{type:'chatgpt'}});
 if(m.method==='model/list')ok({data:[{id:'test-model',isDefault:true}]});
 if(m.method==='config/read')ok({config:{mcp_servers:{}}});
 if(m.method==='thread/start')ok({thread:{id:'thread-test'}});
 if(m.method==='turn/start'){
  ok({turn:{id:'turn-test'}});
  if(m.params.input[0].text.includes('AUDIT')){
   setTimeout(()=>send({method:'item/agentMessage/delta',params:{threadId:'thread-test',turnId:'turn-test',delta:m.params.input[0].text}}),80);
   setTimeout(()=>send({method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}}),150);return;
  }
  setTimeout(()=>send({method:'item/agentMessage/delta',params:{threadId:'thread-test',turnId:'turn-test',delta:'false是'}}),80);
  if(m.params.input[0].text.includes('QUOTA')){
   setTimeout(()=>send({method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'failed',error:{codexErrorInfo:'usageLimitExceeded',message:'usage limit reached'}}}}),150);return;
  }
  const slow=m.params.input[0].text.includes('SLOW');
  setTimeout(()=>send({method:'item/agentMessage/delta',params:{threadId:'thread-test',turnId:'turn-test',delta:'布尔值。'}}),slow?5000:180);
  setTimeout(()=>send({method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}}),slow?5500:300);
 }
 if(m.method==='turn/interrupt'){ok({});send({method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'interrupted'}}});}
});
