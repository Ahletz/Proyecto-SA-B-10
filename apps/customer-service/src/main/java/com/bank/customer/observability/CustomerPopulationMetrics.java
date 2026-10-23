package com.bank.customer.observability;

import com.bank.customer.model.KycStatus;
import com.bank.customer.repository.CustomerRepository;
import io.opentelemetry.api.common.*;
import org.springframework.stereotype.Component;

/** Current population complements transition counters; no customer identifier is a label. */
@Component
public class CustomerPopulationMetrics {
    public CustomerPopulationMetrics(Telemetry telemetry, CustomerRepository repository) {
        telemetry.otel().getMeter("bank-usac").gaugeBuilder("bank.customer.kyc.current").ofLongs()
            .setDescription("Current customers by KYC state, read from Customer's own database")
            .buildWithCallback(observation -> {
                for (KycStatus state : new KycStatus[]{KycStatus.VERIFIED,KycStatus.REJECTED}) {
                    observation.record(repository.countByKycStatus(state),
                        Attributes.of(AttributeKey.stringKey("status"),state.name()));
                }
            });
    }
}
