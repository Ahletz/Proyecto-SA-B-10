package com.bank.customer.config;

import com.bank.customer.model.Customer;
import com.bank.customer.repository.CustomerRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.LocalDate;

@Configuration
public class DemoUsersConfig {
    @Bean
    CommandLineRunner seedDemoUsers(CustomerRepository repo, PasswordEncoder encoder) {
        return args -> {
            boolean enabled=Boolean.parseBoolean(System.getenv().getOrDefault("SEED_DEMO_USERS","true"));
            if(!enabled) return;
            createIfMissing(repo,encoder,"admin","admin@bankusac.local",System.getenv().getOrDefault("DEMO_ADMIN_PASSWORD","Admin123!"),"ADMIN","ADMIN-DEMO","Administrador Bank USAC");
            createIfMissing(repo,encoder,"cashier","cashier@bankusac.local",System.getenv().getOrDefault("DEMO_CASHIER_PASSWORD","Cashier123!"),"CASHIER","CASHIER-DEMO","Cajero Receptor Demo");
        };
    }
    private void createIfMissing(CustomerRepository repo, PasswordEncoder encoder, String username, String email, String password, String role, String document, String name) {
        if(repo.findByUsername(username).isPresent()) return;
        Customer c=new Customer(); c.setUsername(username); c.setEmail(email); c.setPassword(encoder.encode(password)); c.setStatus("ACTIVE"); c.setRole(role); c.setIdentityStatus("VALIDATED");
        c.setFullName(name); c.setDocumentNumber(document); c.setDocumentPhoto("demo-seeded-user.png"); c.setBirthDate(LocalDate.of(1990,1,1)); c.setAddress("Ciudad de Guatemala");
        repo.save(c);
    }
}
