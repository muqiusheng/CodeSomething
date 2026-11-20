package dev.codesomething;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class LearnerStatsApiTest extends CourseWorkspaceApiTest {
 @Test void statsCountRealRunsAndKeepPendingJobsOutOfTheSuccessRate()throws Exception{
  try(var app=start()){
   var empty=ok(request(app,"GET","/learner/stats?days=30",null));
   assertEquals(0,empty.path("runs").asInt());assertTrue(empty.path("runSuccessRate").isNull());assertEquals(30,empty.path("activity").size());
   var workspace=ok(request(app,"POST","/browser-workspaces",Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","run-server","clientKey","stats-test-workspace-12345678901234567890")));
   String id=workspace.path("id").asText(),token=workspace.path("token").asText();
   var source=ok(authorized(app,"POST","/submissions",Map.of("bindingId",id,"expectedDigest",workspace.path("digest").asText()),token));
   ok(authorized(app,"POST","/check-jobs",Map.of("submissionId",source.path("id").asText(),"idempotencyKey","stats-run"),token));
   var stats=ok(request(app,"GET","/learner/stats?days=30",null));
   assertEquals(1,stats.path("runs").asInt());assertEquals(1,stats.path("activeDays").asInt());assertTrue(stats.path("runSuccessRate").isNull());
   assertEquals(400,request(app,"GET","/learner/stats?days=3650",null).statusCode());
  }
 }
}
