package com.bank.notification.controller;
import com.bank.notification.service.AuditIngestion;
import com.bank.notification.observability.Telemetry;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.OpenTelemetry;
import org.springframework.web.server.ResponseStatusException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class SloAlertControllerTest {
    @Test void webhookRequiresCredentialAndUsesStableIdForRepeatedDelivery() throws Exception {
        var ingestion=mock(AuditIngestion.class);when(ingestion.ingest(any())).thenReturn(true,false);
        var controller=new SloAlertController(ingestion,new Telemetry(OpenTelemetry.noop()),"private-token");
        var body=new ObjectMapper().readTree("{\"alerts\":[{\"fingerprint\":\"abcd\",\"status\":\"firing\",\"startsAt\":\"2026-10-22T12:00:00Z\",\"labels\":{\"alertname\":\"SloBurnRateFast\"}}]}");
        assertThrows(ResponseStatusException.class,()->controller.receiveJson("Bearer wrong",body));
        assertEquals(1,controller.receiveJson("Bearer private-token",body).get("newEvents"));
        assertEquals(0,controller.receiveJson("Bearer private-token",body).get("newEvents"));
        var captor=org.mockito.ArgumentCaptor.forClass(com.fasterxml.jackson.databind.JsonNode.class);verify(ingestion,times(2)).ingest(captor.capture());
        assertEquals(captor.getAllValues().get(0).path("eventId"),captor.getAllValues().get(1).path("eventId"));
    }
    @Test void missingCredentialDisablesReceiver() throws Exception {
        var c=new SloAlertController(mock(AuditIngestion.class),new Telemetry(OpenTelemetry.noop()),"");
        assertThrows(ResponseStatusException.class,()->c.receiveJson(null,new ObjectMapper().readTree("{\"alerts\":[]}")));
    }
}
