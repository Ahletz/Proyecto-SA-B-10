# Frontend Bank USAC

Aplicación web (React 18, TypeScript, Vite y Tailwind CSS) para clientes, cajeros y administradores. Solo habla con el API Gateway; no llama a los microservicios.

## Funcionalidades por rol

| Página | Ruta | Roles |
|---|---|---|
| Inicio (portada pública sin sesión) | `/` | todos |
| Registro, activación y login | `/register`, `/activate`, `/login` | público |
| Perfil | `/profile` | autenticado |
| Cuentas (crear y consultar saldos) | `/accounts` | CLIENT, CASHIER, ADMIN |
| Transferir con seguimiento por `correlationId` y `traceId` | `/transfer` | CLIENT |
| Otro banco: depósito interbancario y consulta de su estado | `/interbank` | CLIENT |
| Historial con filtros por fecha y estado | `/transactions` | autenticado |
| Pagos | `/payments` | CASHIER, ADMIN |
| Clientes y revisión de KYC | `/customers` | ADMIN |
| Notificaciones | `/notifications` | ADMIN |
| Auditoría paginada con filtros por `correlationId` y `traceId` | `/audit` | ADMIN |

El menú muestra solo las opciones del rol y el control real de acceso lo hace el Gateway. Guía de uso: [manual de usuario](../../docs/08-manuales/01-manual-usuario.md).

## Requisitos

- Node.js 22 y npm.
- Un API Gateway accesible (por defecto `http://localhost:8080`).

## Ejecución

```bash
npm install
npm run dev
```

La aplicación queda en `http://localhost:3000`. La URL del Gateway se toma de `VITE_API_BASE_URL`; si está vacía, las llamadas van al mismo origen (`/api/...`).

### Otros comandos

```bash
npm run build       # tsc + vite build
npm run type-check
npm run lint        # ESLint con --max-warnings 0
npm test            # Vitest
```

### Docker

```bash
docker build -t bank-usac-frontend:local .
docker run -p 3000:3000 bank-usac-frontend:local
```

La imagen sirve la SPA con nginx en el puerto 3000. Si se define `API_UPSTREAM` (producción en Cloud Run), nginx reenvía `/api` al Gateway, así el navegador usa un solo origen HTTPS y no hay contenido mixto ni CORS ([ADR-015](../../docs/01-arquitectura/05-decisiones-arquitectura.md)).

## Estructura

```
src/
├── pages/        # una página por ruta (Accounts, Transfer, InterbankTransfer, Audit, ...)
├── components/   # AppLayout, AuthLayout, ProtectedRoute y componentes de UI
├── lib/          # cliente HTTP, formato, estados de transferencia e interbancarios
├── store/        # Zustand: sesión (authStore) y auditoría (auditStore)
├── App.tsx       # rutas y roles
└── main.tsx
```

## Sesión

El JWT se guarda en `localStorage` bajo la clave `token`, con acceso centralizado en `useAuthStore`, y se envía en el header `Authorization` de cada llamada protegida.

## Trazabilidad

Cada transferencia y cada depósito interbancario muestran su `correlationId` y su `traceId`, con botón para copiarlos. El `traceId` abre la operación completa en Tempo y la auditoría se filtra por cualquiera de los dos.
