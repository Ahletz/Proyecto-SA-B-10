# Terraform — Infraestructura Cloud SQL (Fase 2)

## Qué provisiona

- VPC privada (`bank-usac-vpc`) + subred en `us-central1`
- Conexión de red privada (VPC peering) para Cloud SQL
- 5 instancias de Cloud SQL (PostgreSQL 17, edición Enterprise, tier `db-f1-micro`), una por microservicio

## Cómo aplicar

```bash
cd infrastructure/terraform
terraform init
terraform apply -var="db_password=<contraseña>"
```

La contraseña se comparte por canal privado del equipo, no se commitea.

## IPs asignadas (referencia)

| Servicio | IP privada | IP pública |
|---|---|---|
| customer | 10.232.0.7 | 34.132.236.106 |
| account | 10.232.0.10 | 136.111.247.160 |
| transaction | 10.232.0.8 | 136.119.215.230 |
| payment | 10.232.0.11 | 136.115.216.109 |
| notification | 10.232.0.9 | 34.16.59.193 |

Para conectarse desde un cluster de GKE en la misma VPC (`bank-usac-vpc`), usar la **IP privada**. La IP pública es de respaldo/debug.

## Usuarios y bases de datos

Mismos nombres que en `infrastructure/docker-compose.yml` (entorno local): `customer_user`/`bank_customer`, `account_user`/`bank_account`, etc.
