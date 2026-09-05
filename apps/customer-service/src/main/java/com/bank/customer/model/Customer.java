package com.bank.customer.model;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "customers")
public class Customer {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true) private String email;
    @Column(nullable = false, unique = true) private String username;
    @Column(nullable = false) private String password;
    @Column(nullable = false) private String status;
    @Column(nullable = false) private String role;
    @Column(name = "identity_status", nullable = false) private String identityStatus;
    @Column(name = "full_name", nullable = false) private String fullName;
    @Column(name = "document_number", nullable = false, unique = true) private String documentNumber;
    @Column(name = "document_photo", nullable = false, length = 4096) private String documentPhoto;
    @Column(name = "birth_date", nullable = false) private LocalDate birthDate;
    @Column(nullable = false, length = 500) private String address;
    @Column(name = "created_at", nullable = false) private OffsetDateTime createdAt = OffsetDateTime.now();
    @Column(name = "activation_token", unique = true) private String activationToken;

    public Customer() {}

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getUsername() { return username; }
    public String getPassword() { return password; }
    public String getStatus() { return status; }
    public String getRole() { return role; }
    public String getIdentityStatus() { return identityStatus; }
    public String getFullName() { return fullName; }
    public String getDocumentNumber() { return documentNumber; }
    public String getDocumentPhoto() { return documentPhoto; }
    public LocalDate getBirthDate() { return birthDate; }
    public String getAddress() { return address; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getActivationToken() { return activationToken; }

    public void setEmail(String v) { email = v; }
    public void setUsername(String v) { username = v; }
    public void setPassword(String v) { password = v; }
    public void setStatus(String v) { status = v; }
    public void setRole(String v) { role = v; }
    public void setIdentityStatus(String v) { identityStatus = v; }
    public void setFullName(String v) { fullName = v; }
    public void setDocumentNumber(String v) { documentNumber = v; }
    public void setDocumentPhoto(String v) { documentPhoto = v; }
    public void setBirthDate(LocalDate v) { birthDate = v; }
    public void setAddress(String v) { address = v; }
    public void setCreatedAt(OffsetDateTime v) { createdAt = v; }
    public void setActivationToken(String v) { activationToken = v; }
}
