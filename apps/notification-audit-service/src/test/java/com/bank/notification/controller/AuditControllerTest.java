package com.bank.notification.controller;
import com.bank.notification.repository.ProcessedEventRepository;
import com.bank.notification.model.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.web.server.ResponseStatusException;
import org.junit.jupiter.api.Test;
import java.time.OffsetDateTime;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class AuditControllerTest {
    @Test void pagedHistoryRetainsLegacyShapeAndSanitizesHistoricalSecrets() {
        var repo=mock(ProcessedEventRepository.class);var controller=new AuditController(repo);
        var event=new ProcessedEvent("old","customer.registered",1,"corr","{\"activationToken\":\"secret\",\"email\":\"private@example.com\",\"customerId\":\"CUST-1\"}",null,OffsetDateTime.now(),NotificationSeverity.INFO,"customer","Registro");
        when(repo.findAll(any(Specification.class),any(Pageable.class))).thenReturn(new PageImpl<>(List.of(event),PageRequest.of(2,20),61));
        var response=controller.getEvents("corr",null,null,null,null,2,20,true);
        var body=(AuditController.AuditPage)response.getBody();assertEquals(61,body.total());assertEquals(2,body.page());
        assertFalse(body.items().get(0).payload().containsKey("activationToken"));assertFalse(body.items().get(0).payload().containsKey("email"));assertNull(body.items().get(0).traceId());
        assertInstanceOf(List.class,controller.getEvents(null,null,null,null,null,0,20,false).getBody());
    }
    @Test void invalidFilterAndUnboundedPagesAreRejected() {
        var controller=new AuditController(mock(ProcessedEventRepository.class));
        assertThrows(ResponseStatusException.class,()->controller.getEvents(null,"bad-trace",null,null,null,0,20,true));
        assertThrows(ResponseStatusException.class,()->controller.getEvents(null,null,null,"BAD",null,0,20,true));
        assertThrows(ResponseStatusException.class,()->controller.getEvents(null,null,null,null,null,0,201,true));
    }
}
