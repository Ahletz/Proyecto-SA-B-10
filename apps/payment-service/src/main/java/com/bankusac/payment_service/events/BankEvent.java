package com.bankusac.payment_service.events;

import java.time.Instant;
import java.util.UUID;

public class BankEvent<T> {

    private String eventId;
    private String eventType;
    private int version;
    private Instant timestamp;
    private String correlationId;
    private T payload;

    public BankEvent() {
    }

    public BankEvent(String eventType, String correlationId, T payload) {
        this.eventId = UUID.randomUUID().toString();
        this.eventType = eventType;
        this.version = 1;
        this.timestamp = Instant.now();
        this.correlationId = correlationId;
        this.payload = payload;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public void setCorrelationId(String correlationId) {
        this.correlationId = correlationId;
    }

    public T getPayload() {
        return payload;
    }

    public void setPayload(T payload) {
        this.payload = payload;
    }
}