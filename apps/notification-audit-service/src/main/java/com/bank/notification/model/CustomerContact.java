package com.bank.notification.model;
import jakarta.persistence.*;
@Entity @Table(name="notification_customer_contacts")
public class CustomerContact {
    @Id @Column(length=128) public String customerId;
    @Column(nullable=false) public String email;
    @Column(nullable=false) public java.time.OffsetDateTime updatedAt=java.time.OffsetDateTime.now();
    public CustomerContact() {}
    public CustomerContact(String id,String email) { this.customerId=id;this.email=email; }
}
