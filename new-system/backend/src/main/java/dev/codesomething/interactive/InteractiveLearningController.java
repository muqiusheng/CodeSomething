package dev.codesomething.interactive;

import dev.codesomething.api.ApiException;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/interactive")
public class InteractiveLearningController {
    private final InteractiveLearningStore store;

    InteractiveLearningController(InteractiveLearningStore store) { this.store = store; }

    public record Placement(Map<String,String> background, String goal, List<Boolean> results, String mode) {}
    public record Mode(String mode) {}
    public record ProgressCommand(Integer revision, String action, Integer step, Boolean passed, Integer misses, Integer hints) {}
    public record Challenge(List<String> answers) {}

    @GetMapping("/state")
    public InteractiveLearningStore.State state() { return store.state(); }

    @PutMapping("/onboarding")
    public InteractiveLearningStore.State onboard(@RequestBody Placement input) {
        return store.onboard(input);
    }

    @PatchMapping("/unlock-mode")
    public InteractiveLearningStore.State mode(@RequestBody Mode input) { return store.mode(input.mode()); }

    @PostMapping("/lessons/{lessonId}/progress")
    public InteractiveLearningStore.State progress(@PathVariable String lessonId,@RequestBody ProgressCommand input) {
        return store.progress(lessonId,input);
    }

    @PostMapping("/modules/{moduleId}/skip-unlock")
    public InteractiveLearningStore.State skip(@PathVariable String moduleId,@RequestBody Challenge input) {
        if (input.answers()==null) throw ApiException.invalid("answers","请提交三道挑战题的答案。");
        return store.skip(moduleId,input.answers());
    }
}
