package dev.codesomething.auth;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jwt.*;
import dev.codesomething.api.ApiException;
import dev.codesomething.storage.LearningDataSource;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@DependsOn("flyway")
public class AuthService {
    public static final String ADMIN = "ROLE_ADMIN";
    public static final String STUDENT = "ROLE_STUDENT";
    static final int ACCESS_SECONDS = 7200;
    static final int REFRESH_SECONDS = 14 * 86400;
    private static final String ISSUER = "codesomething";
    private static final SecureRandom RANDOM = new SecureRandom();

    public record User(String userId, String username, String email, String role, boolean passwordChangeRequired) {
        public boolean admin() { return ADMIN.equals(role); }
    }
    record Account(User user, String hash, String status, int failures, long lockedUntil) {}
    record Session(User user, String token, String refreshToken) {}
    public record Principal(User user, String sessionId) {}

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final byte[] signingKey;
    private final String dummyHash;
    private final boolean inviteRequired;

    public AuthService(LearningDataSource storage,
                       @Value("${cs.public}") boolean publicMode,
                       @Value("${cs.runner.mode}") String runnerMode,
                       @Value("${cs.auth.initial-password}") String initialPassword,
                       @Value("${cs.auth.jwt-secret}") String secret,
                       @Value("${cs.auth.require-invite}") boolean inviteRequired) {
        jdbc = new JdbcTemplate(storage.primary());
        transactions = new TransactionTemplate(new JdbcTransactionManager(storage.primary()));
        this.inviteRequired = inviteRequired;
        if (!publicMode) {
            if (jdbc.queryForObject("SELECT count(*) FROM users", Integer.class) != 0)
                throw new IllegalStateException("This database requires CS_PUBLIC=true");
            signingKey = null;
            dummyHash = null;
            return;
        }
        if (!"docker_only".equals(runnerMode)) throw new IllegalStateException("CS_PUBLIC requires CS_RUNNER_MODE=docker_only");
        signingKey = decodeSigningKey(secret);
        dummyHash = passwords.encode(randomToken());
        if (account("id", "admin") == null) {
            validatePassword(initialPassword);
            String now = Instant.now().toString();
            jdbc.update("""
                INSERT INTO users(id,username,password_hash,role,status,created_at,updated_at)
                VALUES('admin','admin',?,?,'active',?,?)
                """, passwords.encode(initialPassword), ADMIN, now, now);
        }
        jdbc.update("DELETE FROM user_tokens WHERE expires_at <= ?", now());
    }

    private static byte[] decodeSigningKey(String secret) {
        String requirement = "CS_JWT_SECRET requires at least 32 random bytes, Base64 encoded";
        byte[] key;
        try {
            key = Base64.getDecoder().decode(secret);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException(requirement);
        }
        var distinct = new BitSet(256);
        for (byte value : key) distinct.set(Byte.toUnsignedInt(value));
        if (key.length < 32 || distinct.cardinality() < 16) throw new IllegalStateException(requirement);
        return key;
    }

    Account account(String field, String value) {
        String query = switch (field) {
            case "id" -> "SELECT * FROM users WHERE id=? AND deleted_at IS NULL";
            case "username" -> "SELECT * FROM users WHERE username=? AND deleted_at IS NULL";
            default -> throw new IllegalArgumentException("Invalid account lookup");
        };
        return jdbc.query(query, (r, i) -> new Account(
            new User(r.getString("id"), r.getString("username"), r.getString("email"), r.getString("role"),
                r.getInt("password_change_required") != 0),
            r.getString("password_hash"), r.getString("status"), r.getInt("failed_logins"), r.getLong("locked_until")),
            value).stream().findFirst().orElse(null);
    }

    synchronized Session login(String username, String password, String ip) {
        if (username == null || username.length() > 32 || password == null || password.getBytes(StandardCharsets.UTF_8).length > 72)
            throw unauthorized();
        Account account = account("username", username.strip());
        boolean matches = passwords.matches(password, account == null ? dummyHash : account.hash());
        if (account == null || !"active".equals(account.status())) throw unauthorized();
        if (account.lockedUntil() > now()) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ACCOUNT_LOCKED", "登录次数过多，请在15分钟后重试。", Map.of());
        if (!matches) {
            int failures = account.lockedUntil() == 0 ? account.failures() + 1 : 1;
            jdbc.update("UPDATE users SET failed_logins=?,locked_until=? WHERE id=?", failures, failures >= 5 ? now() + 900 : 0, account.user().userId());
            if (failures >= 5) audit(null, "account_locked", "user", account.user().userId(), "连续5次密码失败", ip);
            throw unauthorized();
        }
        jdbc.update("UPDATE users SET failed_logins=0,locked_until=0 WHERE id=?", account.user().userId());
        return issue(account.user());
    }

