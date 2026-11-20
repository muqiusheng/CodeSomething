package dev.codesomething.tutor;
import java.util.List;
import dev.codesomething.api.ApiException;

/** Active teaching support overlay 2026-11-18.1; historical course bytes stay intact. */
final class TeachingContext {
 static final List<String> HTTP_START=List.of("认识工程入口","注册请求路径","准备第一条数据","把文字变成字节","发送并关闭响应");
 static String action(String course,String stage,String lesson){
  if(lesson!=null&&!lesson.matches("lesson-[1-9][0-9]?"))throw ApiException.invalid("lessonId","小节标识无效，请重新进入当前章节。");
  String common="继续同一个本地工程；网页连接原文件，保存后检查，报告对应提交快照。概念题可选，功能通过不等于独立掌握。";
  if("http-json-basics".equals(course)&&"workspace".equals(stage)){
   int n=lesson==null?0:Integer.parseInt(lesson.substring(7))-1;
   if(n>=HTTP_START.size())throw ApiException.invalid("lessonId","此章没有该小节。");
   return "本章需要亲手编写任务接口响应。当前小节："+HTTP_START.get(n)+"。先解释地址、请求、JSON与响应，再添加createContext、body、UTF-8字节及响应输出。"+common;
  }
  return "按当前章节目标增量实现功能。"+(lesson==null?"":"当前动手小节为"+lesson+"。")+common;
 }
}
