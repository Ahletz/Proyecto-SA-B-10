package com.bank.customer.security;

import com.bank.customer.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.List;

public class JwtAuthenticationFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String h=req.getHeader("Authorization");
        if(h!=null && h.startsWith("Bearer ")){
            String token=h.substring(7);
            try{
                var claims=JwtUtil.parseClaims(token);
                String username=claims.getSubject();
                String role=claims.get("role",String.class);
                var auth=new UsernamePasswordAuthenticationToken(username,token,role==null?List.of():List.of(new SimpleGrantedAuthority("ROLE_"+role)));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }catch(Exception ignored){ SecurityContextHolder.clearContext(); }
        }
        chain.doFilter(req,res);
    }
}