    synchronized Session register(String username, String password, String email, String invite) {
        if (username == null || !username.matches("[a-zA-Z0-9_-]{3,32}"))
            throw ApiException.invalid("username", "用户名须为3至32位字母、数字、下划线或连字符。");
        if (email == null || email.length() > 254 || !email.strip().matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+"))
            throw ApiException.invalid("email", "请输入有效邮箱。");
        validatePassword(password);
        if (inviteRequired && (invite == null || invite.length() > 100 || invite.isBlank()))
            throw ApiException.invalid("inviteCode", "请输入有效邀请码。");
        String address = email.strip();
        String hash = passwords.encode(password);
        return transactions.execute(status -> {
            if (inviteRequired && jdbc.update("""
                UPDATE invitation_codes SET used_count=used_count+1
                WHERE code=? AND status='active' AND expires_at>? AND used_count<max_uses
                """, digest(invite.strip()), now()) != 1) throw ApiException.invalid("inviteCode", "邀请码无效或已用完。");
            if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM users WHERE username=?)", Boolean.class, username)))
                throw new ApiException(HttpStatus.CONFLICT, "ACCOUNT_EXISTS", "该用户名已被使用。", Map.of());
            if (jdbc.queryForObject("SELECT count(*) FROM users WHERE email=?", Integer.class, address) >= 3)
                throw new ApiException(HttpStatus.CONFLICT, "EMAIL_ACCOUNT_LIMIT", "此邮箱已注册3个账号，请使用其他邮箱。", Map.of());
            String id = UUID.randomUUID().toString(), created = Instant.now().toString();
            jdbc.update("INSERT INTO users(id,username,email,password_hash,role,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)",
                id, username, address, hash, STUDENT, created, created);
            if (inviteRequired) jdbc.update("INSERT INTO invitation_registrations(code,user_id) VALUES(?,?)",digest(invite.strip()),id);
            return issue(new User(id, username, address, STUDENT, false));
        });
    }

    private Session issue(User user) {
        String id = UUID.randomUUID().toString(), refresh = randomToken();
        jdbc.update("INSERT INTO user_tokens(id,user_id,refresh_token_hash,expires_at) VALUES(?,?,?,?)",
            id, user.userId(), digest(refresh), now() + REFRESH_SECONDS);
        return new Session(user, jwt(user, id), refresh);
    }

    String sessionRole(String token) {
        if (token == null || token.length() != 43) return null;
        return jdbc.queryForList("""
            SELECT u.role FROM user_tokens t JOIN users u ON u.id=t.user_id
            WHERE t.refresh_token_hash=? AND t.revoked=0 AND t.expires_at>? AND u.status='active'
            """, String.class, digest(token), now()).stream().findFirst().orElse(null);
    }

    synchronized Session refresh(String token) {
        if (token == null || token.length() != 43) throw unauthorized();
        return transactions.execute(status -> {
            var rows = jdbc.queryForList("SELECT id,user_id FROM user_tokens WHERE refresh_token_hash=? AND revoked=0 AND expires_at>?", digest(token), now());
            if (rows.isEmpty()) throw unauthorized();
            var session = rows.getFirst();
            Account account = account("id", (String) session.get("user_id"));
            if (account == null || !"active".equals(account.status())) throw unauthorized();
            jdbc.update("UPDATE user_tokens SET revoked=1 WHERE id=?", session.get("id"));
            return issue(account.user());
        });
    }

    synchronized void logout(Principal principal) {
        jdbc.update("UPDATE user_tokens SET revoked=1 WHERE id=?", principal.sessionId());
    }

    synchronized Session changePassword(Principal principal, String current, String next, String ip) {
        validatePassword(next);
        Account account = account("id", principal.user().userId());
        if (current == null || current.getBytes(StandardCharsets.UTF_8).length > 72 || !passwords.matches(current, account.hash())) throw unauthorized();
        if (passwords.matches(next, account.hash())) throw ApiException.invalid("newPassword", "新密码须与当前密码不同。");
        String hash = passwords.encode(next);
        return transactions.execute(status -> {
            setPassword(account.user().userId(), hash, false);
            if (account.user().admin()) audit(account.user().userId(), "password_changed", "user", account.user().userId(), "", ip);
            return issue(account("id", account.user().userId()).user());
        });
    }

