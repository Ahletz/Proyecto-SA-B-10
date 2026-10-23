package com.bank.notification.repository;
import com.bank.notification.model.NotificationOutbox;
import org.springframework.data.jpa.repository.*;
import java.util.List;
public interface NotificationOutboxRepository extends JpaRepository<NotificationOutbox,String> {
    @Query(value="SELECT * FROM notification_outbox WHERE status='PENDING' AND next_attempt_at <= CURRENT_TIMESTAMP ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",nativeQuery=true)
    List<NotificationOutbox> nextForDelivery();
}
