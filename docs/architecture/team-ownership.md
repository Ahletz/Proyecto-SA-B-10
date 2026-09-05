# Ownership y metodología de trabajo

Completar nombres/carnés antes de entregar.

| Integrante | Ownership principal | Evidencia esperada |
|---|---|---|
| Integrante 1 | Customer, Notification/Audit, autenticación y parte de frontend | commits, tests, eventos customer.*, correo y auditoría |
| Integrante 2 | Account, Payment y casos asociados | commits, account.*, payment.*, reservas y saldos |
| Integrante 3 | Transaction, Saga, API Gateway, integración, E2E y despliegue | commits, transaction.*, Gateway, K8s, smoke test |

## Metodología
Se usa GitFlow simplificado: `main` estable, `develop` integración y `feature/*` por responsabilidad. Cada feature debe incluir pruebas y documentación contractual antes de integrarse. La sustentación es grupal, pero cada integrante debe poder explicar el servicio bajo su ownership y cómo se integra de forma asíncrona.
