import json,time,uuid
from pathlib import Path
from urllib.request import Request,urlopen

base='http://127.0.0.1:5189/api/v1'
out=Path('new-system/docs/acceptance/learning-improvements/tutor-real.json')
results=[]
for course,version,stage,lesson,question in [
 ('http-json-basics','1.1.0','workspace','lesson-3','接口是什么？我在准备第一条数据这节，第一步应该写什么？'),
 ('sql-foundations','1.0.0','db-connect','lesson-1','SELECT 1 AS connected和DATABASE()分别说明什么？它们能证明我已经会独立设计数据库吗？'),
 ('boot-foundations','1.0.0','boot-jdbc','lesson-3','在当前JDBC章节里，路径里的编号怎么传到SQL的问号，再怎么变成JSON？')]:
 body=dict(courseId=course,courseVersion=version,stageId=stage,lessonId=lesson,learningStep='task',level='concept',question=question,includeLesson=True,idempotencyKey='improvement-'+str(uuid.uuid4()))
 request=Request(base+'/tutor/requests',json.dumps(body).encode(),{'Content-Type':'application/json'},method='POST')
 with urlopen(request,timeout=15) as r:result=json.load(r)
 deadline=time.monotonic()+160
 while result['status'] in ['queued','running','cancelling'] and time.monotonic()<deadline:
  time.sleep(1)
  with urlopen(base+'/tutor/requests/'+result['id'],timeout=15) as r:result=json.load(r)
 results.append(result);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 print(course,result['status'],flush=True)
 assert result['status']=='completed',result
 assert result['answer'],result
 if stage=='workspace':assert '不需要写服务器' not in result['answer'],result
