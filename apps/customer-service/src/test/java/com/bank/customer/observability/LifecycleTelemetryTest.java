package com.bank.customer.observability;

import com.bank.customer.model.*;
import com.bank.customer.publisher.EventPublisher;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import io.opentelemetry.sdk.metrics.SdkMeterProvider;
import io.opentelemetry.sdk.testing.exporter.*;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.context.propagation.ContextPropagators;
import org.junit.jupiter.api.*;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.core.*;
import org.springframework.mock.web.*;
import java.time.OffsetDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LifecycleTelemetryTest {
    InMemorySpanExporter spans;
    InMemoryMetricReader metrics;
    OpenTelemetrySdk sdk;
    Telemetry telemetry;
    @BeforeEach void setup() {
        spans = InMemorySpanExporter.create();metrics = InMemoryMetricReader.create();
        sdk = OpenTelemetrySdk.builder()
            .setTracerProvider(SdkTracerProvider.builder().addSpanProcessor(SimpleSpanProcessor.create(spans)).build())
            .setMeterProvider(SdkMeterProvider.builder().registerMetricReader(metrics).build())
            .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance())).build();
        telemetry = new Telemetry(sdk);
    }
    @AfterEach void close() { sdk.close(); }
    @Test void laterKycContinuesRegistrationAndMeasuresFirstVerification() {
        var lifecycle = new CustomerLifecycle(telemetry);var c = new Customer();
        lifecycle.observe(c,"lifecycle-123","customer.register", () -> true);
        c.setKycVerifiedAt(OffsetDateTime.now());
        lifecycle.observe(c,"different-admin-request","customer.kyc.update", () -> {
            lifecycle.changed(c,"customer.kyc.status.changed",KycStatus.VERIFIED,true);return true;
        });
        assertEquals("lifecycle-123",c.getLifecycleCorrelationId());
        var finished = spans.getFinishedSpanItems();
        assertEquals(2,finished.size());assertEquals(finished.get(0).getTraceId(),finished.get(1).getTraceId());
        assertEquals(finished.get(0).getSpanId(),finished.get(1).getParentSpanId());
        var counter = metrics.collectAllMetrics().stream().filter(m -> m.getName().equals("bank.customer.kyc")).findFirst().orElseThrow();
        assertEquals(1,counter.getLongSumData().getPoints().iterator().next().getValue());
        var histogram = metrics.collectAllMetrics().stream().filter(m -> m.getName().endsWith("verification.duration")).findFirst().orElseThrow();
        assertEquals(1,histogram.getHistogramData().getPoints().iterator().next().getCount());
    }
    @Test void publisherInjectsRealW3cContextWithoutSensitiveAttributes() {
        RabbitTemplate rabbit = mock(RabbitTemplate.class);
        final Map<String,Object> headers = new HashMap<>();
        doAnswer(call -> {
            MessagePostProcessor post = call.getArgument(3);
            headers.putAll(post.postProcessMessage(new Message(new byte[0],new MessageProperties())).getMessageProperties().getHeaders());
            return null;
        }).when(rabbit).convertAndSend(anyString(),anyString(),any(Object.class),any(MessagePostProcessor.class));
        new EventPublisher(rabbit,telemetry).publish("customer.registered", Map.of("email","private@example.com","activationToken","secret"),"corr-test");
        assertTrue(String.valueOf(headers.get("traceparent")).matches("00-[0-9a-f]{32}-[0-9a-f]{16}-01"));
        assertEquals("corr-test",headers.get("correlationId"));
        assertFalse(spans.getFinishedSpanItems().toString().contains("private@example.com"));
        assertEquals(io.opentelemetry.api.trace.SpanKind.PRODUCER,spans.getFinishedSpanItems().get(0).getKind());
    }
    @Test void httpTraceRespectsRemoteParentAndOmitsActivationToken() throws Exception {
        var request = new MockHttpServletRequest("GET","/api/customers/activate/secret-value");
        request.addHeader("traceparent","00-11111111111111111111111111111111-2222222222222222-01");
        request.addHeader("X-Correlation-Id","corr-http");var response = new MockHttpServletResponse();
        new RequestTracingFilter(telemetry).doFilter(request,response,(req,res) -> {});
        var span = spans.getFinishedSpanItems().get(0);
        assertEquals("11111111111111111111111111111111",span.getTraceId());
        assertFalse(span.getName().contains("secret-value"));
        assertEquals("corr-http",response.getHeader("X-Correlation-Id"));
        assertNull(org.slf4j.MDC.get("correlationId"));
    }
    @Test void secretsAreRedacted() {
        String safe = SafeJsonFormatter.redact("a.person@example.com Bearer abc.def.ghi documentNumber=1234567890123 activationToken=secret /activate/private");
        for (String value : List.of("a.person@example.com","abc.def.ghi","1234567890123","=secret","/private")) assertFalse(safe.contains(value),safe);
    }
}
