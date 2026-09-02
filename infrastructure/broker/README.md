Broker local (RabbitMQ) — instrucciones

Preparación

- Copiar el template a `.env`:

```bash
cp infrastructure/broker/.env.example infrastructure/broker/.env
```

- (Opcional) editar credenciales en `infrastructure/broker/.env`.

Levantar servicios localmente

```bash
cd infrastructure
docker compose up -d
```

Acceder a la interfaz de administración de RabbitMQ en `http://localhost:15672` con las credenciales del `.env`.

Definiciones

- El archivo `infrastructure/broker/rabbitmq/definitions.json` se monta en `/etc/rabbitmq/definitions.json` dentro del contenedor. Puedes prellenarlo con exchanges, queues y bindings si quieres inicializar la configuración.

Limpiar

```bash
cd infrastructure
docker compose down -v
```
