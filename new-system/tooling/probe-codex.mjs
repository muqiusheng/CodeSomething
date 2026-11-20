import {spawn} from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Product integration smoke test. No tokens or account identifiers are logged.
const systemRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const probeDirectory=path.join(systemRoot,'runtime','ai-probe');
const evidenceDirectory=path.join(systemRoot,'docs','acceptance','R1');
fs.mkdirSync(probeDirectory,{recursive:true}); fs.mkdirSync(evidenceDirectory,{recursive:true});
const report={date:new Date().toISOString(),transport:'official codex app-server stdio',checks:[],limitations:['No quota exhaustion was induced.','This probe does not connect the web tutor.']};

class AppServer {
  constructor(){
    this.nextId=0;this.pending=new Map();this.events=[];this.listeners=[];
    this.process=spawn(process.env.CS_CODEX_BIN||'codex',['app-server','--listen','stdio://','-c','features.multi_agent=false'],{cwd:probeDirectory,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.process.stderr.on('data',()=>{});
    this.reader=readline.createInterface({input:this.process.stdout});
    this.reader.on('line',line=>{let message;try{message=JSON.parse(line);}catch{return;}
      if(message.id!==undefined&&this.pending.has(message.id)){const {resolve,reject,timer}=this.pending.get(message.id);clearTimeout(timer);this.pending.delete(message.id);message.error?reject(new Error(message.error.message)):resolve(message.result);}
      else if(message.method){
        // Never execute tool/approval requests received during a tutoring probe.
        if(message.id!==undefined){this.send({id:message.id,error:{code:-32601,message:'Tools are unavailable in this probe'}});return;}
        this.events.push(message);for(const listener of [...this.listeners])listener(message);
      }
    });
    this.process.on('error',error=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();});
  }
  send(message){this.process.stdin.write(JSON.stringify(message)+'\n');}
  rpc(method,params={}){const id=++this.nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Timed out: ${method}`));},45000);this.pending.set(id,{resolve,reject,timer});this.send({id,method,params});});}
  event(method,predicate=()=>true){const existing=this.events.find(e=>e.method===method&&predicate(e.params));if(existing)return Promise.resolve(existing.params);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.listeners=this.listeners.filter(l=>l!==listener);reject(new Error(`Timed out event: ${method}`));},60000);const listener=message=>{if(message.method===method&&predicate(message.params)){clearTimeout(timer);this.listeners=this.listeners.filter(l=>l!==listener);resolve(message.params);}};this.listeners.push(listener);});}
  async initialize(){const result=await this.rpc('initialize',{clientInfo:{name:'codesomething_r1_probe',title:'CodeSomething local feasibility probe',version:'0.1.0'},capabilities:{experimentalApi:true}});this.send({method:'initialized'});return result;}
  async tutorThread(model){return this.rpc('thread/start',{model,cwd:probeDirectory,approvalPolicy:'never',sandbox:'read-only',ephemeral:true,developerInstructions:'You are a Java tutor in a connection test. Answer only the current user message. Never access files, invoke tools, run commands, or delegate. No project work is requested.'});}
  close(){this.reader.close();this.process.stdin.end();this.process.kill();}
}

let server;
try{
  server=new AppServer();await server.initialize();report.checks.push({name:'initialize',status:'passed'});
  const account=await server.rpc('account/read',{refreshToken:false});
  report.account={type:account.account?.type||null,planType:account.account?.planType||null};
  if(account.account?.type!=='chatgpt')throw new Error('The official local account is not authenticated with ChatGPT.');
  const catalog=await server.rpc('model/list',{limit:30});
  const model=(catalog.data.find(m=>m.isDefault)||catalog.data[0])?.id;
  if(!model)throw new Error('No model returned by the official app server.');report.model=model;
  const quota=await server.rpc('account/rateLimits/read');
  report.checks.push({name:'rate-limit-read',status:'passed',buckets:Object.keys(quota.rateLimitsByLimitId||{})});
  const thread=await server.tutorThread(model);const threadId=thread.thread.id;
  const turn=await server.rpc('turn/start',{threadId,input:[{type:'text',text:'请只用一句中文解释：JSON中的false为什么不加双引号？'}],effort:'low'});
  const completed=await server.event('turn/completed',e=>e.turn.id===turn.turn.id);
  const messages=server.events.filter(e=>e.method==='item/completed'&&e.params.item?.type==='agentMessage').map(e=>e.params.item.text);
  report.checks.push({name:'real-tutor-response',status:completed.turn.status,text:messages.join('\n')});
  if(completed.turn.status!=='completed')throw new Error(`Tutor inference ended with status ${completed.turn.status}`);
  const cancellable=await server.rpc('turn/start',{threadId,input:[{type:'text',text:'请详细列举二十个JSON类型练习，每个练习给出解释。'}],effort:'low'});
  await server.rpc('turn/interrupt',{threadId,turnId:cancellable.turn.id});
  const interrupted=await server.event('turn/completed',e=>e.turn.id===cancellable.turn.id);
  report.checks.push({name:'interrupt',status:interrupted.turn.status});
  server.close();server=new AppServer();await server.initialize();
  const reconnected=await server.rpc('account/read',{refreshToken:false});
  report.checks.push({name:'process-reconnect-auth',status:reconnected.account?.type==='chatgpt'?'passed':'failed'});
  report.result='real-response-verified';
}catch(error){report.result='blocked';report.error=String(error.message||error);}finally{
  server?.close();fs.writeFileSync(path.join(evidenceDirectory,'gpt-probe.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
