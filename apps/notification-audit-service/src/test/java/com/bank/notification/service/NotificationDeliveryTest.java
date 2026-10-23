package com.bank.notification.service;
import com.bank.notification.model.NotificationOutbox;
import com.bank.notification.repository.NotificationOutboxRepository;
import com.bank.notification.publisher.NotificationEventPublisher;
import com.bank.notification.observability.Telemetry;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class NotificationDeliveryTest {
    @Test void smtpFailureKeepsTaskForRetryAndSuccessfulRetryPurgesSecret() {
        var repo=mock(NotificationOutboxRepository.class);var mail=mock(NotificationService.class);
        var manager=mock(PlatformTransactionManager.class);when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        var worker=new NotificationDelivery(repo,mock(NotificationEventPublisher.class),mail,new Telemetry(io.opentelemetry.api.OpenTelemetry.noop()),manager);
        ReflectionTestUtils.setField(worker,"batchSize",1);
        var task=new NotificationOutbox("evt:ACTIVATION","ACTIVATION","{\"email\":\"test@example.com\",\"username\":\"test\",\"token\":\"secret\"}","corr",null);
        when(repo.nextForDelivery()).thenReturn(List.of(task));
        doThrow(new IllegalStateException("SMTP down")).doNothing().when(mail).sendActivation(anyString(),anyString(),anyString());
        worker.drain();assertEquals("PENDING",task.status);assertEquals(1,task.attempts);assertTrue(task.body.contains("secret"));
        worker.drain();assertEquals("SENT",task.status);assertEquals("{}",task.body);
    }
}
