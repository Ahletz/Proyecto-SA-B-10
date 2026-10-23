package com.bank.notification.controller;

import com.bank.notification.model.*;
import com.bank.notification.repository.ProcessedEventRepository;
import com.bank.notification.service.AuditPayload;
import com.bank.notification.observability.SafeJsonFormatter;
import com.fasterxml.jackson.databind.*;
import org.springframework.http.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/api/audit")
public class AuditController {
    private final ProcessedEventRepository repository;
    private final ObjectMapper mapper=new ObjectMapper();
    public AuditController(ProcessedEventRepository repository){this.repository=repository;}
    @GetMapping("/events")
    public ResponseEntity<?> getEvents(
            @RequestParam(required=false) String correlationId,@RequestParam(required=false) String traceId,
            @RequestParam(required=false) String service,@RequestParam(required=false) String level,
            @RequestParam(required=false) String q,@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="200") int size,@RequestParam(defaultValue="false") boolean paged) {
        if(page<0||size<1||size>200)throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"page >= 0; size entre 1 y 200");
        if(traceId!=null&&!traceId.isBlank()&&!traceId.matches("[0-9a-f]{32}"))throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"traceId inválido");
        if(correlationId!=null&&correlationId.length()>128)throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"correlationId inválido");
        if(service!=null&&service.length()>100||q!=null&&q.length()>128)throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"Filtro demasiado largo");
        NotificationSeverity severity=null;
        try {if(level!=null&&!level.isBlank())severity=NotificationSeverity.valueOf(level.equalsIgnoreCase("WARN")?"WARNING":level.toUpperCase(Locale.ROOT));}
        catch(IllegalArgumentException ex){throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"Nivel inválido");}
        NotificationSeverity selected=severity;
        Specification<ProcessedEvent> spec=(root,query,cb)->{
            var predicates=new ArrayList<jakarta.persistence.criteria.Predicate>();
            if(correlationId!=null&&!correlationId.isBlank())predicates.add(cb.equal(root.get("correlationId"),correlationId));
            if(traceId!=null&&!traceId.isBlank())predicates.add(cb.equal(root.get("traceId"),traceId));
            if(service!=null&&!service.isBlank()) {
                var gatewayEvent=root.get("eventType").in("transaction.transfer.requested","transaction.interbank.requested");
                var legacy=service.equals("api-gateway")?gatewayEvent:cb.like(root.get("eventType"),service.replace("-service","")+".%");
                if(service.equals("transaction-service"))legacy=cb.and(legacy,cb.not(gatewayEvent));
                predicates.add(cb.or(cb.equal(root.get("serviceName"),service),cb.and(cb.isNull(root.get("serviceName")),legacy)));
            }
            if(selected!=null)predicates.add(cb.equal(root.get("severity"),selected));
            if(q!=null&&!q.isBlank()) {
                String search="%"+q.toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
                predicates.add(cb.or(cb.like(cb.lower(root.get("eventType")),search,'!'),cb.like(cb.lower(root.get("correlationId")),search,'!'),cb.like(cb.lower(root.get("origin")),search,'!')));
            }
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        var result=repository.findAll(spec,PageRequest.of(page,size,Sort.by(Sort.Order.desc("processedAt"),Sort.Order.desc("eventId"))));
        List<AuditEventResponse> items=result.getContent().stream().map(this::toResponse).toList();
        Object body=paged?new AuditPage(items,page,size,result.getTotalElements(),result.getTotalPages()):items;
        return ResponseEntity.ok().header("X-Total-Count",String.valueOf(result.getTotalElements())).body(body);
    }
    private AuditEventResponse toResponse(ProcessedEvent event) {
        JsonNode payload;
        try{payload=AuditPayload.sanitize(mapper.readTree(event.getPayload()));}catch(Exception ex){payload=mapper.createObjectNode();}
        return new AuditEventResponse(event.getEventId(),event.getEventType(),event.getVersion(),event.getCorrelationId(),event.getEventTimestamp(),event.getProcessedAt(),
            event.getSeverity()==null?null:event.getSeverity().name(),event.getOrigin(),SafeJsonFormatter.redact(event.getClassificationMessage()),mapper.convertValue(payload,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){}),
            event.getTraceId(),event.getSpanId(),event.getServiceName()==null?AuditPayload.service(event.getEventType()):event.getServiceName());
    }
    public record AuditPage(List<AuditEventResponse> items,int page,int size,long total,int totalPages){}
    public record AuditEventResponse(String eventId,String eventType,Integer version,String correlationId,java.time.OffsetDateTime eventTimestamp,
        java.time.OffsetDateTime processedAt,String severity,String origin,String message,Map<String,Object> payload,String traceId,String spanId,String serviceName){}
}
