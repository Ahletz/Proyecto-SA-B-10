package com.bankusac.account_service.service;

import com.bankusac.account_service.exception.BankException;
import com.bankusac.account_service.model.Account;
import com.bankusac.account_service.model.AccountStatus;
import com.bankusac.account_service.model.AccountType;
import com.bankusac.account_service.repository.AccountRepository;
import com.bankusac.account_service.repository.ProcessedEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

// pruebas unitarias de la logica de negocio de Account Service
// se usan mocks para no depender de una base de datos real
@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private RabbitTemplate rabbitTemplate;

    @Mock
    private ProcessedEventRepository processedEventRepository;

    @InjectMocks
    private AccountService accountService;

    private UUID customerId;
    private UUID accountId;

    @BeforeEach
    void setUp() {
        customerId = UUID.randomUUID();
        accountId = UUID.randomUUID();
    }

    @Test
    void createAccount_deberiaGuardarCuentaConValoresIniciales() {
        // preparamos que el repository devuelva lo mismo que le pasan al guardar
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> inv.getArgument(0));

        Account cuenta = accountService.createAccount(customerId, AccountType.MONETARIA, new BigDecimal("1000.00"));

        assertEquals(customerId, cuenta.getCustomerId());
        assertEquals(AccountType.MONETARIA, cuenta.getAccountType());
        assertEquals(new BigDecimal("1000.00"), cuenta.getBalance());
        assertEquals(BigDecimal.ZERO, cuenta.getReservedAmount());
        assertEquals(AccountStatus.ACTIVE, cuenta.getStatus());
        verify(accountRepository, times(1)).save(any(Account.class));
    }

    @Test
    void getAvailableBalance_deberiaRestarElMontoReservado() {
        Account cuenta = new Account(customerId, AccountType.MONETARIA, new BigDecimal("1000.00"));
        cuenta.setReservedAmount(new BigDecimal("300.00"));
        when(accountRepository.findById(accountId)).thenReturn(Optional.of(cuenta));

        BigDecimal disponible = accountService.getAvailableBalance(accountId);

        assertEquals(new BigDecimal("700.00"), disponible);
    }

    @Test
    void getAvailableBalance_deberiaLanzarErrorSiLaCuentaNoExiste() {
        when(accountRepository.findById(accountId)).thenReturn(Optional.empty());

        BankException ex = assertThrows(BankException.class, () -> accountService.getAvailableBalance(accountId));
        assertEquals("cuenta no encontrada", ex.getMessage());
    }

    @Test
    void reserveFunds_deberiaLanzarErrorSiNoHayFondosSuficientes() {
        Account cuenta = new Account(customerId, AccountType.MONETARIA, new BigDecimal("100.00"));
        when(accountRepository.findById(accountId)).thenReturn(Optional.of(cuenta));
        when(processedEventRepository.existsById(anyString())).thenReturn(false);

        UUID transactionId = UUID.randomUUID();
        UUID targetAccountId = UUID.randomUUID();

        BankException ex = assertThrows(BankException.class, () ->
                accountService.reserveFunds("evt-1", transactionId, accountId, targetAccountId, new BigDecimal("500.00"), "corr-1")
        );
        assertEquals("fondos insuficientes", ex.getMessage());
    }

    @Test
    void reserveFunds_noDeberiaProcesarSiElEventoYaFueProcesado() {
        when(processedEventRepository.existsById("evt-1")).thenReturn(true);

        accountService.reserveFunds("evt-1", UUID.randomUUID(), accountId, UUID.randomUUID(), new BigDecimal("100.00"), "corr-1");

        // como el evento ya fue procesado, nunca deberia consultar la cuenta
        verify(accountRepository, never()).findById(any());
    }

    @Test
    void applyTransfer_deberiaMoverElDineroEntreCuentas() {
        Account origen = new Account(customerId, AccountType.MONETARIA, new BigDecimal("1000.00"));
        origen.setReservedAmount(new BigDecimal("300.00"));
        Account destino = new Account(UUID.randomUUID(), AccountType.MONETARIA, new BigDecimal("500.00"));

        UUID origenId = UUID.randomUUID();
        UUID destinoId = UUID.randomUUID();

        when(accountRepository.findById(origenId)).thenReturn(Optional.of(origen));
        when(accountRepository.findById(destinoId)).thenReturn(Optional.of(destino));

        accountService.applyTransfer(origenId, destinoId, new BigDecimal("300.00"));

        assertEquals(new BigDecimal("700.00"), origen.getBalance());
        assertEquals(0, BigDecimal.ZERO.compareTo(origen.getReservedAmount()));
        assertEquals(new BigDecimal("800.00"), destino.getBalance());
    }

    @Test
    void desactivarSiAplica_deberiaDesactivarCuentaConBajoBalanceYSinActividad() {
        Account cuenta = new Account(customerId, AccountType.AHORRO, new BigDecimal("30.00"));
        cuenta.setLastActivityDate(LocalDateTime.now().minusMonths(7));
        when(accountRepository.findById(accountId)).thenReturn(Optional.of(cuenta));

        accountService.desactivarSiAplica(accountId);

        assertEquals(AccountStatus.INACTIVE, cuenta.getStatus());
        verify(accountRepository, times(1)).save(cuenta);
    }

    @Test
    void desactivarSiAplica_noDeberiaDesactivarSiTieneBalanceSuficiente() {
        Account cuenta = new Account(customerId, AccountType.AHORRO, new BigDecimal("500.00"));
        cuenta.setLastActivityDate(LocalDateTime.now().minusMonths(7));
        when(accountRepository.findById(accountId)).thenReturn(Optional.of(cuenta));

        accountService.desactivarSiAplica(accountId);

        assertEquals(AccountStatus.ACTIVE, cuenta.getStatus());
        verify(accountRepository, never()).save(any());
    }
}
