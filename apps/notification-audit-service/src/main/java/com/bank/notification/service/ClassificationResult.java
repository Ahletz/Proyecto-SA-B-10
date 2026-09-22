package com.bank.notification.service;

import com.bank.notification.model.NotificationSeverity;

public record ClassificationResult(
    NotificationSeverity severity,
    String origin,
    String message
) {}
