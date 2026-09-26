package com.bank.notification.service;

import com.bank.notification.model.NotificationSeverity;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class EventClassificationServiceTest {

    private final EventClassificationService service =
        new EventClassificationService();

    private final ObjectMapper mapper =
        new ObjectMapper();

    @Test
    void verifiedKycIsInfo() throws Exception {
        var payload = mapper.readTree("""
            {
              "customerId": "CUST-1",
              "estadoNuevo": "VERIFIED"
            }
            """);

        var result = service.classify(
            "customer.kyc.status.changed",
            payload
        );

        assertEquals(
            NotificationSeverity.INFO,
            result.severity()
        );

        assertEquals(
            "customer",
            result.origin()
        );
    }

    @Test
    void rejectedKycIsWarning() throws Exception {
        var payload = mapper.readTree("""
            {
              "customerId": "CUST-1",
              "estadoNuevo": "REJECTED"
            }
            """);

        var result = service.classify(
            "customer.kyc.status.changed",
            payload
        );

        assertEquals(
            NotificationSeverity.WARNING,
            result.severity()
        );
    }

    @Test
    void paymentFailureIsError() throws Exception {
        var payload = mapper.readTree("""
            {
              "paymentId": "PAY-1",
              "status": "REJECTED",
              "reason": "EXTERNAL_FAILURE"
            }
            """);

        var result = service.classify(
            "payment.rejected",
            payload
        );

        assertEquals(
            NotificationSeverity.ERROR,
            result.severity()
        );
    }

    @Test
    void paymentTimeoutIsWarning() throws Exception {
        var payload = mapper.readTree("""
            {
              "paymentId": "PAY-1",
              "status": "REJECTED",
              "reason": "TIMEOUT"
            }
            """);

        var result = service.classify(
            "payment.rejected",
            payload
        );

        assertEquals(
            NotificationSeverity.WARNING,
            result.severity()
        );
    }

    @Test
    void failedTransactionIsError()
            throws Exception {

        var payload = mapper.readTree("""
            {
              "transactionId": "TX-1",
              "estado": "FAILED"
            }
            """);

        var result = service.classify(
            "transaction.status.changed",
            payload
        );

        assertEquals(
            NotificationSeverity.ERROR,
            result.severity()
        );
    }

    @Test
    void accountCreatedIsInfo()
            throws Exception {

        var payload = mapper.readTree("""
            {
              "accountId": "ACC-1",
              "customerId": "CUST-1"
            }
            """);

        var result = service.classify(
            "account.created",
            payload
        );

        assertEquals(
            NotificationSeverity.INFO,
            result.severity()
        );

        assertEquals(
            "account",
            result.origin()
        );
    }

    @Test
    void rejectedFundsIsWarning()
            throws Exception {

        var payload = mapper.readTree("""
            {
              "transactionId": "TX-1",
              "reason": "INSUFFICIENT_FUNDS"
            }
            """);

        var result = service.classify(
            "account.funds.rejected",
            payload
        );

        assertEquals(
            NotificationSeverity.WARNING,
            result.severity()
        );
    }

    @Test
    void compensatedTransactionIsWarning()
            throws Exception {

        var payload = mapper.readTree("""
            {
              "transactionId": "TX-1",
              "status": "COMPENSATED",
              "reason": "PAYMENT_TIMEOUT"
            }
            """);

        var result = service.classify(
            "transaction.compensated",
            payload
        );

        assertEquals(
            NotificationSeverity.WARNING,
            result.severity()
        );
    }
}
