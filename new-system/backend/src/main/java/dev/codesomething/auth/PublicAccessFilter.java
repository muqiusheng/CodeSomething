package dev.codesomething.auth;

import dev.codesomething.api.*;
import dev.codesomething.school.ExamCatalog;
import dev.codesomething.storage.LearningDataSource;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.Duration;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

@Component
@Order(-80)
class PublicAccessFilter extends OncePerRequestFilter {
    static final String PRINCIPAL = PublicAccessFilter.class.getName() + ".principal";
    private static final String AUTH_ROOT = "/api/v1/auth";
    private static final String AUTH = AUTH_ROOT + "/";
    private static final String ADMIN = "/api/v1/admin";
    private static final String WORKSPACE_HEADER = "X-CS-Workspace-Authorization";
    private static final Pattern EXAM_CHECK = Pattern.compile("/api/school/courses/([^/]+)/exams/(?:"
        + "[^/]+/(?:drafts|attempts)/[^/]+/questions|mistakes)/([^/]+)/check");
    private final AuthService auth;
    private final ExamCatalog exams;
    private final boolean enabled;
    private final boolean dockerOnly;
    private final boolean tutorEnabled;
    private final SlidingWindow logins = new SlidingWindow(5, Duration.ofMinutes(1));
    private final SlidingWindow registrations = new SlidingWindow(5, Duration.ofMinutes(1));
    private final SlidingWindow refreshes = new SlidingWindow(30, Duration.ofMinutes(1));
    private final SlidingWindow judgments = new SlidingWindow(10, Duration.ofMinutes(1));
    private final SlidingWindow objectiveChecks = new SlidingWindow(120, Duration.ofMinutes(1));
    private final SlidingWindow tutor = new SlidingWindow(15, Duration.ofHours(1));
    private final SlidingWindow environments = new SlidingWindow(20, Duration.ofMinutes(1));
    private final SlidingWindow blockedAudit = new SlidingWindow(5, Duration.ofMinutes(1));
    private final JsonMapper json = JsonMapper.builder().build();

