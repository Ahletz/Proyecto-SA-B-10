package com.bank.notification.service;

import com.bank.notification.model.*;
import com.bank.notification.repository.*;
import com.bank.notification.observability.*;
import com.fasterxml.jackson.databind.*;
import io.opentelemetry.api.trace.Span;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class AuditIngestion {
    private final JdbcTemplate jdbc;
    private final NotificationOutboxRepository outbox;
    private final CustomerContactRepository contacts;
    private final EventClassificationService classifier;
    private final Telemetry telemetry;
    private final ObjectMapper mapper=new ObjectMapper().findAndRegisterModules();
    public AuditIngestion(JdbcTemplate jdbc,NotificationOutboxRepository outbox,CustomerContactRepository contacts,EventClassificationService classifier,Telemetry telemetry) {
        this.jdbc=jdbc;this.outbox=outbox;this.contacts=contacts;this.classifier=classifier;this.telemetry=telemetry;
    }
    @Transactional
    public boolean ingest(JsonNode root) {
        String id=required(root,"eventId",128), type=required(root,"eventType",100), cid=required(root,"correlationId",128);
        if(!type.matches("[a-z][a-z0-9._-]{1,99}")) throw new IllegalArgumentException("Invalid event type");
        JsonNode payload=root.path("payload");
        var classified=classifier.classify(type,payload);
        var ctx=Span.current().getSpanContext();
        OffsetDateTime timestamp=root.path("timestamp").isTextual()?OffsetDateTime.parse(root.path("timestamp").asText()):OffsetDateTime.now();
        int inserted=jdbc.update("INSERT INTO processed_events (event_id,event_type,version,correlation_id,payload,event_timestamp,processed_at,severity,origin,classification_message,trace_id,span_id,service_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (event_id) DO NOTHING",
            id,type,root.path("version").asInt(1),cid,AuditPayload.sanitize(payload).toString(),timestamp,OffsetDateTime.now(),classified.severity().name(),classified.origin(),SafeJsonFormatter.redact(classified.message()),ctx.isValid()?ctx.getTraceId():null,ctx.isValid()?ctx.getSpanId():null,AuditPayload.service(type));
        if(inserted==0) return false;
        if((type.equals("customer.registered")||type.equals("customer.updated")) && payload.path("email").isTextual()) {
            String customer=payload.path("customerId").asText();String email=payload.path("email").asText();
            if(!customer.isBlank()&&!email.isBlank()) jdbc.update("INSERT INTO notification_customer_contacts (customer_id,email,updated_at) VALUES (?,?,?) ON CONFLICT (customer_id) DO UPDATE SET email=EXCLUDED.email,updated_at=EXCLUDED.updated_at WHERE notification_customer_contacts.updated_at <= EXCLUDED.updated_at",customer,email,timestamp);
        }
        Map<String,Object> data=new LinkedHashMap<>();
        data.put("sourceEventId",id);data.put("severity",classified.severity().name());data.put("origin",classified.origin());data.put("message",SafeJsonFormatter.redact(classified.message()));
        enqueue(id,"CLASSIFIED",data,cid);
        if(type.equals("customer.registered")) {
            enqueue(id,"ACTIVATION",Map.of("email",payload.path("email").asText(),"username",payload.path("username").asText(),"token",payload.path("activationToken").asText()),cid);
        } else if(type.equals("transaction.transfer.requested")&&!payload.path("requestedEmail").asText().isBlank()) {
            enqueue(id,"TRANSFER",Map.of("email",payload.path("requestedEmail").asText(),"amount",payload.path("amount").asDouble()),cid);
        } else if(type.equals("account.anomaly.detected")) {
            // Resolve contact from our event-fed projection; never call Customer over HTTP.
            String email=contacts.findById(payload.path("customerId").asText()).map(c->c.email).orElse("");
            enqueue(id,"ANOMALY",Map.of("email",email,"message",classified.message()),cid);
        } else if(type.equals("slo.alert.received")) {
            enqueue(id,"SLO",Map.of("email","","message",classified.message()),cid);
        }
        return true;
    }
    private void enqueue(String id,String kind,Map<String,Object> data,String cid) {
        try { outbox.save(new NotificationOutbox(id+":"+kind,kind,mapper.writeValueAsString(data),cid,telemetry.headers().get("traceparent"))); }
        catch(com.fasterxml.jackson.core.JsonProcessingException ex) { throw new IllegalArgumentException("Invalid notification payload"); }
    }
    public static String required(JsonNode root,String field,int max) {
        String value=root.path(field).asText();
        if(value.isBlank()||value.length()>max) throw new IllegalArgumentException("Invalid "+field);
        return value;
    }
}
