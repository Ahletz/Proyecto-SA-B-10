package com.bank.notification.service;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.bank.notification.observability.SafeJsonFormatter;
import java.util.Set;
/** Allowlisted audit projection. Operational secrets never reach history or logs. */
public final class AuditPayload {
    private static final Set<String> FIELDS=Set.of("customerId","accountId","transactionId","interbankTransferId","paymentId","sourceAccount","targetAccount","amount","currency","status","state","estado","estadoAnterior","estadoNuevo","reason","reasonCode","operationCount","threshold","windowMinutes","detectedAt","originBankCode","destinationBankCode","alertname","alertStatus","severity","serviceName");
    public static ObjectNode sanitize(JsonNode input) {
        ObjectNode result=new ObjectMapper().createObjectNode();
        if(input!=null && input.isObject()) input.properties().forEach(e -> {
            if(FIELDS.contains(e.getKey()) && e.getValue().isValueNode()) {
                if(e.getValue().isTextual()) result.put(e.getKey(),SafeJsonFormatter.redact(e.getValue().asText()).substring(0,Math.min(200,SafeJsonFormatter.redact(e.getValue().asText()).length())));
                else result.set(e.getKey(),e.getValue());
            }
        });
        return result;
    }
    public static String service(String eventType) {
        if(eventType.equals("transaction.transfer.requested")||eventType.equals("transaction.interbank.requested")) return "api-gateway";
        String domain=eventType.split("[.]",2)[0];
        return switch(domain) {
            case "customer","account","transaction","payment" -> domain+"-service";
            case "interbank" -> "payment-service";
            case "slo" -> "alertmanager";
            default -> "notification-audit-service";
        };
    }
}
