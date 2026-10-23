package com.bank.customer.observability;

import ch.qos.logback.classic.spi.ILoggingEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.trace.Span;
import org.springframework.boot.logging.structured.StructuredLogFormatter;
import java.time.Instant;
import java.util.*;

public class SafeJsonFormatter implements StructuredLogFormatter<ILoggingEvent> {
    private final ObjectMapper mapper = new ObjectMapper();
    public static String redact(String text) {
        if (text == null) return "";
        if (java.util.regex.Pattern.compile("(?i)(password|activationToken|documentPhoto|documentNumber|fullName|address|apiKey|x-api-key|authorization|jwt|token|email)[\"']?\\s*[:=]").matcher(text).find()) return "Sensitive details omitted";
        if (text.contains("RegisterRequest") || text.contains("LoginRequest") || text.contains("UpdateCustomerRequest")
                || text.contains("rejected value")) return "Sensitive request details omitted";
        return text.replaceAll("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}", "[email omitted]")
            .replaceAll("(?i)Bearer\\s+[^\\s,;]+", "Bearer [omitted]")
            .replaceAll("eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+", "[jwt omitted]")
            .replaceAll("(?i)((?:password|token|activationToken|apiKey|documentNumber|documentPhoto|email|address|fullName)[\"']?\\s*[:=]\\s*)[^,}\\s]+", "$1[omitted]")
            .replaceAll("(?i)(/activate[/?](?:token=)?)[^\\s?&]+", "$1[omitted]")
            .replaceAll("\\b[0-9]{13}\\b", "[document omitted]")
            .replaceAll("rejected value \\[[^]]*]", "rejected value [omitted]");
    }
    @Override public String format(ILoggingEvent event) {
        var span = Span.current().getSpanContext();
        Map<String,Object> log = new LinkedHashMap<>();
        log.put("timestamp", Instant.ofEpochMilli(event.getTimeStamp()).toString());
        log.put("serviceName", "customer-service");
        log.put("environment", System.getenv().getOrDefault("DEPLOY_ENV", "dev"));
        log.put("version", System.getenv().getOrDefault("APP_VERSION", "local"));
        log.put("level", event.getLevel().toString());
        log.put("correlationId", event.getMDCPropertyMap().getOrDefault("correlationId", ""));
        log.put("traceId", span.isValid() ? span.getTraceId() : "");
        log.put("spanId", span.isValid() ? span.getSpanId() : "");
        log.put("message", redact(event.getFormattedMessage()));
        for (String key : List.of("event", "customerId")) if (event.getMDCPropertyMap().containsKey(key)) log.put(key, event.getMDCPropertyMap().get(key));
        // Do not serialize raw exceptions/SQL/bodies; these can contain identity data.
        if (event.getThrowableProxy() != null) log.put("errorType", event.getThrowableProxy().getClassName());
        try { return mapper.writeValueAsString(log) + "\n"; }
        catch (Exception ex) { return "{\"level\":\"ERROR\",\"message\":\"Log encoding failed\"}\n"; }
    }
}
