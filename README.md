# CensoGT — Censo de popularidad casa por casa

PWA en HTML + JavaScript puro + Tailwind (CDN) + Supabase. Sin build: se sube tal cual a GitHub y se despliega en Vercel como sitio estático.

## Estructura

```
censo-politico/
├── index.html            → login + vistas por rol (ingreso / dashboard)
├── manifest.json         → PWA (cambiar nombre e íconos)
├── sw.js                 → service worker (subir VERSION en cada deploy)
├── tailwind.css          → Tailwind YA COMPILADO (esto carga el navegador)
├── input.css             → fuente de la compilación (no se carga)
├── tailwind.config.js    → config de la compilación (no se carga)
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
2. **SQL Editor** → New query → pegar los bloques 0–4 de `sql/setup.sql` → Run.
3. **Crear los usuarios reales**: Authentication → Users → *Add user*, uno por
   persona (ej. `digitador1@censo.app`, `admin@censo.app`), cada uno con su
   contraseña y **Auto Confirm User** marcado. Los correos no necesitan
   existir de verdad; el dominio debe coincidir con `LOGIN_DOMAIN` en
   `js/app.js` para que en el login baste escribir `digitador1`.
4. **Dar rol de admin**: ejecutar el BLOQUE 5 de `sql/setup.sql` (consulta
   nueva) con el correo del administrador. Quien no tenga rol entra como
   Digitador.
5. **Project Settings → API**: copiar *Project URL* y *anon public key* a
   `js/supabaseClient.js`.
6. Subir la carpeta a un repo de GitHub → Vercel → *Import Project* → Deploy
   (framework: *Other*, sin build command). El service worker requiere HTTPS,
   que Vercel ya da.

## Seguridad — leer antes de entregar al cliente

- **No hay contraseñas en el código.** Todas viven en Supabase Auth; el login
  de la app es un login real (`signInWithPassword`).
- La URL y la *anon key* de `js/supabaseClient.js` **sí son visibles** en el
  navegador — es inevitable y es su diseño: la anon key es pública. La
  protección no depende de esconderla, sino del RLS:
  - **Escribir** exige sesión iniciada (la anon key sola no inserta nada).
  - **Leer** exige además el rol `admin` dentro del token, que solo se asigna
    por SQL (BLOQUE 5). Un digitador logueado tampoco puede descargar el censo.
- `registrado_por` lo pone el servidor con el correo de la sesión: auditoría
  real de quién capturó cada familia, imposible de falsificar desde la app.
- Para dar de baja a alguien (p. ej. un digitador que deja la campaña):
  Authentication → Users → borrar el usuario. Nada que redeployar.

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
- El CSS de Tailwind está **precompilado** en `tailwind.css` (en la raíz) (no se usa el
  CDN de runtime, que resultó poco confiable). Si se agregan clases de Tailwind
  nuevas en `index.html` o en `js/`, hay que regenerarlo:
  `npx tailwindcss -i input.css -o tailwind.css --minify`
  (o pedirle a Claude el archivo regenerado junto con el cambio).
