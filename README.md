# 📆 ReservasEC

**ReservasEC** es una plataforma fullstack de gestión de reservas desarrollada con una arquitectura de microservicios. Permite a los usuarios registrarse, iniciar sesión, gestionar su perfil, crear y cancelar reservas, y recibir notificaciones. El sistema está dockerizado para facilitar el despliegue local.

## 🚀 Tecnologías principales

- **Frontend:** Next.js + Tailwind CSS
- **Backend (Microservicios):**
  - Auth Service (Node.js + Express)
  - Booking Service (Node.js + Express)
  - User Service (Node.js + Express)
  - Notification Service (Node.js + Express + Nodemailer)
- **Base de datos:** MongoDB
- **Autenticación:** JSON Web Tokens (JWT)
- **Contenedores:** Docker + Docker Compose

---

## 📁 Estructura de carpetas

```plaintext
/reservas-ec
├── frontend/             # Next.js App
├── auth-service/         # Servicio de autenticación
├── user-service/         # Servicio de usuarios
├── booking-service/      # Servicio de reservas
├── notification-service/ # Servicio de notificaciones por email
└── docker-compose.yml    # Orquestación de todos los servicios
```

---

## ⚙️ Configuración del entorno

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/reservas-ec.git
cd reservas-ec
```

### 2. Variables de entorno

🔐 Frontend (frontend/.env.production.local)

```bash
NEXT_PUBLIC_API_URL=/api/auth
NEXT_PUBLIC_BOOKING_URL=/api/bookings
NEXT_PUBLIC_USER_URL=/api/users
```

🔐 Backend .env (cada microservicio)
Ejemplo para auth-service:

```bash
PORT=4000
MONGO_URI=mongodb://mongo:27017/auth-db
JWT_SECRET=supersecretkey
```

Repite para los demás servicios cambiando PORT, MONGO_URI y usando el mismo JWT_SECRET.

### 3. 🐳 Uso con Docker

1. Construir los contenedores

```bash
docker-compose build
```

3. Levantar los servicios

```bash
docker-compose up
```

La app estará disponible en http://localhost:3000

## ✅ Funcionalidades principales

- Registro e inicio de sesión de usuarios

- Perfil editable

- Creación y cancelación de reservas

- Historial de reservas activas y canceladas

- Límite de 5 reservas canceladas visibles

- Notificaciones por email (reserva y cancelación)

- Gestión de microservicios independientes

---

## 🛡️ Calidad de código: SonarQube + Quality Gate + Telegram

### 1. Levantar SonarQube en local

SonarQube ya está definido como servicio en `docker-compose.yml`:

```bash
docker-compose up -d sonarqube
```

Espera 1-2 minutos a que arranque (usa Elasticsearch internamente) y entra a [http://localhost:9000](http://localhost:9000). Usuario/clave por defecto: `admin` / `admin` (te pedirá cambiarla en el primer login).

### 2. Crear el proyecto y el token de análisis

1. En SonarQube: `Projects → Create Project → Manually`, con **Project key = `reservasec`** (debe coincidir con `sonar.projectKey` en [`sonar-project.properties`](sonar-project.properties)).
2. Genera un token: `My Account → Security → Generate Token` (tipo "Global Analysis Token" o del proyecto). Ese token **no se sube al repo** — se guarda como secret de GitHub Actions (`SONAR_TOKEN`) o se pasa localmente por variable de entorno.

### 3. Ejecutar el análisis manualmente

Con el [SonarScanner CLI](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner/) instalado (requiere Java):

```bash
sonar-scanner -Dsonar.host.url=http://localhost:9000 -Dsonar.token=TU_TOKEN
```

El scanner toma automáticamente la configuración de [`sonar-project.properties`](sonar-project.properties) en la raíz del repo (analiza todos los microservicios y el frontend en un solo proyecto).

### 4. Quality Gate: `StrictGate`

Se debe crear manualmente en SonarQube (`Quality Gates → Create → "StrictGate"`) y asignarlo como Quality Gate del proyecto `reservasec` (`Project Settings → Quality Gate`). Todas las condiciones deben cumplirse para que el análisis pase:

| Métrica                       | Condición        | Umbral |
|--------------------------------|-------------------|--------|
| Blocker Issues                 | is greater than   | 0      |
| Critical Issues                | is greater than   | 0      |
| Major Issues                   | is greater than   | 5      |
| Security Hotspots Reviewed     | is less than      | 100%   |
| Coverage                       | is less than      | 80%    |
| Duplicated Lines (%)           | is greater than   | 3%     |
| Technical Debt Ratio           | is greater than   | 2.5%   |
| Cyclomatic Complexity (total)  | is greater than   | 50     |
| Cognitive Complexity (total)   | is greater than   | 30     |

Para efectos de evidencia del taller, `booking-service` tiene errores/vulnerabilidades introducidas a propósito ([`booking-service/src/routes/debug.routes.js`](booking-service/src/routes/debug.routes.js)) para que `StrictGate` falle de forma reproducible.

### 5. Pipeline CI/CD

Dos workflows en [`.github/workflows/`](.github/workflows/):

- **`sonarqube.yml`**: corre en cada `push` a `main`/`develop` y en cada Pull Request. Descarga el SonarScanner CLI y ejecuta el análisis con `-Dsonar.qualitygate.wait=true`, por lo que **el job falla si `StrictGate` no se cumple**, bloqueando el merge.
- **`telegram-notify.yml`**: se dispara automáticamente al terminar `sonarqube.yml`, consulta los resultados vía la API de SonarQube y envía el reporte al grupo de Telegram.

Como SonarQube corre en `localhost` de una máquina del equipo (no es accesible desde internet), ambos workflows usan `runs-on: self-hosted`. Para configurar el runner: `Settings del repo → Actions → Runners → New self-hosted runner` y seguir las instrucciones (`config.cmd` + `run.cmd`, o instalarlo como servicio con `svc.cmd install`).

Secrets necesarios en `Settings → Secrets and variables → Actions` (nunca se commitean al repo):

| Secret              | Descripción                                              |
|---------------------|-----------------------------------------------------------|
| `SONAR_TOKEN`       | Token generado en SonarQube (paso 2).                     |
| `SONAR_HOST_URL`    | URL del servidor, ej. `http://localhost:9000`.             |
| `TELEGRAM_BOT_TOKEN`| Token del bot de Telegram (ver sección siguiente).         |
| `TELEGRAM_CHAT_ID`  | ID del grupo de Telegram al que se notifica.               |

### 6. Bot de Telegram

1. En Telegram, habla con **@BotFather** → `/newbot` → sigue las instrucciones → guarda el token que te da (formato `123456:ABC-...`).
2. Crea un grupo de Telegram para el equipo e invita al bot.
3. Envía cualquier mensaje al grupo y visita `https://api.telegram.org/bot<TOKEN>/getUpdates` en el navegador para obtener el `chat.id` del grupo (es un número negativo para grupos/supergrupos).
4. Agrega `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` como secrets del repositorio (nunca en el código ni en commits).

El workflow `telegram-notify.yml` arma y envía el mensaje automáticamente; no requiere pasos manuales adicionales una vez configurados los secrets.

### Roles del equipo

| Rol                | Responsable | Responsabilidad                                              |
|--------------------|-------------|----------------------------------------------------------------|
| Líder de calidad   | _(por definir)_ | Configura SonarQube y define `StrictGate`.                 |
| DevOps             | _(por definir)_ | Pipelines de CI/CD e integración con Telegram.              |
| Desarrolladores    | _(por definir)_ | Corrigen el código para cumplir los umbrales de calidad.    |
