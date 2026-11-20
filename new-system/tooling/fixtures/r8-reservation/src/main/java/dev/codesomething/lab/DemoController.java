package dev.codesomething.lab;
import org.springframework.web.bind.annotation.*;
@RestController
public class DemoController {
 @GetMapping(value="/",produces="text/html;charset=UTF-8") public String demo(){return """
 <!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>设备借用</title>
 <style>body{font:16px system-ui;max-width:700px;margin:40px auto;padding:16px}label{display:block;margin:16px 0}button,input{font:inherit;padding:10px}pre{white-space:pre-wrap}button{cursor:pointer}</style>
 <h1>摄影设备借用</h1><form id="login"><label>账号<input name="username" value="alice" required></label><label>密码<input name="password" type="password" required></label><button>登录</button></form>
 <button id="refresh">刷新资源与我的预约</button><pre id="resources"></pre><form id="reserve"><label>资源ID<input name="resourceId" type="number" min="1" required></label><label>数量<input name="quantity" type="number" min="1" required></label><button>预约</button></form>
 <form id="cancel"><label>要取消的预约ID<input name="id" type="number" min="1" required></label><button>取消预约</button></form><pre id="mine"></pre><p role="status" id="status"></p>
 <script>
 let token='';const $=id=>document.getElementById(id);async function call(path,method='GET',body){const r=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});const v=r.status===204?null:await r.json();if(!r.ok)throw Error(v.message);return v}
 async function refresh(){try{$('resources').textContent=JSON.stringify(await call('resources'),null,2);$('mine').textContent=JSON.stringify(await call('reservations'),null,2);$('status').textContent='已刷新'}catch(e){$('status').textContent=e.message}}
 $('login').onsubmit=async e=>{e.preventDefault();token='';$('mine').textContent='';$('resources').textContent='';try{const v=await call('auth/login','POST',Object.fromEntries(new FormData(e.target)));token=v.token;await refresh()}catch(e){$('status').textContent=e.message}};
 $('reserve').onsubmit=async e=>{e.preventDefault();try{const v=Object.fromEntries(new FormData(e.target));await call('reservations','POST',{resourceId:Number(v.resourceId),quantity:Number(v.quantity)});await refresh()}catch(e){$('status').textContent=e.message}};
 $('cancel').onsubmit=async e=>{e.preventDefault();try{await call('reservations/'+new FormData(e.target).get('id'),'DELETE');await refresh()}catch(e){$('status').textContent=e.message}};$('refresh').onclick=refresh;
 </script></html>
 """;}
}
