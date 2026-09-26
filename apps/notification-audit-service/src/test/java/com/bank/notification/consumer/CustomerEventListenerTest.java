package com.bank.notification.consumer;

import com.bank.notification.model.NotificationSeverity;
import com.bank.notification.model.ProcessedEvent;
import com.bank.notification.publisher.NotificationEventPublisher;
import com.bank.notification.repository.ProcessedEventRepository;
import com.bank.notification.service.EventClassificationService;
import com.bank.notification.service.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomerEventListenerTest {

    private ProcessedEventRepository repository;
    private NotificationService notifications;
    private NotificationEventPublisher publisher;
    private CustomerEventListener listener;

    @BeforeEach
    void setup() {
        repository =
            mock(ProcessedEventRepository.class);

        notifications =
            mock(NotificationService.class);

        publisher =
            mock(NotificationEventPublisher.class);

        listener = new CustomerEventListener(
            repository,
            notifications,
            new EventClassificationService(),
            publisher
        );
    }

    @Test
    void classifiesPersistsAndPublishesEvent() {

        when(repository.existsById("evt-1"))
            .thenReturn(false);

        String json = """
            {
              "eventId": "evt-1",
              "eventType": "payment.rejected",
              "version": 1,
              "timestamp": "2026-09-22T04:00:00Z",
              "correlationId": "corr-1",
              "payload": {
                "paymentId": "PAY-1",
                "transactionId": "TX-1",
                "status": "REJECTED",
                "reason": "EXTERNAL_FAILURE"
              }
            }
            """;

        listener.onMessage(
            json.getBytes(StandardCharsets.UTF_8)
        );

        ArgumentCaptor<ProcessedEvent> captor =
            ArgumentCaptor.forClass(
                ProcessedEvent.class
            );

        verify(repository).save(
            captor.capture()
        );

        ProcessedEvent saved =
            captor.getValue();

        assertEquals(
            NotificationSeverity.ERROR,
            saved.getSeverity()
        );

        assertEquals(
            "payment",
            saved.getOrigin()
        );

        assertEquals(
            "corr-1",
            saved.getCorrelationId()
        );

        verify(publisher)
            .publishClassified(
                eq("evt-1"),
                eq(NotificationSeverity.ERROR),
                eq("payment"),
                anyString(),
                eq("corr-1")
            );
    }

    @Test
    void duplicateEventIsIgnored() {

        when(repository.existsById("evt-2"))
            .thenReturn(true);

        String json = """
            {
              "eventId": "evt-2",
              "eventType": "account.created",
              "version": 1,
              "timestamp": "2026-09-22T04:00:00Z",
              "correlationId": "corr-2",
              "payload": {
                "accountId": "ACC-1",
                "customerId": "CUST-1"
              }
            }
            """;

        listener.onMessage(
            json.getBytes(StandardCharsets.UTF_8)
        );

        verify(repository, never())
            .save(any());

        verifyNoInteractions(
            publisher,
            notifications
        );
    }
}
