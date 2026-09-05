# Manual de Usuario — Bank USAC

Este manual explica, paso a paso, cómo usar Bank USAC: desde crear tu usuario hasta consultar tus cuentas, hacer transferencias y revisar tu historial de pagos.

El sistema está construido con 5 microservicios independientes, cada uno a cargo de un integrante del equipo. Para dar trazabilidad clara sobre la autoría de cada funcionalidad, cada sección de este manual indica el microservicio al que pertenece:

| Microservicio | Funciones que cubre |
|---|---|
| **Customer Service** | Registro, activación e inicio de sesión de clientes |
| **Account Service**  | Creación de cuentas, consulta de saldo, desactivación automática |
| **Transaction Service** | Transferencias entre cuentas |
| **Payment Service**  | Historial de pagos procesados |
| **Notification & Audit Service** | Registro de auditoría del sistema |


---

## 1. Crear tu usuario (Registro)
*Microservicio: Customer Service*

Para usar Bank USAC primero necesitas crear una cuenta de usuario.

1. Ingresa a la página de registro.
2. Completa el formulario con tus datos personales: nombre completo, correo electrónico, nombre de usuario, contraseña, número de documento, una foto de tu documento, fecha de nacimiento y dirección.
3. Presiona el botón **Registrar**.
4. El sistema te confirmará que el registro fue exitoso y te indicará que debes **activar tu cuenta** antes de poder ingresar.

![Formulario de registro](/docs/assets/images/register_form.png)

---

## 2. Activar tu cuenta
*Microservicio: Customer Service*

Por seguridad, toda cuenta nueva debe activarse antes de usarse.

1. Revisa la bandeja de entrada del correo electrónico que usaste al registrarte. Recibirás un mensaje de **Bank USAC** con el asunto "Activación de cuenta".

   ![Correo de activación](/docs/assets/images/activation_page2.png)

2. Haz clic en el enlace de activación que viene en el correo. Esto te llevará a la página de activación con el código ya cargado.
3. Presiona el botón **Activar**.
4. Cuando el sistema confirme "Cuenta activada", ya puedes iniciar sesión.

![Activar cuenta](/docs/assets/images/activation_page.png)

> **Nota:** Si no encuentras el correo, revisa tu carpeta de spam o correo no deseado.

---

## 3. Iniciar sesión
*Microservicio: Customer Service*

1. Ingresa a la página principal de Bank USAC.
2. Escribe tu **usuario** y **contraseña**.
3. Presiona **Ingresar**.

Si aún no tienes cuenta, puedes usar el enlace **Crear usuario** para ir al formulario de registro.

![Inicio de sesión](/docs/assets/images/login_page.png)

---

## 4. Panel principal

Al iniciar sesión verás el panel principal de Bank USAC, con tu nombre y tu rol activo en la parte superior, y tres secciones disponibles en las pestañas:

- **Perfil**: información de tu cuenta de usuario y tu rol dentro del sistema.
- **Cuentas**: tus cuentas bancarias y su saldo.
- **Transferir**: para enviar dinero entre cuentas.

Para salir del sistema, usa el botón **Salir** en la esquina superior derecha.

![Panel principal](/docs/assets/images/transfer_form.png)

---

## 5. Mis Cuentas
*Microservicio: Account Service*

En la pestaña **Cuentas** puedes ver todas tus cuentas bancarias y también abrir una cuenta nueva.

### 5.1 Ver mis cuentas

La tabla te muestra, para cada cuenta:

| Columna | Qué significa |
|---|---|
| **ID** | El identificador único de tu cuenta. |
| **Tipo** | El tipo de cuenta: monetaria o de ahorro. |
| **Saldo** | El total de dinero que tienes en la cuenta. |
| **Disponible** | El dinero que realmente puedes usar en este momento. Puede ser menor al saldo total si parte del dinero está reservado temporalmente por una transferencia o un pago en proceso. |
| **Estado** | Si la cuenta está **activa** o **inactiva**. |

> **Importante:** Una cuenta se marca como **inactiva automáticamente** si tiene un saldo menor a Q50 **y** no ha tenido ningún movimiento en los últimos 6 meses. Si esto le sucede a una de tus cuentas, te recomendamos depositar fondos o comunicarte con el banco para reactivarla.

### 5.2 Crear una cuenta nueva

1. Selecciona el **tipo de cuenta** que deseas abrir en el menú desplegable (monetaria o de ahorro).
2. Escribe el **monto inicial** con el que quieres abrir la cuenta.
3. Presiona **Crear cuenta**.
4. La nueva cuenta aparecerá de inmediato en la tabla, ya activa.

![Mis cuentas](/docs/assets/images/transfer_form.png)

---

## 6. Transferencias entre cuentas
*Microservicio: Transaction Service*

Desde la pestaña **Transferir** puedes enviar dinero de una de tus cuentas a otra cuenta.

1. Escribe el identificador de la **cuenta origen** (de donde sale el dinero).
2. Escribe el identificador de la **cuenta destino** (a donde llega el dinero).
3. Indica el **monto** a transferir.
4. Presiona **Enviar**.
5. El sistema te dará un código de seguimiento (correlationId) para esa operación.
6. Puedes presionar **Consultar estado** en cualquier momento para ver si la transferencia ya se completó. El resultado te mostrará el monto, las cuentas involucradas y el estado de la operación (por ejemplo, **completada**).

![Transferencia](/docs/assets/images/transfer_form.png)

> **Nota:** Al enviar una transferencia, el monto se reserva momentáneamente en tu cuenta de origen mientras se procesa. Por eso tu saldo **disponible** puede bajar antes de que el saldo total se actualice.

---

## 7. Mis Pagos
*Microservicio: Payment Service*
La sección de **Pagos** te permite consultar el historial de pagos asociados a tus transacciones. Esta información es de **solo consulta**: los pagos se procesan automáticamente por el sistema, no se generan de forma manual.

Para cada pago verás:

- El **monto** del pago.
- El **estado**: aprobado o rechazado.
- El **motivo**, si el pago fue rechazado (por ejemplo, si se excedió el límite permitido de pago).
- La **fecha y hora** en que se procesó.

![Mis pagos](/docs/assets/images/audit_page.png)

---

## 8. Auditoría (historial de actividad del sistema)
*Microservicio: Notification & Audit Service*

La sección de **Auditoría** muestra un registro cronológico de los eventos que ocurren en el sistema: registro y activación de usuarios, creación de cuentas, transferencias y pagos procesados, entre otros.

Cada fila muestra:

- El **evento** ocurrido (por ejemplo, cuenta creada, pago aprobado, transferencia completada).
- Un **código de seguimiento**, útil para relacionar varios eventos que pertenecen a una misma operación (por ejemplo, todos los eventos generados por una sola transferencia).
- La **fecha y hora** en que se procesó.

> Esta sección está pensada principalmente para fines de supervisión y soporte.

![Auditoría](/docs/assets/images/transfer_form.png)

---

## Resumen rápido

| Quiero... | Dónde lo hago |
|---|---|
| Crear mi usuario | Registro |
| Activar mi cuenta | Enlace del correo de activación |
| Entrar al sistema | Inicio de sesión |
| Ver mis cuentas y su saldo | Pestaña **Cuentas** |
| Abrir una cuenta nueva | Pestaña **Cuentas** → Crear cuenta |
| Enviar dinero a otra cuenta | Pestaña **Transferir** |
| Ver mi historial de pagos | Sección **Pagos** |
| Ver el historial general de actividad | Sección **Auditoría** |
