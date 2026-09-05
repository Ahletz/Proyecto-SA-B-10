package com.bank.customer.util;

import com.bank.customer.model.Customer;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;

public final class JwtUtil {
    private JwtUtil() {}
    private static final String SECRET = System.getenv().getOrDefault(
        "JWT_SECRET", "bank-usac-demo-secret-change-before-production-2026");
    private static final long EXP_MS = Long.parseLong(
        System.getenv().getOrDefault("JWT_EXPIRATION_MS", "3600000"));
    private static final Key KEY = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));

    public static String createToken(Customer customer) {
        Date now = new Date();
        return Jwts.builder()
            .setSubject(customer.getUsername())
            .claim("customerId", "CUST-" + customer.getId())
            .claim("role", customer.getRole())
            .claim("email", customer.getEmail())
            .setIssuedAt(now)
            .setExpiration(new Date(now.getTime() + EXP_MS))
            .signWith(KEY)
            .compact();
    }

    public static Claims parseClaims(String token) {
        return Jwts.parserBuilder().setSigningKey(KEY).build().parseClaimsJws(token).getBody();
    }
    public static boolean validateToken(String token) {
        try { parseClaims(token); return true; } catch (Exception e) { return false; }
    }
    public static String getSubject(String token) { return parseClaims(token).getSubject(); }
}
