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
    public Telemetry(OpenTelemetry otel) { this.otel = otel; }
    public OpenTelemetry otel() { return otel; }
    public <T> T span(String name, Context parent, String correlationId, Supplier<T> action) {
        var builder = otel.getTracer("bank-usac").spanBuilder(name).setParent(parent)
            .setAttribute("bank.correlation_id", correlationId);
        if (name.startsWith("publish ")) builder.setSpanKind(SpanKind.PRODUCER)
            .setAttribute("messaging.system", "rabbitmq").setAttribute("messaging.operation.type", "publish")
            .setAttribute("messaging.destination.name", "bank.events")
            .setAttribute("messaging.rabbitmq.destination.routing_key", name.substring(8));
        Span span = builder.startSpan();
        String previous = MDC.get("correlationId");
        try (Scope ignored = span.makeCurrent()) {
            MDC.put("correlationId", correlationId);
            return action.get();
        } catch (RuntimeException ex) {
            // Exception text may contain customer data: export only its class.
            span.setStatus(StatusCode.ERROR, ex.getClass().getSimpleName());
            throw ex;
        } finally {
            if (previous == null) MDC.remove("correlationId"); else MDC.put("correlationId", previous);
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
