package dev.codesomething.api;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

@Component
@Order(-90)
public class LocalOriginFilter extends OncePerRequestFilter {
    private final String frontendOrigin;
    private final JsonMapper json=JsonMapper.builder().build();
    public LocalOriginFilter(@Value("${cs.frontend-origin:http://127.0.0.1:5178}") String origin) { this.frontendOrigin=origin; }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        if(request.getRequestURI().startsWith("/api/")) {
            String origin=request.getHeader("Origin"), host=request.getServerName();
            boolean loopback=Set.of("127.0.0.1","localhost").contains(host);
            boolean allowedOrigin=origin==null || origin.equals(frontendOrigin) || origin.equals("http://127.0.0.1:"+request.getLocalPort()) || origin.equals("http://localhost:"+request.getLocalPort());
            if(!loopback || !allowedOrigin || "cross-site".equals(request.getHeader("Sec-Fetch-Site"))) {
                response.setStatus(403);response.setContentType("application/json");response.setCharacterEncoding("UTF-8");
                response.getWriter().write(json.writeValueAsString(new ApiErrors.ErrorBody("ORIGIN_REJECTED","此来源不能访问本机学习服务。",Map.of(),false,(String)request.getAttribute("requestId"))));return;
            }
        }
        chain.doFilter(request,response);
    }
}
