package com.bank.notification.service;

import com.bank.notification.model.*;
import com.bank.notification.repository.*;
import com.bank.notification.publisher.NotificationEventPublisher;
import com.bank.notification.observability.Telemetry;
import com.fasterxml.jackson.databind.*;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.*;
import java.time.*;
import java.util.*;

@Component
public class NotificationDelivery {
    private final NotificationOutboxRepository outbox;private final NotificationEventPublisher publisher;
    private final NotificationService mail;private final Telemetry telemetry;private final TransactionTemplate tx;
    private final ObjectMapper mapper=new ObjectMapper();
    private static final Logger log=LoggerFactory.getLogger(NotificationDelivery.class);
    @Value("${NOTIFICATION_OUTBOX_BATCH_SIZE:100}") private int batchSize;
    public NotificationDelivery(NotificationOutboxRepository outbox,NotificationEventPublisher publisher,NotificationService mail,Telemetry telemetry,PlatformTransactionManager manager) {
        this.outbox=outbox;this.publisher=publisher;this.mail=mail;this.telemetry=telemetry;this.tx=new TransactionTemplate(manager);
    }
    @Scheduled(fixedDelayString="${NOTIFICATION_OUTBOX_INTERVAL_MS:500}")
    public void drain() { for(int i=0;i<batchSize;i++) if(!Boolean.TRUE.equals(tx.execute(status->deliverNext()))) break; }
    private boolean deliverNext() {
        var tasks=outbox.nextForDelivery();if(tasks.isEmpty())return false;
        NotificationOutbox task=tasks.get(0);
        try {
            telemetry.span("notification.deliver",task.traceparent==null?io.opentelemetry.context.Context.root():telemetry.extract(Map.of("traceparent",task.traceparent)),task.correlationId,()->{
                try {
                    JsonNode body=mapper.readTree(task.body);
                    switch(task.kind) {
                        case "CLASSIFIED" -> publisher.publishClassified(body.path("sourceEventId").asText(),NotificationSeverity.valueOf(body.path("severity").asText()),body.path("origin").asText(),body.path("message").asText(),task.correlationId);
                        case "ACTIVATION" -> mail.sendActivation(body.path("email").asText(),body.path("username").asText(),body.path("token").asText());
                        case "TRANSFER" -> mail.sendTransferReceived(body.path("email").asText(),task.correlationId,body.path("amount").asDouble());
                        case "ANOMALY","SLO" -> mail.sendWarning(body.path("email").asText(),task.kind,body.path("message").asText(),task.correlationId,task.id);
                        default -> throw new IllegalArgumentException("Unknown notification task");
                    }
                    return true;
                } catch(com.fasterxml.jackson.core.JsonProcessingException ex) {throw new IllegalStateException("Invalid task JSON");}
            });
            task.status="SENT";task.body="{}"; // Purge activation tokens/contact data after delivery.
        } catch(RuntimeException ex) {
            task.attempts++;
            task.nextAttemptAt=OffsetDateTime.now().plusSeconds(Math.min(300,1L<<Math.min(task.attempts,8)));
            if(task.attempts>=10)task.status="FAILED";
            log.warn("Notification delivery deferred; kind={} attempt={} errorType={}",task.kind,task.attempts,ex.getClass().getSimpleName());
        }
        outbox.save(task);return true;
    }
}
