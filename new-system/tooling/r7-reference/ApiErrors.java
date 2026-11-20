package dev.codesomething.lab;
import java.util.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestControllerAdvice
public class ApiErrors {
    private Object body(String code,String message,HttpServletRequest request){return Map.of("code",code,"message",message,"requestId",request.getAttribute("requestId"));}
    @ExceptionHandler(Problem.class) public ResponseEntity<?> problem(Problem e,HttpServletRequest r){return ResponseEntity.status(e.status).body(body(e.code,e.getMessage(),r));}
    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    public ResponseEntity<?> invalid(Exception e,HttpServletRequest r){return ResponseEntity.badRequest().body(body("INVALID_INPUT","请求格式或参数不正确",r));}
    @ExceptionHandler(Exception.class) public ResponseEntity<?> internal(Exception e,HttpServletRequest r){org.slf4j.LoggerFactory.getLogger(ApiErrors.class).error("requestId={} failure={}",r.getAttribute("requestId"),e.getClass().getSimpleName());return ResponseEntity.internalServerError().body(body("INTERNAL_ERROR","服务暂时不可用，请保留请求编号后重试",r));}
}
