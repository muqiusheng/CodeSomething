package dev.codesomething.profile;

import dev.codesomething.api.ApiException;
import java.time.*;
import java.util.*;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/learner/stats")
@DependsOn("flyway")
public class LearnerStatsController {
 private final JdbcTemplate jdbc;
 private static final ZoneId ZONE=ZoneId.of("Asia/Shanghai");
 public LearnerStatsController(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public record Day(String date,int count,int runs,int reviews,int completions){}
 public record Stats(int days,String timezone,int runs,int successfulRuns,int failedRuns,int environmentIssues,Integer runSuccessRate,int reviews,int correctReviews,int helpRequests,int activeDays,int longestStreak,List<Day> activity){}
 @GetMapping public Stats stats(@RequestParam(defaultValue="30") int days){
  if(!Set.of(7,30,90).contains(days))throw ApiException.invalid("days","请选择近7、30或90天。");
  LocalDate today=LocalDate.now(ZONE),first=today.minusDays(days-1);
  var events=jdbc.queryForList("SELECT 'run' AS kind,status,created_at AS at FROM check_jobs UNION ALL SELECT 'run',status,created_at FROM sql_attempts UNION ALL SELECT 'run',status,created_at FROM generated_attempts UNION ALL SELECT 'run',status,created_at FROM portfolio_checks UNION ALL SELECT 'review',CASE WHEN passed=1 THEN 'passed' ELSE 'failed' END,finished_at FROM learner_reviews WHERE status='completed' UNION ALL SELECT 'help','answered',created_at FROM tutor_requests WHERE length(answer)>0 UNION ALL SELECT 'completion','passed',completed_at FROM stage_completions UNION ALL SELECT 'completion','passed',completed_at FROM sql_completions UNION ALL SELECT 'completion','passed',completed_at FROM generated_completions");
  var calendar=new LinkedHashMap<LocalDate,int[]>();for(int i=0;i<days;i++)calendar.put(first.plusDays(i),new int[4]);
  int runs=0,success=0,failed=0,environment=0,reviews=0,correct=0,help=0;
  for(var event:events){
   LocalDate date=Instant.parse(event.get("at").toString()).atZone(ZONE).toLocalDate();var day=calendar.get(date);if(day==null)continue;
   String kind=event.get("kind").toString(),status=event.get("status").toString();day[0]++;
   if(kind.equals("run")){runs++;day[1]++;if(Set.of("passed","executed").contains(status))success++;else if(Set.of("compile_error","business_error","sql_error").contains(status))failed++;else if(Set.of("environment_error","cleanup_failed").contains(status))environment++;}
   if(kind.equals("review")){reviews++;day[2]++;if(status.equals("passed"))correct++;}
   if(kind.equals("completion"))day[3]++;
   if(kind.equals("help"))help++;
  }
  int active=0,streak=0,longest=0;var activity=new ArrayList<Day>();
  for(var entry:calendar.entrySet()){var day=entry.getValue();if(day[0]>0){active++;streak++;longest=Math.max(longest,streak);}else streak=0;activity.add(new Day(entry.getKey().toString(),day[0],day[1],day[2],day[3]));}
  return new Stats(days,ZONE.getId(),runs,success,failed,environment,success+failed==0?null:(int)Math.round(success*100.0/(success+failed)),reviews,correct,help,active,longest,activity);
 }
}