    PublicAccessFilter(AuthService auth, ExamCatalog exams, @Value("${cs.public}") boolean enabled, @Value("${cs.runner.mode}") String runnerMode,
                       @Value("${cs.tutor.public-enabled:false}") boolean tutorEnabled) {
        this.auth = auth;
        this.exams = exams;
        this.enabled = enabled;
        dockerOnly = "docker_only".equals(runnerMode);
        this.tutorEnabled = tutorEnabled;
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!enabled && !dockerOnly) {
            chain.doFilter(request, response);
            return;
        }
        if (!path.startsWith("/api/")) {
            if (enabled) response.setStatus(404);
            else chain.doFilter(request, response);
            return;
        }
        try {
            if (!path.matches("/api(/[A-Za-z0-9_.-]+)+/?") || Arrays.stream(path.split("/")).anyMatch(Set.of(".", "..")::contains))
                throw ApiException.invalid("path", "接口路径无效。");
            if (path.endsWith("/")) path = path.substring(0, path.length() - 1);
            response.setHeader("Cache-Control", "no-store");
            String method = request.getMethod(), ip = request.getRemoteAddr();
            boolean post = "POST".equals(method);
            if ("GET".equals(method) && path.equals(AUTH + "session")) {
                chain.doFilter(request, response);
                return;
            }
            if (enabled && (path.equals("/api/v1/health") || path.equals(AUTH + "config")
                || post && Set.of(AUTH + "login", AUTH + "register", AUTH + "refresh").contains(path))) {
                if (post && path.equals(AUTH + "login")) limit(logins, ip);
                if (post && path.equals(AUTH + "register")) limit(registrations, ip);
                if (post && path.equals(AUTH + "refresh")) limit(refreshes, ip);
                chain.doFilter(request, response);
                return;
            }
            AuthService.Principal principal = enabled ? auth.authenticate(request.getHeader("Authorization")) : null;
            if (principal != null) {
                request.setAttribute(PRINCIPAL, principal);
                if (principal.user().passwordChangeRequired() && !Set.of(AUTH + "password", AUTH + "me", AUTH + "logout").contains(path))
                    throw denied("PASSWORD_CHANGE_REQUIRED", "请先修改临时密码。");
                if (under(path, ADMIN) && !principal.user().admin()) throw denied("ADMIN_REQUIRED", "此页面仅限管理员。");
                if (principal.user().admin() && !under(path, ADMIN) && !under(path, AUTH_ROOT))
                    throw denied("STUDENT_REQUIRED", "学习区仅限学员账号。");
            }
            if (dockerOnly && localPath(path)) {
                if (principal != null && blockedAudit.allow(principal.user().userId()))
                    auth.audit(principal.user().admin() ? principal.user().userId() : null, "local_execution_blocked",
                        "endpoint", path, principal.user().userId(), ip);
                throw denied("LOCAL_RUNNER_DISABLED", "隔离运行模式已停用服务端本机文件与IDE操作。");
            }
            if (principal == null) {
                if (enabled && (under(path, "/api/v1/interactive") || path.matches("/api/school/courses/[^/]+/(?:exams(?:/.*)?|environment/activity|labs/[^/]+/questions/[^/]+/tables)")
                    || path.equals("/api/v1/sql/environment/activity")))
                    throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "请登录学员账号后继续。", Map.of());
                chain.doFilter(request, response);
                return;
            }
            String id = principal.user().userId();
            if ((post && path.startsWith("/api/v1/sql/environment/")) ||
                path.matches("/api/school/courses/[^/]+/(databases|schema|labs/[^/]+/(?:reset|questions/[^/]+/tables))")
                || post && path.matches("/api/school/courses/[^/]+/exams/.+/debug")) limit(environments,id);
            if (post && (path.equals("/api/v1/check-jobs") || path.equals("/api/v1/sql/attempts")
                || path.matches("/api/v1/portfolio/[^/]+/checks")
                || path.matches("/api/v1/projects/courses/[^/]+/checks")
                || path.matches("/api/v1/projects/drafts/[^/]+/validate")
                || path.matches("/api/school/courses/[^/]+/labs/[^/]+/(?:run|grade)")
                || path.matches("/api/school/courses/[^/]+/exams/.+/submit"))) limit(judgments, id);
            if (post) {
                var check = EXAM_CHECK.matcher(path);
                if (check.matches())
                    limit(exams.requiresSqlCheck(check.group(1), check.group(2)) ? judgments : objectiveChecks, id);
            }
            if (post && (path.equals("/api/v1/tutor/requests") || path.equals("/api/v1/projects/drafts")
                || path.matches("/api/v1/projects/drafts/[^/]+/retry"))) {
                if (!tutorEnabled) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"TUTOR_UNAVAILABLE","公网 AI 辅导尚未配置。",Map.of());
                limit(tutor, id);
            }
            if (enabled && path.equals("/api/v1/tutor/connection") && post)
                throw denied("TUTOR_ADMIN_MANAGED", "公网导师连接由服务管理员配置。");
            auth.seen(id);
            try (var scope = LearningDataSource.asOwner(id)) {
                chain.doFilter(under(path, ADMIN) || under(path, AUTH_ROOT)
                    ? request : workspaceHeaders(request), response);
            }
        } catch (ApiException error) {
            if (response.isCommitted()) throw error;
            response.setStatus(error.status.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(json.writeValueAsString(new ApiErrors.ErrorBody(error.code, error.getMessage(),
                error.details, error.status == HttpStatus.TOO_MANY_REQUESTS, (String) request.getAttribute("requestId"))));
        }
    }

    private static boolean localPath(String path) {
        return under(path, "/api/v1/local-projects") || under(path, "/api/v1/local-ide")
            || under(path, "/api/v1/ide-handoffs") || path.equals("/api/v1/workspace-previews")
            || path.equals("/api/v1/workspace-bindings") || path.matches("/api/v1/portfolio/[^/]+/previews");
    }

    private static boolean under(String path, String prefix) { return path.equals(prefix) || path.startsWith(prefix + "/"); }

    private static void limit(SlidingWindow window, String key) {
        if (!window.allow(key)) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT", "操作频率过高，请稍后重试。", Map.of());
    }

    private static ApiException denied(String code, String message) {
        return new ApiException(HttpStatus.FORBIDDEN, code, message, Map.of());
    }

    private static HttpServletRequest workspaceHeaders(HttpServletRequest request) {
        return new HttpServletRequestWrapper(request) {
            @Override public String getHeader(String name) {
                return name.equalsIgnoreCase("Authorization") ? super.getHeader(WORKSPACE_HEADER) : super.getHeader(name);
            }
            @Override public Enumeration<String> getHeaders(String name) {
                return name.equalsIgnoreCase("Authorization") ? super.getHeaders(WORKSPACE_HEADER) : super.getHeaders(name);
            }
        };
    }
}
