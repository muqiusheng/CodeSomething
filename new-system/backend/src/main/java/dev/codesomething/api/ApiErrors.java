package dev.codesomething.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiErrors {
    public record ErrorBody(String code, String message, Map<String, Object> details, boolean retryable, String requestId) {}

    private ResponseEntity<ErrorBody> result(HttpStatus status, String code, String message, Map<String, Object> details,
                                             boolean retryable, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ErrorBody(code, message, details, retryable, (String) request.getAttribute("requestId")));
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorBody> expected(ApiException error, HttpServletRequest request) {
        return result(error.status, error.code, error.getMessage(), error.details, false, request);
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorBody> malformed(HttpServletRequest request) {
        return result(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "请求内容格式不正确，请检查输入。", Map.of(), false, request);
    }
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErrorBody> missing(HttpServletRequest request) {
        return result(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的内容不存在。", Map.of(), false, request);
    }
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ErrorBody> method(HttpServletRequest request) {
        return result(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "此接口不支持该请求方法。", Map.of(), false, request);
    }
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ErrorBody> contentType(HttpServletRequest request) {
        return result(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "请使用JSON格式提交。", Map.of(), false, request);
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorBody> unexpected(Exception error, HttpServletRequest request) {
        org.slf4j.LoggerFactory.getLogger(ApiErrors.class).error("Request {} failed: {}", request.getAttribute("requestId"), error.getClass().getSimpleName());
        return result(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "本机服务暂时无法完成请求，请稍后重试。", Map.of(), true, request);
    }
}
