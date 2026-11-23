package dev.codesomething.auth;

import dev.codesomething.api.ApiException;
import jakarta.servlet.http.*;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private static final String COOKIE = "__Secure-cs-refresh";
    private final AuthService auth;
    private final boolean enabled;
    private final boolean inviteRequired;

    AuthController(AuthService auth, @Value("${cs.public}") boolean enabled,
                   @Value("${cs.auth.require-invite}") boolean inviteRequired) {
        this.auth = auth;
        this.enabled = enabled;
        this.inviteRequired = inviteRequired;
    }

    record Login(String username, String password) {}
    record Registration(String username, String password, String email, String inviteCode) {}
    record PasswordChange(String currentPassword, String newPassword) {}
    record SessionResponse(String userId, String username, String email, String role, boolean passwordChangeRequired,
                           String token, int expiresIn) {}

    @GetMapping("/config")
    Map<String, Boolean> config() { return Map.of("enabled", enabled, "inviteRequired", enabled && inviteRequired); }

    @GetMapping("/session")
    ResponseEntity<Map<String, ?>> sessionStatus(@CookieValue(name = COOKIE, required = false) String refresh) {
        String role = enabled ? auth.sessionRole(refresh) : null;
        Map<String, ?> status = role == null ? Map.of("enabled", enabled) : Map.of("enabled", true, "role", role);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(status);
    }

    @PostMapping(value = "/login", consumes = MediaType.APPLICATION_JSON_VALUE)
    SessionResponse login(@RequestBody Login login, HttpServletRequest request, HttpServletResponse response) {
        requireEnabled();
        return session(auth.login(login.username(), login.password(), request.getRemoteAddr()), response);
    }

    @PostMapping(value = "/register", consumes = MediaType.APPLICATION_JSON_VALUE)
    SessionResponse register(@RequestBody Registration registration, HttpServletResponse response) {
        requireEnabled();
        return session(auth.register(registration.username(), registration.password(), registration.email(), registration.inviteCode()), response);
    }

    @PostMapping("/refresh")
    SessionResponse refresh(@CookieValue(name = COOKIE, required = false) String refresh, HttpServletResponse response) {
        requireEnabled();
        return session(auth.refresh(refresh), response);
    }

    @PostMapping("/logout")
    Map<String, Boolean> logout(HttpServletRequest request, HttpServletResponse response) {
        auth.logout(principal(request));
        cookie(response, "", 0);
        return Map.of("success", true);
    }

    @GetMapping("/me")
    AuthService.User me(HttpServletRequest request) { return principal(request).user(); }

    @PostMapping(value = "/password", consumes = MediaType.APPLICATION_JSON_VALUE)
    SessionResponse changePassword(@RequestBody PasswordChange change, HttpServletRequest request, HttpServletResponse response) {
        return session(auth.changePassword(principal(request), change.currentPassword(), change.newPassword(), request.getRemoteAddr()), response);
    }

    private static SessionResponse session(AuthService.Session session, HttpServletResponse response) {
        cookie(response, session.refreshToken(), AuthService.REFRESH_SECONDS);
        var user = session.user();
        return new SessionResponse(user.userId(), user.username(), user.email(), user.role(), user.passwordChangeRequired(), session.token(), AuthService.ACCESS_SECONDS);
    }

    private static void cookie(HttpServletResponse response, String value, int age) {
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(COOKIE, value)
            .httpOnly(true).secure(true).sameSite("Lax").path("/api/v1/auth").maxAge(Duration.ofSeconds(age)).build().toString());
    }

    private void requireEnabled() {
        if (!enabled) throw new ApiException(HttpStatus.NOT_FOUND, "AUTH_DISABLED", "此服务使用本机学习模式。", Map.of());
    }

    public static AuthService.Principal principal(HttpServletRequest request) {
        if (request.getAttribute(PublicAccessFilter.PRINCIPAL) instanceof AuthService.Principal principal) return principal;
        throw AuthService.unauthorized();
    }
}
