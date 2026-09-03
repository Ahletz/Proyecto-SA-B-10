# Frontend USAC

Frontend web moderno para el sistema de gestión bancaria USAC, desarrollado con **React 18**, **TypeScript**, **Vite** y **Tailwind CSS**.

## 🎯 Características

- **Autenticación JWT**: Registro, login, activación por correo electrónico
- **Gestión de Perfil**: Actualización de información personal y cambio de contraseña
- **Panel de Auditoría**: Visualización de eventos procesados en tiempo real
- **Interfaz Responsiva**: Diseño moderno y adaptable a todos los dispositivos
- **State Management**: Zustand para gestión de estado simplificada
- **Rutas Protegidas**: Control de acceso con tokens JWT

## 📋 Requisitos

- Node.js 16+ y npm/yarn/pnpm
- Acceso al Customer Service en `http://localhost:8080`

## 🚀 Instalación

```bash
npm install
```

## 🎮 Ejecución

### Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

El proxy en Vite redirige automáticamente las llamadas a `/api/*` a `http://localhost:8080`

### Build de Producción

```bash
npm run build
```

### Preview

```bash
npm run preview
```

### Docker

```bash
docker build -t bank-usac-frontend:latest .
docker run -p 3000:3000 bank-usac-frontend:latest
```

## 📁 Estructura de Proyecto

```
src/
├── pages/
│   ├── HomePage.tsx           # Página de inicio
│   ├── RegisterPage.tsx        # Registro de usuario
│   ├── LoginPage.tsx           # Login
│   ├── ActivationPage.tsx      # Activación por token
│   ├── ProfilePage.tsx         # Perfil y edición
│   └── AuditPage.tsx           # Auditoría de eventos
├── components/
│   └── ProtectedRoute.tsx      # Rutas protegidas por autenticación
├── store/
│   ├── authStore.ts            # Estado de autenticación (Zustand)
│   └── auditStore.ts           # Estado de auditoría
├── App.tsx                     # Definición de rutas
├── App.css                     # Estilos globales
└── main.tsx                    # Punto de entrada
```

## 🔌 API Endpoints Utilizados

### Autenticación (sin autenticación)

- `POST /register` - Crear nueva cuenta
  - Body: `{ username, email, password }`
  - Response: `{ customerId, status, activationToken }`

- `POST /login` - Iniciar sesión
  - Body: `{ username, password }`
  - Response: `{ token, customer }`

- `POST /activate/{token}` - Activar cuenta
  - Response: `{ customer }`

### Perfil (requiere JWT en Header `Authorization: Bearer {token}`)

- `PUT /me` - Actualizar perfil
  - Body: `{ email, password? }`
  - Response: `{ customer }`

### Auditoría (requiere JWT)

- `GET /audit/events` - Obtener eventos procesados
  - Response: `[{ eventId, eventType, correlationId, processedAt }]`

## 🎨 Tema de Diseño

- **Colores**: Azul primario (#2563EB), Verde secundario, Rojo para alertas
- **Tipografía**: Sistema font stack estándar de navegadores
- **Componentes**: Tarjetas, formularios, tablas, botones con estados de carga
- **Iconografía**: Lucide React para iconos consistentes

## 🛡️ Estado de Autenticación

La aplicación mantiene el JWT en `localStorage` bajo la clave `token`, con acceso centralizado mediante el store `useAuthStore`.

El token se incluye automáticamente en todas las llamadas a endpoints protegidos.

## 📝 Convenciones de Formularios

- Validaciones básicas en cliente (email, contraseña mínima)
- Errores mostrados en toast de error rojo
- Botones deshabilitados durante envío
- Campos de contraseña con toggle de visibilidad

## 🔄 Flujo de Registro y Activación

1. Usuario completa formulario en `/register`
2. Backend retorna `activationToken` en respuesta
3. Usuario recibe correo con enlace: `https://tuapp.com/activate?token={token}`
4. Página de activación (ActivationPage.tsx) procesa el token automáticamente
5. Tras activación exitosa, se redirige a login

## 📱 Responsividad

- Mobile-first approach con Tailwind CSS
- Grid/Flex para layouts adaptativos
- Media queries para pantallas medianas (md:)
- Touch-friendly button sizes (mín. 44px recomendado)

## ⚠️ Notas de Configuración

- **CORS**: El servidor backend debe permitir requests desde `http://localhost:3000` en desarrollo
- **JWT Secret**: Debe coincidir entre frontend y backend para validación
- **Expiración de Token**: Verificar `exp` claim en token para logout automático
- **Timeout de Solicitudes**: Configurado en axios (default 10s)

## 🚧 Próximas Mejoras

- [ ] Persistencia de sesión en sesión storage
- [ ] Refresh token automático antes de expiración
- [ ] Notificaciones push para eventos
- [ ] Dark mode
- [ ] Tests unitarios con Vitest
- [ ] E2E con Playwright
