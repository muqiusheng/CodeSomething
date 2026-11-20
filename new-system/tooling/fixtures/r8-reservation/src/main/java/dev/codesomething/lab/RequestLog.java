package dev.codesomething.lab;
import java.io.IOException;
import java.util.UUID;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
@Component
public class RequestLog extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String id=UUID.randomUUID().toString();request.setAttribute("requestId",id);response.setHeader("X-Request-Id",id);response.setHeader("Cache-Control","no-store");response.setHeader("X-Content-Type-Options","nosniff");
        try{chain.doFilter(request,response);}finally{
            // No body, headers, query string, password or token enters the access log.
            org.slf4j.LoggerFactory.getLogger(RequestLog.class).info("requestId={} method={} status={}",id,request.getMethod(),response.getStatus());
        }
    }
}
