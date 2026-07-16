# CensoGT — Censo de popularidad casa por casa

PWA en HTML + JavaScript puro + Tailwind (CDN) + Supabase. Sin build: se sube tal cual a GitHub y se despliega en Vercel como sitio estático.

## Estructura

```
censo-politico/
├── index.html            → login + vistas por rol (ingreso / dashboard)
├── manifest.json         → PWA (cambiar nombre e íconos)
├── sw.js                 → service worker (subir VERSION en cada deploy)
├── js/
│   ├── configData.js     → PARTIDOS y UBICACIONES (llenar desde el Excel)
│   ├── supabaseClient.js → URL y anon key del proyecto (cambiar)
│   ├── app.js            → login, cascada de ubicación, votos, guardado
│   └── dashboard.js      → gráficas, filtros y exportación a Excel
├── img/                  → logo, íconos PWA y logos de partidos (placeholders)
└── sql/setup.sql         → configuración completa de la base de datos
```

## Puesta en marcha (una sola vez)

1. **Crear proyecto** en supabase.com → New project.
2. **SQL Editor** → New query → pegar TODO el contenido de `sql/setup.sql` → Run.
3. **Crear el usuario del dashboard**: Authentication → Users → *Add user* →
   correo `admin@censo.app`, contraseña `admin2026` (o los valores que pongas
   en `js/app.js` → `USERS.admin`), marcar **Auto Confirm User**.
   *Es el único paso que no va por SQL: crear usuarios de Auth insertando en
   `auth.users` se rompe entre versiones de GoTrue, así que se hace en la UI.*
4. **Project Settings → API**: copiar *Project URL* y *anon public key* a
   `js/supabaseClient.js`.
5. **Cambiar credenciales** en `js/app.js` (no dejar las de ejemplo) y los
   marcadores `⚠️ CAMBIAR` de nombre/logo en `index.html` y `manifest.json`.
6. Subir la carpeta a un repo de GitHub → Vercel → *Import Project* → Deploy
   (framework: *Other*, sin build command). El service worker requiere HTTPS,
   que Vercel ya da.

## Seguridad — leer antes de entregar al cliente

- Las credenciales del login están **hardcodeadas en `app.js` por requerimiento
  del proyecto**: cualquiera que abra el código fuente puede leerlas. Solo
  controlan qué pantallas se muestran.
- La protección real está en la base: las tablas tienen RLS sin políticas de
  escritura (solo se inserta vía la función `registrar_familia`) y **la lectura
  exige sesión autenticada**. Sin eso, cualquiera con la anon key podría
  descargar el censo completo por la API REST.
- Riesgo residual: la clave del admin también viaja en el JS. Cuando el cliente
  lo acepte, el paso definitivo es que el admin escriba su contraseña en el
  login (se elimina `USERS.admin.password` y se pasa lo tecleado a
  `signInWithPassword`): cambio de ~5 líneas.

## Datos sensibles

La base guarda preferencia política de familias identificadas con nombre,
teléfono y ubicación exacta. Recomendaciones para el cliente: pedir
consentimiento verbal en cada encuesta, evaluar si el teléfono es
imprescindible, limitar quién tiene la clave de admin, y **borrar la base al
cerrar la campaña** (el `truncate` está comentado al final de `setup.sql`).

## Mantenimiento

- Datos geográficos y partidos: editar `js/configData.js` (misma estructura que
  la plantilla Excel).
- Cada deploy con cambios: subir `VERSION` en `sw.js` para que los teléfonos
  actualicen.
- Tailwind por CDN muestra un aviso de consola ("not for production"): es
  esperado con este stack; funciona igual.
