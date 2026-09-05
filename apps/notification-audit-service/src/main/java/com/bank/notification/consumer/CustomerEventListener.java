package com.bank.notification.consumer;

import com.bank.notification.model.ProcessedEvent;
import com.bank.notification.repository.ProcessedEventRepository;
import com.bank.notification.service.NotificationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

@Component
public class CustomerEventListener {
    private static final Logger log = LoggerFactory.getLogger(CustomerEventListener.class);
    private final ProcessedEventRepository repository;
    private final NotificationService notifications;
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    public CustomerEventListener(ProcessedEventRepository repository, NotificationService notifications) {
        this.repository = repository; this.notifications = notifications;
    }

    public void onMessage(byte[] message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            String eventId=root.path("eventId").asText(), eventType=root.path("eventType").asText(), correlationId=root.path("correlationId").asText();
            if(eventId.isBlank()||eventType.isBlank()||correlationId.isBlank()) throw new IllegalArgumentException("eventId, eventType y correlationId son requeridos");
            if(repository.existsById(eventId)){ log.info("Evento duplicado ignorado: {}",eventId); return; }
            JsonNode payloadNode=root.path("payload");
            if("customer.registered".equals(eventType)) {
                notifications.sendActivation(payloadNode.path("email").asText(), payloadNode.path("username").asText(), payloadNode.path("activationToken").asText());
            } else if ("transaction.transfer.requested".equals(eventType)) {
                notifications.sendTransferReceived(payloadNode.path("requestedEmail").asText(), correlationId, payloadNode.path("amount").asDouble());
            }
            Integer version=root.path("version").isInt()?root.path("version").asInt():1;
            OffsetDateTime eventTimestamp=parseTimestamp(root.path("timestamp").asText(null));
            String payload=payloadNode.isMissingNode()?"{}":objectMapper.writeValueAsString(payloadNode);
            try { repository.save(new ProcessedEvent(eventId,eventType,version,correlationId,payload,eventTimestamp,OffsetDateTime.now())); }
            catch(DataIntegrityViolationException ex){ log.info("Evento duplicado ignorado: {}",eventId); return; }
            log.info("Evento auditado: {} | correlationId={}",eventType,correlationId);
        } catch(Exception e){ log.error("Error procesando evento: {}",e.getMessage(),e); throw new RuntimeException("Error al procesar evento",e); }
    }
    private OffsetDateTime parseTimestamp(String timestamp){ if(timestamp==null||timestamp.isBlank())return null; try{return OffsetDateTime.parse(timestamp);}catch(DateTimeParseException e){throw new IllegalArgumentException("timestamp inválido",e);} }
}
