package com.bank.customer.model;

import jakarta.persistence.*;

@Entity
@Table(name = "customers")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false)
    private String status; // PENDING_ACTIVATION, ACTIVE, INACTIVE

    @Column(name = "activation_token", unique = true)
    private String activationToken;

    public Customer() {}

    public Customer(String email, String username, String password, String status) {
        this.email = email;
        this.username = username;
        this.password = password;
        this.status = status;
    }

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getUsername() { return username; }
    public String getPassword() { return password; }
    public String getStatus() { return status; }
    public String getActivationToken() { return activationToken; }

    public void setEmail(String email) { this.email = email; }
    public void setUsername(String username) { this.username = username; }
    public void setStatus(String status) { this.status = status; }
    public void setActivationToken(String activationToken) { this.activationToken = activationToken; }
}
