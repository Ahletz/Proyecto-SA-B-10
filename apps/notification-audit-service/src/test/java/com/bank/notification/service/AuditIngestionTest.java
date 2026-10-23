package com.bank.notification.service;
import com.bank.notification.model.*;
import com.bank.notification.repository.*;
import com.bank.notification.observability.Telemetry;
import com.fasterxml.jackson.databind.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AuditIngestionTest {
    JdbcTemplate jdbc;NotificationOutboxRepository outbox;CustomerContactRepository contacts;AuditIngestion ingestion;
    @BeforeEach void setup(){jdbc=mock(JdbcTemplate.class);outbox=mock(NotificationOutboxRepository.class);contacts=mock(CustomerContactRepository.class);
        ingestion=new AuditIngestion(jdbc,outbox,contacts,new EventClassificationService(),new Telemetry(io.opentelemetry.api.OpenTelemetry.noop()));}
    JsonNode event() throws Exception {return new ObjectMapper().readTree("{\"eventId\":\"evt-1\",\"eventType\":\"customer.registered\",\"correlationId\":\"corr-1\",\"payload\":{\"customerId\":\"CUST-1\",\"email\":\"private@example.com\",\"activationToken\":\"secret\"}}");}
    @Test void duplicateInboxDoesNotScheduleAnotherNotification() throws Exception {
        when(jdbc.update(anyString(),any(Object[].class))).thenReturn(0);
        assertFalse(ingestion.ingest(event()));verifyNoInteractions(outbox,contacts);
    }
    @Test void freshEventSchedulesDeliveryAndProjectsContact() throws Exception {
        when(jdbc.update(anyString(),any(Object[].class))).thenReturn(1);
        assertTrue(ingestion.ingest(event()));verify(outbox,times(2)).save(any(NotificationOutbox.class));verify(jdbc,times(2)).update(anyString(),any(Object[].class));
    }
    @Test void auditProjectionDropsSecretsRecursively() throws Exception {
        var safe=AuditPayload.sanitize(event().path("payload"));assertTrue(safe.has("customerId"));assertFalse(safe.has("email"));assertFalse(safe.has("activationToken"));
    }
    @Test void accountAnomalyHasWarningClassification() throws Exception {
        var result=new EventClassificationService().classify("account.anomaly.detected",new ObjectMapper().readTree("{\"accountId\":\"acc-1\"}"));assertEquals(NotificationSeverity.WARNING,result.severity());
    }
}