    public synchronized String resetPassword(User actor, String id, String supplied, String ip) {
        if (actor.userId().equals(id) || "admin".equals(id)) throw ApiException.invalid("id", "此账号须通过本人修改密码。");
        String temporary = supplied == null ? randomToken() : supplied;
        validatePassword(temporary);
        String hash = passwords.encode(temporary);
        return transactions.execute(status -> {
            requireManageableAccount(actor, id);
            setPassword(id, hash, true);
            audit(actor.userId(), "password_reset", "user", id, "", ip);
            return temporary;
        });
    }

    private void setPassword(String id, String hash, boolean requireChange) {
        jdbc.update("UPDATE users SET password_hash=?,password_change_required=?,failed_logins=0,locked_until=0,updated_at=? WHERE id=?",
            hash, requireChange ? 1 : 0, Instant.now().toString(), id);
        revoke(id);
    }

    public synchronized void updateAccount(User actor, String id, String field, String value, String ip) {
        if (actor.userId().equals(id) || "admin".equals(id))
            throw ApiException.invalid("id", "当前账号和初始管理员的角色与状态受保护。");
        String query = switch (field) {
            case "status" -> {
                if (!Set.of("active", "disabled").contains(value == null ? "" : value)) throw ApiException.invalid(field, "账号状态无效。");
                yield "UPDATE users SET status=?,updated_at=? WHERE id=?";
            }
            case "role" -> {
                if (!"admin".equals(actor.userId()))
                    throw accountManagementDenied("仅初始管理员可以变更账号角色。");
                if (!Set.of(STUDENT, ADMIN).contains(value == null ? "" : value)) throw ApiException.invalid(field, "角色无效。");
                yield "UPDATE users SET role=?,updated_at=? WHERE id=?";
            }
            default -> throw new IllegalArgumentException("Invalid account update");
        };
        transactions.executeWithoutResult(status -> {
            requireManageableAccount(actor, id);
            jdbc.update(query, value, Instant.now().toString(), id);
            revoke(id);
            audit(actor.userId(), "user_" + field, "user", id, value, ip);
        });
    }

    public synchronized void deleteAccount(User actor, String id, String ip, Runnable stopLearningJobs) {
        if (actor.userId().equals(id) || "admin".equals(id))
            throw ApiException.invalid("id", "当前账号和初始管理员不可删除。");
        transactions.executeWithoutResult(status -> {
            Account current = account("id", actor.userId());
            if (current == null || !"active".equals(current.status()) || !current.user().admin())
                throw accountManagementDenied("仅管理员可以删除账号。");
            requireManageableAccount(current.user(), id);
            String deletedAt = Instant.now().toString();
            jdbc.update("""
                UPDATE users SET username='deleted:' || id,email=NULL,password_hash='',status='disabled',
                    last_seen_at=NULL,password_change_required=0,deleted_at=?,updated_at=?
                WHERE id=?
                """, deletedAt, deletedAt, id);
            jdbc.update("DELETE FROM user_tokens WHERE user_id=?", id);
            jdbc.update("DELETE FROM user_activity_hourly WHERE user_id=?", id);
            jdbc.update("UPDATE invitation_codes SET status='disabled' WHERE created_by=?", id);
            audit(actor.userId(), "user_deleted", "user", id, "", ip);
            stopLearningJobs.run();
        });
    }

    private void requireManageableAccount(User actor, String id) {
        if (requireAccount(id).admin() && !"admin".equals(actor.userId()))
            throw accountManagementDenied("仅初始管理员可以管理其他管理员账号。");
    }

