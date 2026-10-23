package com.bank.notification.consumer;

import com.bank.notification.observability.Telemetry;
import com.bank.notification.service.AuditIngestion;
import com.fasterxml.jackson.databind.*;
import io.opentelemetry.api.common.*;
import io.opentelemetry.api.trace.*;
import io.opentelemetry.context.*;
import org.slf4j.*;
import org.springframework.amqp.core.Message;
import org.springframework.stereotype.Component;
import java.util.*;

@Component
public class CustomerEventListener {
    private final AuditIngestion ingestion;private final Telemetry telemetry;
    private final ObjectMapper mapper=new ObjectMapper();
    private final io.opentelemetry.api.metrics.LongCounter processed,duplicates;
    private final io.opentelemetry.api.metrics.DoubleHistogram duration;
    private static final Logger log=LoggerFactory.getLogger(CustomerEventListener.class);
    public CustomerEventListener(AuditIngestion ingestion,Telemetry telemetry) {
        this.ingestion=ingestion;this.telemetry=telemetry;
        var meter=telemetry.otel().getMeter("bank-usac");
        processed=meter.counterBuilder("bank.events.processed").build();duplicates=meter.counterBuilder("bank.events.duplicate").build();
        duration=meter.histogramBuilder("bank.operation.duration").setUnit("s").build();
    }
    public void onMessage(Message message) {
        if(message.getBody().length>1_048_576) throw new IllegalArgumentException("Event too large");
        final JsonNode root;
        try {root=mapper.readTree(message.getBody());} catch(Exception ex) {throw new IllegalArgumentException("Invalid event JSON");}
        String type=AuditIngestion.required(root,"eventType",100),cid=AuditIngestion.required(root,"correlationId",128);
        Map<String,String> headers=new HashMap<>();
        message.getMessageProperties().getHeaders().forEach((k,v)->{if(v!=null)headers.put(k,v.toString());});
        Span span=telemetry.otel().getTracer("bank-usac").spanBuilder("process "+type)
            .setParent(telemetry.extract(headers)).setSpanKind(SpanKind.CONSUMER)
            .setAttribute("messaging.system","rabbitmq").setAttribute("messaging.operation.type","process")
            .setAttribute("messaging.destination.name","bank.events").setAttribute("bank.correlation_id",cid).setAttribute("bank.event.type",type).startSpan();
        long start=System.nanoTime();Map<String,String> previous=MDC.getCopyOfContextMap();
        try(Scope ignored=span.makeCurrent()) {
            MDC.put("correlationId",cid);MDC.put("event",type);
            boolean fresh=ingestion.ingest(root);
            if(!fresh)duplicates.add(1,Attributes.of(AttributeKey.stringKey("event_type"),type));
            processed.add(1,Attributes.builder().put("event_type",type).put("outcome","success").build());
            log.info(fresh?"Business event audited":"Duplicate business event ignored");
        } catch(RuntimeException ex) {
            span.setStatus(StatusCode.ERROR,ex.getClass().getSimpleName());
            processed.add(1,Attributes.builder().put("event_type",type).put("outcome","technical_error").build());throw ex;
        } finally {
            duration.record((System.nanoTime()-start)/1e9,Attributes.of(AttributeKey.stringKey("operation"),"consume "+type));
            span.end();if(previous==null)MDC.clear();else MDC.setContextMap(previous);
        }
    }
}
