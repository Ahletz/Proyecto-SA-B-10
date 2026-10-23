package com.bank.customer.observability;

import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.exporter.otlp.http.metrics.OtlpHttpMetricExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.metrics.SdkMeterProvider;
import io.opentelemetry.sdk.metrics.export.PeriodicMetricReader;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import java.time.Duration;

@Configuration
public class TelemetryConfig {
    @Bean(destroyMethod = "close")
    OpenTelemetrySdk openTelemetry(Environment env) {
        Resource resource = Resource.getDefault().merge(Resource.create(Attributes.of(
            AttributeKey.stringKey("service.name"), "customer-service",
            AttributeKey.stringKey("deployment.environment"), env.getProperty("DEPLOY_ENV", "dev"),
            AttributeKey.stringKey("service.version"), env.getProperty("APP_VERSION", "local"))));
        var traces = SdkTracerProvider.builder().setResource(resource);
        var metrics = SdkMeterProvider.builder().setResource(resource);
        if (!env.getProperty("OTEL_SDK_DISABLED", Boolean.class, false)) {
            String endpoint = env.getProperty("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector.observability.svc.cluster.local:4318").replaceAll("/$", "");
            traces.addSpanProcessor(BatchSpanProcessor.builder(OtlpHttpSpanExporter.builder()
                .setEndpoint(endpoint + "/v1/traces").setTimeout(Duration.ofSeconds(3)).build()).build());
            metrics.registerMetricReader(PeriodicMetricReader.builder(OtlpHttpMetricExporter.builder()
                .setEndpoint(endpoint + "/v1/metrics").setTimeout(Duration.ofSeconds(3)).build())
                .setInterval(Duration.ofSeconds(10)).build());
        }
        return OpenTelemetrySdk.builder().setTracerProvider(traces.build()).setMeterProvider(metrics.build())
            .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance())).build();
    }
}
