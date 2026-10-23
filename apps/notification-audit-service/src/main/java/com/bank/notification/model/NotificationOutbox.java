package com.bank.notification.model;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
@Entity @Table(name="notification_outbox", indexes=@Index(name="notification_outbox_due_idx",columnList="status,next_attempt_at"))
public class NotificationOutbox {
    @Id @Column(length=160) public String id;
    @Column(nullable=false,length=30) public String kind;
    @Column(nullable=false,columnDefinition="TEXT") public String body;
    @Column(nullable=false,length=20) public String status="PENDING";
    @Column(nullable=false) public int attempts;
    @Column(nullable=false) public OffsetDateTime createdAt=OffsetDateTime.now();
    @Column(nullable=false) public OffsetDateTime nextAttemptAt=OffsetDateTime.now();
    @Column(length=128) public String correlationId;
    @Column(length=55) public String traceparent;
    public NotificationOutbox() {}
    public NotificationOutbox(String id,String kind,String body,String cid,String parent) {
        this.id=id;this.kind=kind;this.body=body;this.correlationId=cid;this.traceparent=parent;
    }
}
