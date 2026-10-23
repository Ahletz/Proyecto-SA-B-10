package com.bank.customer.observability;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.*;
import io.opentelemetry.context.*;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.function.Supplier;

@Component
public class Telemetry {
    private final OpenTelemetry otel;
    private final io.opentelemetry.api.metrics.LongCounter operations;
    private final io.opentelemetry.api.metrics.DoubleHistogram duration;
    public Telemetry(OpenTelemetry otel) {
        this.otel = otel;
        operations = otel.getMeter("bank-usac").counterBuilder("bank.operations").build();
        duration = otel.getMeter("bank-usac").histogramBuilder("bank.operation.duration").setUnit("s")
            .setExplicitBucketBoundariesAdvice(java.util.List.of(0.05,0.1,0.25,0.5,1.0,2.5,5.0,10.0)).build();
    }
    public OpenTelemetry otel() { return otel; }
    public <T> T span(String name, Context parent, String correlationId, Supplier<T> action) {
        var builder = otel.getTracer("bank-usac").spanBuilder(name).setParent(parent)
            .setAttribute("bank.correlation_id", correlationId);
        if (name.startsWith("publish ")) builder.setSpanKind(SpanKind.PRODUCER)
            .setAttribute("messaging.system", "rabbitmq").setAttribute("messaging.operation.type", "publish")
            .setAttribute("messaging.destination.name", "bank.events")
            .setAttribute("messaging.rabbitmq.destination.routing_key", name.substring(8));
        var requestContext = Span.current().getSpanContext();
        var parentContext = Span.fromContext(parent).getSpanContext();
        if (requestContext.isValid() && parentContext.isValid() && !requestContext.getTraceId().equals(parentContext.getTraceId())) builder.addLink(requestContext);
        Span span = builder.startSpan();
        long start = System.nanoTime();
        String outcome = "success";
        String previous = MDC.get("correlationId");
        try (Scope ignored = span.makeCurrent()) {
            MDC.put("correlationId", correlationId);
            return action.get();
        } catch (RuntimeException ex) {
            // Exception text may contain customer data: export only its class.
            outcome = ex.getClass().getPackageName().endsWith(".exception") || ex instanceof IllegalArgumentException
                ? "business_rejection" : "technical_error";
            if (outcome.equals("technical_error")) {
                span.setStatus(StatusCode.ERROR, ex.getClass().getSimpleName());
                try (Scope failedScope = span.makeCurrent()) {
                    org.slf4j.LoggerFactory.getLogger(Telemetry.class).error("Operation failed: {} ({})", name, ex.getClass().getSimpleName());
                }
            }
            throw ex;
        } finally {
            span.setAttribute("bank.operation.outcome",outcome);
            if (previous == null) MDC.remove("correlationId"); else MDC.put("correlationId", previous);
            if (!name.startsWith("publish ")) {
                operations.add(1, io.opentelemetry.api.common.Attributes.builder().put("operation",name).put("outcome",outcome).build());
                duration.record((System.nanoTime()-start)/1e9,io.opentelemetry.api.common.Attributes.of(io.opentelemetry.api.common.AttributeKey.stringKey("operation"),name));
            }
            span.end();
        }
    }
    public Map<String,String> headers() {
        Map<String,String> headers = new java.util.HashMap<>();
        otel.getPropagators().getTextMapPropagator().inject(Context.current(), headers, Map::put);
        return headers;
    }
    public Context extract(Map<String,String> headers) {
        return otel.getPropagators().getTextMapPropagator().extract(Context.root(), headers,
            new io.opentelemetry.context.propagation.TextMapGetter<Map<String,String>>() {
                public Iterable<String> keys(Map<String,String> h) { return h.keySet(); }
                public String get(Map<String,String> h, String key) { return h.get(key); }
            });
    }
}