    private static ApiException accountManagementDenied(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "ADMIN_ROLE_REQUIRED", message, Map.of());
    }

    private void revoke(String id) { jdbc.update("UPDATE user_tokens SET revoked=1 WHERE user_id=?", id); }

    public synchronized String invite(User actor, int maxUses, int hours, String note, String ip) {
        if (maxUses < 1 || maxUses > 100 || hours < 1 || hours > 720)
            throw ApiException.invalid("invitation", "使用次数须为1至100次，有效期须为1至720小时。");
        String label=note==null?"":note.strip();
        if (label.length()>200 || label.indexOf(0)>=0) throw ApiException.invalid("note","备注最多200个字符。");
        return transactions.execute(status -> {
            String code;
            String hash;
            long expiresAt = now() + hours * 3600L;
            do {
                code = randomToken().substring(0, 8);
                hash = digest(code);
            } while (jdbc.update("""
                INSERT INTO invitation_codes(code,created_by,max_uses,expires_at,note) VALUES(?,?,?,?,?)
                ON CONFLICT(code) DO NOTHING
                """, hash, actor.userId(), maxUses, expiresAt,label) == 0);
            audit(actor.userId(), "invite_created", "invitation", hash.substring(0, 12), "maxUses=" + maxUses, ip);
            return code;
        });
    }

    public synchronized void revokeInvitation(User actor,String id,String ip) {
        transactions.executeWithoutResult(status->{
            var matches=jdbc.queryForList("SELECT code FROM invitation_codes WHERE substr(code,1,12)=?",String.class,id);
            if (matches.size()!=1) throw new ApiException(HttpStatus.NOT_FOUND,"INVITATION_NOT_FOUND","邀请码不存在。",Map.of());
            if (jdbc.update("UPDATE invitation_codes SET status='revoked' WHERE code=? AND status='active'",matches.getFirst())>0)
                audit(actor.userId(),"invite_revoked","invitation",id,"",ip);
        });
    }

    public User requireAccount(String id) {
        Account account = account("id", id);
        if (account == null) throw new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "账号不存在。", Map.of());
        return account.user();
    }

    public void audit(String admin, String action, String type, String target, String details, String ip) {
        jdbc.update("INSERT INTO admin_audit_logs VALUES(?,?,?,?,?,?,?,?)", UUID.randomUUID().toString(),
            admin, action, type, target, details, ip, Instant.now().toString());
    }

    Principal authenticate(String bearer) {
        if (bearer == null || !bearer.startsWith("Bearer ") || bearer.length() > 4096) throw unauthorized();
        JWTClaimsSet claims;
        try {
            SignedJWT jwt = SignedJWT.parse(bearer.substring(7));
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(new MACVerifier(signingKey))) throw unauthorized();
            claims = jwt.getJWTClaimsSet();
        } catch (java.text.ParseException | JOSEException e) { throw unauthorized(); }
        Date expires = claims.getExpirationTime();
        if (!ISSUER.equals(claims.getIssuer()) || expires == null || !expires.toInstant().isAfter(Instant.now())) throw unauthorized();
        String id = claims.getSubject(), session = claims.getJWTID();
        if (id == null || session == null) throw unauthorized();
        return jdbc.query("""
            SELECT u.* FROM user_tokens t JOIN users u ON t.user_id=u.id
            WHERE t.id=? AND u.id=? AND t.revoked=0 AND t.expires_at>? AND u.status='active'
            """, (r, i) -> new Principal(new User(r.getString("id"), r.getString("username"), r.getString("email"),
                r.getString("role"), r.getInt("password_change_required") != 0), session), session, id, now())
            .stream().findFirst().orElseThrow(AuthService::unauthorized);
    }

    void seen(String id) {
        Instant now = Instant.now();
        Instant hour=now.truncatedTo(java.time.temporal.ChronoUnit.HOURS);
        Instant recent=now.minusSeconds(60);
        int updated=jdbc.update("UPDATE users SET last_seen_at=? WHERE id=? AND (last_seen_at IS NULL OR last_seen_at<?)",
            now.toString(),id,(recent.isBefore(hour)?hour:recent).toString());
        if(updated>0) jdbc.update("INSERT OR IGNORE INTO user_activity_hourly(user_id,hour) VALUES(?,?)",
            id,hour.toString());
    }

    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=86_400_000, initialDelay=86_400_000)
    void purgeSessions() {
        jdbc.update("DELETE FROM user_tokens WHERE expires_at<=?", now());
        jdbc.update("DELETE FROM user_activity_hourly WHERE hour<?", Instant.now().minusSeconds(30L*86400).toString());
    }

    private String jwt(User user, String session) {
        try {
            var claims = new JWTClaimsSet.Builder().issuer(ISSUER).subject(user.userId()).jwtID(session)
                .claim("userId", user.userId()).claim("username", user.username()).claim("role", user.role())
                .issueTime(Date.from(Instant.now())).expirationTime(Date.from(Instant.now().plusSeconds(ACCESS_SECONDS))).build();
            var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            jwt.sign(new MACSigner(signingKey));
            return jwt.serialize();
        } catch (JOSEException e) { throw new IllegalStateException("Cannot sign access token", e); }
    }

    static ApiException unauthorized() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "登录信息无效或已过期。", Map.of());
    }

    private static void validatePassword(String password) {
        if (password == null || password.codePointCount(0, password.length()) < 9
            || password.getBytes(StandardCharsets.UTF_8).length > 72 || password.isBlank())
            throw ApiException.invalid("password", "密码至少9个字符、最多72字节，且不能全为空白。");
    }

    private static long now() { return Instant.now().getEpochSecond(); }
    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private static String digest(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
