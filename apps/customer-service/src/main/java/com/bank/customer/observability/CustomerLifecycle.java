package com.bank.customer.observability;

import com.bank.customer.model.*;
import io.opentelemetry.api.common.*;
import io.opentelemetry.api.metrics.*;
import io.opentelemetry.context.Context;
import org.slf4j.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.*;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;

@Component
public class CustomerLifecycle {
    private final Telemetry telemetry;
    private final LongCounter transitions;
    private final DoubleHistogram verification;
    private static final Logger log = LoggerFactory.getLogger(CustomerLifecycle.class);
    public CustomerLifecycle(Telemetry telemetry) {
        this.telemetry = telemetry;
        Meter meter = telemetry.otel().getMeter("bank-usac");
        transitions = meter.counterBuilder("bank.customer.kyc").setDescription("Committed KYC transitions by state").build();
        verification = meter.histogramBuilder("bank.customer.kyc.verification.duration").setUnit("s")
            .setDescription("Seconds from registration to first successful KYC")
            .setExplicitBucketBoundariesAdvice(List.of(1.0,5.0,30.0,60.0,300.0,1800.0,3600.0,86400.0)).build();
    }
    public <T> T observe(Customer c, String requestCorrelationId, String operation, Supplier<T> action) {
        if (c.getLifecycleCorrelationId() == null) c.setLifecycleCorrelationId(
            requestCorrelationId == null || requestCorrelationId.isBlank() ? UUID.randomUUID().toString() : requestCorrelationId);
        Context parent = c.getLifecycleTraceparent() == null ? Context.current()
            : telemetry.extract(Map.of("traceparent", c.getLifecycleTraceparent()));
        return telemetry.span(operation, parent, c.getLifecycleCorrelationId(), () -> {
            if (c.getLifecycleTraceparent() == null) c.setLifecycleTraceparent(telemetry.headers().get("traceparent"));
            return action.get();
        });
    }
    public void changed(Customer c, String event, KycStatus status, boolean firstVerification) {
        Runnable record = () -> {
            if (status != null && status != KycStatus.PENDING) transitions.add(1, Attributes.of(AttributeKey.stringKey("status"), status.name()));
            if (firstVerification) verification.record(Math.max(0, Duration.between(c.getCreatedAt(), c.getKycVerifiedAt()).toMillis()/1000.0));
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { record.run(); }
        }); else record.run();
        try (var a = MDC.putCloseable("event", event); var b = MDC.putCloseable("customerId", "CUST-"+c.getId())) {
            log.info("Customer lifecycle state changed: {}", status == null ? event : status.name());
        }
    }
}
