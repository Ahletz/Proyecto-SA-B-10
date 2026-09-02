package com.bankusac.account_service.repository;

import com.bankusac.account_service.model.ProcessedEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, String> {
    // existsById ya viene incluido gratis por JpaRepository
    // lo usaremos para revisar si un eventId ya fue procesado
}