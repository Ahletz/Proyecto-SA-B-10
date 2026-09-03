package com.bank.notification.repository;

import com.bank.notification.model.ProcessedEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, String> {
	List<ProcessedEvent> findTop200ByOrderByProcessedAtDesc();
}
