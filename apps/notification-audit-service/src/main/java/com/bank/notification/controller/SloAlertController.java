package com.bank.notification.controller;

import com.bank.notification.service.AuditIngestion;
import com.bank.notification.observability.Telemetry;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/internal/alerts")
public class SloAlertController {
    private final AuditIngestion ingestion;private final Telemetry telemetry;private final String token;
    public SloAlertController(AuditIngestion ingestion,Telemetry telemetry,@Value("${ALERT_WEBHOOK_TOKEN:}") String token){this.ingestion=ingestion;this.telemetry=telemetry;this.token=token;}
    @PostMapping("/slo")
    public Map<String,Object> receive(@RequestHeader(value="Authorization",required=false) String authorization,@RequestBody Map<String,Object> input) {
        JsonNode body=new ObjectMapper().valueToTree(input);
        return receiveJson(authorization,body);
    }
    public Map<String,Object> receiveJson(String authorization,JsonNode body) {
        if(token.isBlank())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Alert receiver not configured");
        if(authorization==null||!MessageDigest.isEqual(("Bearer "+token).getBytes(StandardCharsets.UTF_8),authorization.getBytes(StandardCharsets.UTF_8)))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid alert credential");
        if(!body.path("alerts").isArray()||body.path("alerts").size()>100)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"alerts must contain at most 100 items");
        // Validate the entire batch before making any delivery visible.
        for(JsonNode alert:body.path("alerts")) {
            String name=alert.path("labels").path("alertname").asText(),state=alert.path("status").asText();
            if(!name.matches("[A-Za-z][A-Za-z0-9_]{0,99}")||!Set.of("firing","resolved").contains(state)||alert.path("startsAt").asText().isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid alert");
        }
        int inserted=0;
        for(JsonNode alert:body.path("alerts")) {
            String name=alert.path("labels").path("alertname").asText(),state=alert.path("status").asText();
            String seed=alert.path("fingerprint").asText()+":"+name+":"+alert.path("startsAt").asText()+":"+state;
            String id=UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8)).toString(),cid="slo-"+id;
            ObjectNode event=new ObjectMapper().createObjectNode();event.put("eventId",id);event.put("eventType","slo.alert.received");event.put("version",1);event.put("timestamp",Instant.now().toString());event.put("correlationId",cid);
            ObjectNode payload=event.putObject("payload");payload.put("alertname",name);payload.put("alertStatus",state);
            String service=alert.path("labels").path("service_name").asText("unknown");payload.put("serviceName",service.substring(0,Math.min(100,service.length())));
            if(telemetry.span("notification.slo.receive",io.opentelemetry.context.Context.current(),cid,()->ingestion.ingest(event)))inserted++;
        }
        return Map.of("received",body.path("alerts").size(),"newEvents",inserted);
    }
}
