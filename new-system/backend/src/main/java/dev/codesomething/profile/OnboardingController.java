package dev.codesomething.profile;

import dev.codesomething.api.ApiException;
import dev.codesomething.storage.LearningDataSource;
import java.time.Instant;
import java.util.regex.Pattern;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v1/onboarding")
@DependsOn("flyway")
public class OnboardingController {
    private static final Pattern VERSION=Pattern.compile("(?:0|[1-9][0-9]{0,8})(?:\\.(?:0|[1-9][0-9]{0,8})){0,5}");
    private final LearningDataSource storage;

    public OnboardingController(LearningDataSource storage) { this.storage=storage; }

    public record Progress(int homeTourVersion,int workbenchTourVersion,String lastSeenChangelog,String updatedAt) {}

    @GetMapping
    public Progress read() { return read(storage.learning(LearningDataSource.owner())); }

    @PatchMapping(consumes="application/json")
    public Progress update(@RequestBody JsonNode patch) {
        if (!patch.isObject()) throw ApiException.invalid("onboarding","请提供导览进度对象。");
        for (String field:patch.propertyNames()) {
            if (!field.equals("homeTourVersion") && !field.equals("workbenchTourVersion") && !field.equals("lastSeenChangelog"))
                throw ApiException.invalid(field,"未知的导览字段。");
        }
        int home=tourVersion(patch,"homeTourVersion"), workbench=tourVersion(patch,"workbenchTourVersion");
        var changelog=patch.path("lastSeenChangelog");
        if (!changelog.isMissingNode() && (!changelog.isString() || changelog.asText().length()>64
            || !VERSION.matcher(changelog.asText()).matches()))
            throw ApiException.invalid("lastSeenChangelog","更新版本应由数字和点组成。");

        return storage.inLearningTransaction(LearningDataSource.owner(),tx -> {
            var previous=read(tx);
            var nextHome=Math.max(previous.homeTourVersion(),home);
            var nextWorkbench=Math.max(previous.workbenchTourVersion(),workbench);
            var nextChangelog=newer(previous.lastSeenChangelog(),changelog.asText(""));
            if (nextHome==previous.homeTourVersion() && nextWorkbench==previous.workbenchTourVersion()
                && nextChangelog.equals(previous.lastSeenChangelog())) return previous;
            String updated=Instant.now().toString();
            tx.update("""
                UPDATE learner_onboarding SET home_tour_version=?,workbench_tour_version=?,last_seen_changelog=?,updated_at=?
                WHERE id='local'
                """,nextHome,nextWorkbench,nextChangelog,updated);
            return new Progress(nextHome,nextWorkbench,nextChangelog,updated);
        });
    }

    private static Progress read(JdbcTemplate jdbc) {
        return jdbc.queryForObject("""
            SELECT home_tour_version,workbench_tour_version,last_seen_changelog,updated_at FROM learner_onboarding WHERE id='local'
            """,(row,n)->new Progress(row.getInt(1),row.getInt(2),row.getString(3),row.getString(4)));
    }

    private static int tourVersion(JsonNode patch,String field) {
        var value=patch.path(field);
        if (value.isMissingNode()) return 0;
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue()<0 || value.intValue()>1000)
            throw ApiException.invalid(field,"导览版本须为 0 到 1000 的整数。");
        return value.intValue();
    }

    private static String newer(String saved,String incoming) {
        if (incoming.isEmpty()) return saved;
        if (saved.isEmpty()) return incoming;
        String[] a=saved.split("\\."),b=incoming.split("\\.");
        for (int i=0;i<Math.max(a.length,b.length);i++) {
            int x=i<a.length?Integer.parseInt(a[i]):0,y=i<b.length?Integer.parseInt(b[i]):0;
            if (x!=y) return x>y?saved:incoming;
        }
        return saved;
    }
}
