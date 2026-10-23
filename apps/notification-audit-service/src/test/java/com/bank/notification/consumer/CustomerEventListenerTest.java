package com.bank.notification.consumer;
import com.bank.notification.observability.Telemetry;
import com.bank.notification.service.AuditIngestion;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class CustomerEventListenerTest {
    @Test void consumerContinuesParentAndClosesMdc() {
        var spans=InMemorySpanExporter.create();
        try(var sdk=OpenTelemetrySdk.builder().setTracerProvider(SdkTracerProvider.builder().addSpanProcessor(SimpleSpanProcessor.create(spans)).build())
            .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance())).build()) {
            AuditIngestion ingestion=mock(AuditIngestion.class);when(ingestion.ingest(any())).thenReturn(true);
            var listener=new CustomerEventListener(ingestion,new Telemetry(sdk));
            var properties=new MessageProperties();properties.setHeader("traceparent","00-11111111111111111111111111111111-2222222222222222-01");
            listener.onMessage(new Message("{\"eventId\":\"evt-1\",\"eventType\":\"account.anomaly.detected\",\"correlationId\":\"corr-1\",\"payload\":{}}".getBytes(),properties));
            var span=spans.getFinishedSpanItems().get(0);assertEquals("11111111111111111111111111111111",span.getTraceId());
            assertEquals("2222222222222222",span.getParentSpanId());assertNull(org.slf4j.MDC.get("correlationId"));verify(ingestion).ingest(any());
        }
    }
    @Test void malformedEventIsRejectedWithoutPersisting() {
        AuditIngestion ingestion=mock(AuditIngestion.class);
        var listener=new CustomerEventListener(ingestion,new Telemetry(io.opentelemetry.api.OpenTelemetry.noop()));
        assertThrows(IllegalArgumentException.class,()->listener.onMessage(new Message("invalid".getBytes(),new MessageProperties())));verifyNoInteractions(ingestion);
    }
}
