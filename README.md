# CensoGT — Censo de popularidad casa por casa

PWA en HTML, JavaScript puro, Tailwind precompilado y Supabase. No necesita
proceso de build para desplegarse: se publica como sitio estático.

## Estructura

```
censo-politico/
├── index.html            → login, formulario y dashboard
├── manifest.json         → configuración PWA
├── sw.js                 → caché de archivos locales
├── tailwind.css          → CSS compilado que carga el navegador
├── dashboard.css         → estilos específicos del panel de resultados
├── input.css             → fuente para recompilar Tailwind
├── tailwind.config.js    → configuración de Tailwind
├── js/
│   ├── configData.js     → partidos y comunidades
│   ├── supabaseClient.js → URL y anon key del proyecto
│   ├── app.js            → sesión, formulario y guardado
│   └── dashboard.js      → métricas, filtros, gráficas y Excel
├── img/                  → logo, iconos y partidos
└── sql/setup.sql         → fuente de verdad de la base de datos
```

Los archivos `SQL DE SUPABASE.txt` y `POLITICAS SUPABASE.txt` sólo indican que
existieron configuraciones anteriores. No deben ejecutarse; toda modificación
de la base está consolidada en `sql/setup.sql`.

## Puesta en marcha

1. Crear un proyecto en Supabase.
2. En **Authentication → Users**, crear los usuarios necesarios con
   **Auto Confirm User** activado. Ejemplos: `digitador1@censo.app` y
   `admin@censo.app`.
3. Verificar que el dominio coincida con `LOGIN_DOMAIN` en `js/app.js`.
4. En el bloque 5 de `sql/setup.sql`, cambiar `admin@censo.app` por el correo
   que usará el administrador.
5. Ejecutar todo `sql/setup.sql` desde **SQL Editor**. El script también puede
   volver a ejecutarse sobre una instalación anterior: completa los campos
   faltantes y migra `aldea` a `comunidad` sin borrar registros.
6. Copiar la **Project URL** y la **anon public key** a
   `js/supabaseClient.js`.
7. Publicar la carpeta en Vercel como framework **Other**, sin build command.

Después de asignar o quitar el rol de administrador, cerrar y volver a iniciar
sesión para que Supabase emita un token con el rol actualizado.

## Funcionamiento

- Todo usuario autenticado puede registrar familias y votantes.
- Los usuarios con `app_metadata.role = "admin"` ven el dashboard.
- La base registra automáticamente el correo de la sesión en
  `registrado_por`.
- Cada familia elige un modo de captura: **Solo cantidades** (una cantidad por
  preferencia) o **Personas individuales** (nombre, teléfono opcional y
  preferencia por persona). Los modos no se mezclan dentro del mismo registro.
- Además de los seis partidos existe `NEUTRAL`, mostrado como **Sin
  preferencia**, para quienes no apoyan a ningún partido.
- Los filtros de preferencia y comunidad afectan KPIs, gráfica geográfica y
  Excel. La gráfica conserva la comparación completa y atenúa las demás opciones.
- El dashboard muestra un resumen por comunidad con familias, votantes por
  preferencia, total, opción principal, búsqueda y acceso rápido al detalle.
- El administrador dispone de una lista de registros con búsqueda y botón
  **Eliminar**. La eliminación es recuperable: marca la familia como anulada y
  la excluye junto con sus cantidades del dashboard y las exportaciones.
- El Excel incluye hojas para resumen, detalle familiar, comunidades, personas
  identificadas y **Seguimiento neutral**. Esta última usa los nombres cuando
  existen y conserva familia/teléfono cuando sólo se capturaron cantidades.
- Las familias marcadas con `anulado = true` no aparecen en el dashboard.

Esta configuración está pensada para uso personal y datos no sensibles. El rol
de administrador organiza la interfaz; no pretende sustituir una revisión de
seguridad para información privada o un sistema público.

## Mantenimiento

- Partidos y comunidades: editar `js/configData.js`. Si cambia la lista de
  partidos, actualizar también la validación de `sql/setup.sql`.
- Después de incorporar `NEUTRAL`, personas individuales o la administración
  de registros en una base existente, volver a ejecutar `sql/setup.sql` en
  Supabase SQL Editor.
- Al publicar cambios importantes, subir `VERSION` en `sw.js` para limpiar
  cachés anteriores.
- Si se agregan clases nuevas de Tailwind, regenerar el CSS:

  ```powershell
  npx tailwindcss -i input.css -o tailwind.css --minify
  ```

## Comprobaciones rápidas

```powershell
npm.cmd test
node --check js/app.js
node --check sw.js
```

Para abrir una copia local sin caché durante el desarrollo:

```powershell
npm.cmd run serve
```
