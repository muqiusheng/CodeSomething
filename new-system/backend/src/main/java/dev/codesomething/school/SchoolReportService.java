package dev.codesomething.school;

import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

@Service
public class SchoolReportService {
    String markdown(SchoolCourseCatalog.Course course, SchoolCourseCatalog.LabOutline outline,
                    SchoolCourseCatalog.Lab lab, SchoolDraftStore.Draft work) {
        var body = new StringBuilder("# ").append(outline.title()).append("\n\n")
            .append(course.title()).append("\n\n## 实验目的\n\n").append(lab.objective()).append("\n\n## 实验内容与结果\n\n")
            .append(lab.requirements()).append("\n");
        for (var question:lab.questions()) {
            body.append("\n### ").append(question.title()).append("\n\n")
                .append(question.originalText()==null?question.requirement():question.originalText()).append("\n\n");
            String sql=work.drafts().get(question.id());
            if(sql==null) continue;
            codeBlock(body,"sql",sql);
            var execution=work.executions().get(question.id());
            if(execution==null || !sql.equals(execution.sql())) continue;
            var result=execution.result();
            body.append("\n").append(result.status().equals("ok")?"执行成功":"执行反馈").append(" · ")
                .append(result.elapsedMs()).append(" ms\n\n");
            if(result.message()!=null) codeBlock(body,"text",result.message());
            for(var table:result.tables()) {
                var lines=new java.util.ArrayList<String>();
                lines.add(String.join("\t",table.columns()));
                for(var row:table.rows()) lines.add(row.stream().map(value->value==null?"NULL":value).collect(java.util.stream.Collectors.joining("\t")));
                codeBlock(body,"text",String.join("\n",lines));
            }
        }
        return body.toString();
    }

    private static void codeBlock(StringBuilder body,String language,String content) {
        int length=3;
        var runs=java.util.regex.Pattern.compile("`+").matcher(content);
        while(runs.find()) length=Math.max(length,runs.group().length()+1);
        String fence="`".repeat(length);
        body.append(fence).append(language).append("\n").append(content).append("\n").append(fence).append("\n\n");
    }
    String render(SchoolCourseCatalog.Course course, SchoolCourseCatalog.LabOutline outline,
                  SchoolCourseCatalog.Lab lab, SchoolDraftStore.Draft work, SchoolStudent.Identity student) {
        var html = new StringBuilder("""
            <!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>实验报告</title>
            <style>
            @page {size: 21cm 29.7cm; margin: 1.8cm 1.8cm 1.7cm}
            body {margin: 1.8cm; font-family: "Times New Roman", SimSun, serif; font-size: 10.5pt; line-height: 1.3; color: #202124; background: white}
            h1,h2,h3 {font-family: SimHei,sans-serif; page-break-after: avoid}
            h1 {font-size: 18pt; text-align:center; margin: 0 0 14pt}
            .institution {font-family: SimHei,sans-serif; font-size:14pt; text-align:center}
            h2 {font-size: 14pt; margin: 12pt 0 4pt}
            h3 {font-size: 12pt; margin: 9pt 0 3pt}
            p {margin: 3pt 0 5pt; overflow-wrap: anywhere}
            pre {font-family: Consolas,monospace; white-space: pre-wrap; overflow-wrap: anywhere; background:#f4f5f8; padding: 6pt}
            table {width:100%; border-collapse: collapse; margin: 4pt 0 8pt; table-layout: fixed}
            th,td {border:1px solid #a5a8b0; text-align:left; padding: 3pt 5pt; overflow-wrap: anywhere}
            th {background:#eef0f5} tr {page-break-inside:avoid}
            </style></head><body><p class="institution">
            """);
        html.append(escape(course.school())).append("</p><h1>实验报告</h1><p>课程名称　").append(escape(course.title()))
            .append("</p><p>实验项目　").append(escape(outline.title())).append("</p><p>学号　")
            .append(escape(student.number())).append("　姓名　").append(escape(student.name()))
            .append("　专业　").append(escape(course.major())).append("</p><h2>一、实验目的</h2><p>")
            .append(escape(lab.objective())).append("</p><h2>二、实验内容与结果</h2><p>")
            .append(escape(lab.requirements())).append("</p>");
        int index = 0;
        for (var question : lab.questions()) {
            html.append("<h3>").append(++index).append(". ").append(escape(question.title())).append("</h3><p>")
                .append(escape(question.originalText() == null ? question.requirement() : question.originalText())
                    .replace("\n", "<br>")).append("</p>");
            var sql = work.drafts().get(question.id());
            var execution = work.executions().get(question.id());
            if (sql == null) {
                html.append("<p>待作答</p>");
                continue;
            }
            html.append("<pre>").append(escape(sql)).append("</pre>");
            if (execution == null || !sql.equals(execution.sql())) {
                html.append("<p>当前作答没有运行记录。</p>");
                continue;
            }
            var result = execution.result();
            html.append("<p>").append(result.status().equals("ok") ? "执行成功" : "执行反馈")
                .append(" · ").append(result.elapsedMs()).append(" ms");
            if (result.affectedRows() != null) html.append(" · 末条语句影响 ").append(result.affectedRows()).append(" 行");
            html.append("</p>");
            if (result.message() != null) html.append("<p>").append(escape(result.message())).append("</p>");
            for (var table : result.tables()) {
                if (table.rows().isEmpty()) { html.append("<p>结果为 0 行。</p>"); continue; }
                html.append("<table><thead><tr>");
                table.columns().forEach(column -> html.append("<th>").append(escape(column)).append("</th>"));
                html.append("</tr></thead><tbody>");
                for (var row : table.rows()) {
                    html.append("<tr>");
                    row.forEach(cell -> html.append("<td>").append(cell == null ? "NULL" : escape(cell)).append("</td>"));
                    html.append("</tr>");
                }
                html.append("</tbody></table>");
            }
        }
        return html.append("</body></html>").toString();
    }

    private static String escape(String text) {
        return HtmlUtils.htmlEscape(text, "UTF-8");
    }
}
