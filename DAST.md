# 🔓 DAST — Análisis Dinámico de Seguridad (OWASP ZAP)

## link de github:
https://github.com/GabrielNicoasVivancoRaza/app-reservas-Vivanco-Moran-Miranda.git


## ¿Qué es DAST y por qué integrarlo en CI/CD?

**DAST (Dynamic Application Security Testing)** es una técnica que analiza una aplicación web **en ejecución**, interactuando con ella desde afuera como lo haría un atacante externo, para identificar vulnerabilidades como inyección SQL, XSS, CSRF, cabeceras de seguridad ausentes, cookies inseguras, fugas de información, etc.

A diferencia del SAST (que revisa el código fuente sin ejecutarlo), el DAST no necesita acceso al código: prueba la aplicación desplegada y detecta problemas que solo aparecen en tiempo de ejecución (configuración del servidor, cabeceras HTTP, manejo de sesiones, respuestas de error).

Al integrarlo en el pipeline de CI/CD, cada `push` o `pull request` dispara el análisis de forma automática, lo que permite **detectar fallos de seguridad de forma temprana** — antes de que lleguen a producción — sin depender de que alguien recuerde ejecutar el escaneo manualmente.

## Herramienta utilizada

Se utilizó **[OWASP ZAP](https://www.zaproxy.org/)** (Zed Attack Proxy), el escáner DAST de código abierto de referencia, ejecutado en su modalidad **Baseline Scan** mediante la imagen oficial de Docker:

```
ghcr.io/zaproxy/zaproxy:stable
```

El *baseline scan* (`zap-baseline.py`) hace un *spider* del sitio (recorre todas las páginas alcanzables) y aplica el conjunto de reglas de análisis pasivo de ZAP sobre cada petición/respuesta. Se eligió esta modalidad porque su duración (2–5 minutos) es adecuada para ejecutarse en **cada push**; el escaneo activo completo (`zap-full-scan.py`, que además lanza payloads de ataque) puede tardar más de 30 minutos y suele reservarse para ejecuciones nocturnas o pre-release.

## Arquitectura de la solución

```
push / pull request (main, develop)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  GitHub Actions — runner self-hosted (Windows + Docker) │
│                                                         │
│  1. Checkout del código                                 │
│  2. Generar frontend/.env.production.local              │
│  3. docker-compose (proyecto aislado "dast")            │
│       ┌────────────────────────────────────────┐        │
│       │  red interna dast_default              │        │
│       │  mongo ── auth ── booking ── user ──   │        │
│       │  notification ── frontend (:3000)      │        │
│       │                       ▲                │        │
│       │   OWASP ZAP ──────────┘                │        │
│       └────────────────────────────────────────┘        │
│  4. Reportes (HTML/XML/JSON) → artifacts                │
│  5. Quality gate: falla si hay alertas HIGH             │
│  6. docker-compose down (limpieza)                      │
└─────────────────────────────────────────────────────────┘
        │
        ▼
  Workflow "Notify Telegram about DAST results"
  → resumen de vulnerabilidades al grupo de Telegram
```

## Archivos involucrados

| Archivo | Rol |
|---|---|
| [`.github/workflows/dast.yml`](.github/workflows/dast.yml) | Workflow principal: despliega la app, ejecuta ZAP, evalúa resultados |
| [`.github/workflows/telegram-notify-dast.yml`](.github/workflows/telegram-notify-dast.yml) | Se dispara al terminar el DAST y envía el resumen a Telegram |
| [`docker-compose.dast.yml`](docker-compose.dast.yml) | Stack aislado de la aplicación usado solo para el escaneo |

## Paso a paso del workflow (`dast.yml`)

El workflow se dispara en cada `push` y `pull request` sobre `main` y `develop`, y corre en un runner **self-hosted** (Windows con Docker Desktop). No requiere ninguna intervención manual: el propio workflow levanta la aplicación, la escanea y la destruye.

### 1. Checkout del código
`actions/checkout@v4` con `fetch-depth: 0`.

### 2. Generación de `frontend/.env.production.local`
El build del frontend (Next.js) requiere este archivo, pero está en el `.gitignore` (buena práctica: los `.env` no se commitean), por lo que no existe en el checkout limpio del runner. El workflow lo genera al vuelo. Sus tres variables son `NEXT_PUBLIC_*` (rutas relativas públicas que igual terminan visibles en el JavaScript del navegador), así que escribirlas en el workflow **no expone ningún secreto**.

### 3. Despliegue de la aplicación
```powershell
docker-compose -f docker-compose.dast.yml -p dast up -d --build
```
Se usa un compose dedicado ([`docker-compose.dast.yml`](docker-compose.dast.yml)) con el nombre de proyecto fijo `dast`. Diferencias frente al `docker-compose.yml` principal, y su justificación:

- **Sin `container_name` fijos** → los contenedores se llaman `dast-frontend-1`, `dast-mongo-1`, etc., y no chocan con los contenedores del stack local del runner (`mongo`, `sonarqube1`), que deben seguir corriendo para el análisis SAST.
- **Sin puertos publicados al host** → no hay conflictos por los puertos 3000/4000/5000/27017 ya ocupados. ZAP no los necesita: se conecta al frontend **por la red interna de Docker**.
- **Sin el servicio SonarQube** → el DAST no lo utiliza.

Esto garantiza un **entorno de pruebas aislado y reproducible**: el escaneo siempre corre contra una instancia recién construida de la aplicación, sin interferir con otros servicios de la máquina.

### 4. Espera activa (health check)
Antes de escanear, el workflow verifica que el frontend responda, consultando `http://frontend:3000` **desde dentro de la red** `dast_default` (hasta 30 intentos cada 5 segundos). Si no responde, imprime los logs del contenedor y falla — así el escaneo nunca corre contra una app a medio levantar.

### 5. Ejecución de OWASP ZAP
```powershell
docker run --rm `
  --network dast_default `
  -v "${PWD}/zap_reports:/zap/wrk" `
  ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py -t http://frontend:3000 `
  -r report.html -x report.xml -J report.json -I
```
ZAP corre como un contenedor más **dentro de la misma red** que la aplicación, apuntando al frontend por su nombre de servicio. Genera el reporte en tres formatos (HTML legible, XML y JSON para procesamiento automático). El flag `-I` evita que el script devuelva código de error por simples *warnings*: la decisión de aprobar o reprobar el pipeline la toma el paso 7 según la severidad real de los hallazgos.

### 6. Publicación de reportes
Los reportes se suben como **artifact** (`zap-reports`) con `if: always()`, de modo que estén disponibles para descarga y para el notificador de Telegram incluso si el escaneo encuentra vulnerabilidades.

### 7. Quality gate del DAST
Un paso en PowerShell parsea `report.xml`, cuenta las alertas por nivel de riesgo (`riskcode` 3=High, 2=Medium, 1=Low, 0=Informational) y:

- publica el resumen como outputs del job, y
- **falla el pipeline (`exit 1`) si existe al menos una alerta de riesgo ALTO**, bloqueando el merge del pull request.

### 8. Limpieza
`docker-compose -f docker-compose.dast.yml -p dast down -v` con `if: always()`: el stack de prueba se destruye siempre (contenedores, red y volúmenes), quede como quede el escaneo, sin tocar los demás contenedores de la máquina.

## Notificación a Telegram

El workflow [`telegram-notify-dast.yml`](.github/workflows/telegram-notify-dast.yml) se dispara automáticamente (`workflow_run`) al terminar el escaneo:

1. Descarga el artifact `zap-reports` del run que lo disparó.
2. Parsea `report.xml` y arma el conteo por severidad.
3. Envía al grupo de Telegram (vía Bot API) un mensaje con: rama, commit, autor, estado del pipeline (✅ PASSED / ❌ FAILED), y el desglose de vulnerabilidades (ALTO / MEDIO / BAJO / INFO / TOTAL) con enlace al run.

Los secretos `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` se guardan como **GitHub Secrets** — nunca en el código.

## Tipos de hallazgos que reporta el baseline scan

Sobre esta aplicación (Next.js + microservicios Express), ZAP típicamente reporta hallazgos como:

- Ausencia de cabeceras de seguridad: `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors` (clickjacking), `X-Content-Type-Options`.
- Cookies sin atributos `HttpOnly`, `Secure` o `SameSite`.
- Fuga de información por cabeceras (`X-Powered-By`) o comentarios/errores en respuestas.
- Indicadores pasivos de XSS/CSRF (formularios sin token anti-CSRF, parámetros reflejados).

Cada alerta en el reporte HTML incluye descripción, riesgo, evidencia (URL y respuesta) y la solución recomendada.

## Cumplimiento de la actividad propuesta

| Requisito | Cómo se cumple |
|---|---|
| Integrar una herramienta DAST en GitHub Actions | OWASP ZAP Baseline en `dast.yml` |
| Ejecución automática en cada push/PR a la rama principal | Triggers `push` y `pull_request` sobre `main` (y `develop`) |
| Sin intervención manual para levantar la aplicación | El workflow construye y despliega todo el stack con docker-compose dentro del runner |
| El escáner analiza la aplicación ya operativa | Health check previo + escaneo contra la app corriendo en la red interna de Docker |
| Detección temprana de fallos de seguridad | Quality gate que rompe el pipeline ante alertas HIGH + notificación inmediata a Telegram |

## Cómo ver los resultados

1. **GitHub → Actions → "DAST Security Scan (OWASP ZAP)"** → seleccionar el run → sección *Artifacts* → descargar `zap-reports` → abrir `report.html` en el navegador.
2. **Telegram**: el grupo del equipo recibe el resumen automáticamente al terminar cada escaneo.
