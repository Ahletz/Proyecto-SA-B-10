package com.bank.notification.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private final JavaMailSender mailSender;
    @Value("${bank.frontend-url:http://localhost:3000}") private String frontendUrl;
    @Value("${spring.mail.username:no-reply@bankusac.local}") private String from;

    public NotificationService(JavaMailSender mailSender) { this.mailSender = mailSender; }

    public void sendActivation(String email, String username, String token) {
        SimpleMailMessage m = new SimpleMailMessage();
        m.setFrom(from); m.setTo(email); m.setSubject("Bank USAC - Activación de cuenta");
        m.setText("Hola " + username + ",\n\nActiva tu cuenta en:\n" + frontendUrl + "/activate?token=" + token + "\n\nBank USAC");
        mailSender.send(m);
        log.info("Activation notification sent to {}", email);
    }

    public void sendTransferReceived(String email, String correlationId, double amount) {
        if (email == null || email.isBlank()) return;
        SimpleMailMessage m = new SimpleMailMessage();
        m.setFrom(from); m.setTo(email); m.setSubject("Bank USAC - Transferencia recibida");
        m.setText("Se recibió una solicitud de transferencia por Q" + amount + ".\nCorrelationId: " + correlationId + "\nEl procesamiento continuará de forma asíncrona.");
        mailSender.send(m);
        log.info("Transfer notification sent to {} correlationId={}", email, correlationId);
    }
}
