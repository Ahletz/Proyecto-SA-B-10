package com.bankusac.payment_service.service;

import com.bankusac.payment_service.model.Payment;
import com.bankusac.payment_service.model.PaymentStatus;
import com.bankusac.payment_service.repository.PaymentRepository;
import com.bankusac.payment_service.repository.ProcessedEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

// pruebas unitarias de la logica de negocio de Payment Service
@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private ProcessedEventRepository processedEventRepository;

    @Mock
    private RabbitTemplate rabbitTemplate;

    @InjectMocks
    private PaymentService paymentService;

    private UUID transactionId;

    @BeforeEach
    void setUp() {
        transactionId = UUID.randomUUID();
    }

    @Test
    void processPayment_deberiaAprobarSiElMontoEsValido() {
        when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));

        Payment pago = paymentService.processPayment(transactionId, new BigDecimal("500.00"));

        assertEquals(PaymentStatus.APPROVED, pago.getStatus());
        assertNull(pago.getReason());
    }

    @Test
    void processPayment_deberiaRechazarSiElMontoEsCero() {
        when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));

        Payment pago = paymentService.processPayment(transactionId, BigDecimal.ZERO);

        assertEquals(PaymentStatus.REJECTED, pago.getStatus());
        assertEquals("PAYMENT_VALIDATION_FAILED", pago.getReason());
    }

    @Test
    void processPayment_deberiaRechazarSiElMontoEsNegativo() {
        when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));

        Payment pago = paymentService.processPayment(transactionId, new BigDecimal("-100.00"));

        assertEquals(PaymentStatus.REJECTED, pago.getStatus());
    }

    @Test
    void handleFundsReserved_deberiaPublicarPaymentApprovedSiElMontoEsValido() {
        when(processedEventRepository.existsById("evt-1")).thenReturn(false);

        paymentService.handleFundsReserved("evt-1", transactionId, new BigDecimal("500.00"), "corr-1");

        verify(rabbitTemplate, times(1)).convertAndSend(anyString(), eq("payment.approved"), any(Object.class));
        verify(processedEventRepository, times(1)).save(any());
    }

    @Test
    void handleFundsReserved_deberiaPublicarPaymentRejectedSiElMontoEsInvalido() {
        when(processedEventRepository.existsById("evt-2")).thenReturn(false);

        paymentService.handleFundsReserved("evt-2", transactionId, BigDecimal.ZERO, "corr-2");

        verify(rabbitTemplate, times(1)).convertAndSend(anyString(), eq("payment.rejected"), any(Object.class));
    }

    @Test
    void handleFundsReserved_noDeberiaProcesarSiElEventoYaFueProcesado() {
        when(processedEventRepository.existsById("evt-3")).thenReturn(true);

        paymentService.handleFundsReserved("evt-3", transactionId, new BigDecimal("500.00"), "corr-3");

        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void getAllPayments_deberiaRetornarTodosLosPagos() {
        when(paymentRepository.findAllByOrderByPaymentIdDesc()).thenReturn(java.util.List.of(
                new Payment(transactionId, new BigDecimal("500.00"))
        ));

        var pagos = paymentService.getAllPayments();

        assertEquals(1, pagos.size());
    }
}
