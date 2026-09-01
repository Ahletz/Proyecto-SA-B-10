package com.bankusac.account_service.repository;

import com.bankusac.account_service.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

// el bibliotecario que habla con la base de datos por nosotros
// JpaRepository ya trae solo los metodos basicos: guardar, buscar por id, borrar, listar todos
@Repository
public interface AccountRepository extends JpaRepository<Account, UUID> {

}
