package com.bank.customer.observability;

import io.opentelemetry.api.trace.*;
import io.opentelemetry.context.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.*;

@Component
public class RequestTracingFilter extends OncePerRequestFilter {
    private final Telemetry telemetry;
    private final io.opentelemetry.api.metrics.DoubleHistogram duration;
    public RequestTracingFilter(Telemetry telemetry) {
        this.telemetry = telemetry;
        duration = telemetry.otel().getMeter("bank-usac").histogramBuilder("http.server.request.duration").setUnit("s").build();
    }
    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        Map<String,String> headers = new HashMap<>();
        for (String key : List.of("traceparent", "tracestate")) if (req.getHeader(key) != null) headers.put(key, req.getHeader(key));
        String cid = req.getHeader("X-Correlation-Id");
        if (cid == null || !cid.matches("[A-Za-z0-9._:-]{1,128}")) cid = UUID.randomUUID().toString();
        // Never export the activation token or concrete customer identifiers in an HTTP URL.
        String route = req.getRequestURI().replaceAll("/activate/[^/]+", "/activate/{token}")
            .replaceAll("/CUST-[0-9]+", "/{customerId}");
        long started = System.nanoTime();
        Span span = telemetry.otel().getTracer("bank-usac").spanBuilder(req.getMethod() + " " + route)
            .setSpanKind(SpanKind.SERVER).setParent(telemetry.extract(headers))
            .setAttribute("http.request.method", req.getMethod()).setAttribute("http.route", route)
            .setAttribute("bank.correlation_id", cid).startSpan();
        Map<String,String> previous = MDC.getCopyOfContextMap();
        try (Scope ignored = span.makeCurrent()) {
            MDC.put("correlationId", cid);
            res.setHeader("X-Correlation-Id", cid);res.setHeader("X-Trace-Id", span.getSpanContext().getTraceId());
            chain.doFilter(req, res);
        } catch (ServletException | IOException | RuntimeException ex) {
            span.setStatus(StatusCode.ERROR, ex.getClass().getSimpleName()); throw ex;
        } finally {
            span.setAttribute("http.response.status_code", res.getStatus());
            if (res.getStatus() >= 500) span.setStatus(StatusCode.ERROR);
            String metricRoute = route.matches("/api/customers(?:/(?:register|login|me|activate/\\{token\\}|\\{customerId\\}/kyc))?") ? route : "/other";
            duration.record((System.nanoTime()-started)/1e9, io.opentelemetry.api.common.Attributes.builder()
                .put("http.request.method",req.getMethod()).put("http.route",metricRoute)
                .put("http.response.status_code",res.getStatus()).build());
            span.end(); if (previous == null) MDC.clear(); else MDC.setContextMap(previous);
        }
    }
}
