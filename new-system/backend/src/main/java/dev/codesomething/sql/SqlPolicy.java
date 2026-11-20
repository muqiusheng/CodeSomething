package dev.codesomething.sql;

import dev.codesomething.api.ApiException;
import java.util.*;
import java.util.regex.Pattern;

/** Deliberately small lesson SQL dialect. Database grants remain the isolation boundary. */
public final class SqlPolicy {
    private SqlPolicy() {}
    private static final Set<String> WORDS=Set.of("select","as","connected","current_database","database","version","count","from","where","order","by","asc","desc","limit","offset","and","or","not","is","null","true","false","in","insert","into","values","update","set","delete","create","table","primary","key","int","integer","varchar","boolean","bool","tinyint","default","unsigned","tasks","bookmarks","id","title","completed","saved");
    public static void validate(String stage,String sql) {
        if(sql==null||sql.isBlank()||sql.length()>8192)throw ApiException.invalid("sql","请输入1—8192个字符的SQL。");
        StringBuilder stripped=new StringBuilder();boolean quoted=false;
        for(int i=0;i<sql.length();i++) {
            char c=sql.charAt(i);
            if(c=='\'') {
                if(quoted&&i+1<sql.length()&&sql.charAt(i+1)=='\''){stripped.append("  ");i++;continue;}
                quoted=!quoted;stripped.append(' ');continue;
            }
            if(c=='\\')throw ApiException.invalid("sql","请用两个单引号表示字符串中的单引号；不支持客户端命令与反斜杠转义。");
            if(quoted){stripped.append(c=='\n'?'\n':' ');continue;}
            if(!(c<128&&(Character.isLetterOrDigit(c)||Character.isWhitespace(c)||"_,;()=<>!+-*%".indexOf(c)>=0)))throw ApiException.invalid("sql","本课程只允许当前库中的tasks/bookmarks，不支持跨库、注释或外部文件访问。");
            stripped.append(Character.toLowerCase(c));
        }
        if(quoted)throw ApiException.invalid("sql","字符串单引号尚未闭合。");
        String cleaned=stripped.toString();
        if(cleaned.contains("--"))throw ApiException.invalid("sql","请去掉SQL注释后再运行。");
        var words=Pattern.compile("[a-z_][a-z0-9_]*").matcher(cleaned);
        while(words.find())if(!WORDS.contains(words.group())) {
            int line=1,column=1;
            for(int i=0;i<words.start();i++){if(sql.charAt(i)=='\n'){line++;column=1;}else column++;}
            String word=words.group();
            // Suggest only unambiguous common keyword typos. Never rewrite learner input.
            String suggestion=switch(word){case "selec","selct","slect"->"SELECT";case "form","frm"->"FROM";case "wher","wehre"->"WHERE";case "udpate","updat"->"UPDATE";case "inser","insret"->"INSERT";default->null;};
            throw ApiException.invalid("sql","第"+line+"行第"+column+"列：无法识别“"+sql.substring(words.start(),words.end())+"”。"+(suggestion!=null?"是否想写"+suggestion+"？请修改后重试。":"请核对拼写及本课允许的字段、表名和函数。"));
        }
        var statements=Arrays.stream(cleaned.split(";")).filter(s->!s.isBlank()).toList();
        if(statements.size()>12)throw ApiException.invalid("sql","一次最多12条语句。");
        for(String s:statements) {
            String first=s.stripLeading().split("\\s+")[0];
            if(!Set.of("select","insert","update","delete","create").contains(first))throw ApiException.invalid("sql","只允许查询、建表和数据增改删。");
            if(!first.equals("select")&&Pattern.compile("\\bselect\\b").matcher(s).find())throw ApiException.invalid("sql","本课写入与建表使用显式值和字段，不支持写入子查询或INSERT SELECT。");
            if(Set.of("db-connect","sql-read","sql-page").contains(stage)&&!first.equals("select"))throw ApiException.invalid("sql","本关只运行SELECT查询。");
            if(first.equals("create")&&!s.strip().matches("create\\s+table\\s+(tasks|bookmarks)\\s*\\([\\s\\S]*\\)"))throw ApiException.invalid("sql","只允许CREATE TABLE tasks或bookmarks及显式字段定义。");
        }
        if(statements.isEmpty())throw ApiException.invalid("sql","请输入SQL语句。");
    }
}
