// ============================================================================
// APP.JS — login (Supabase Auth), navegación por rol y formulario de ingreso
// ============================================================================

// --- 1. AUTENTICACIÓN --------------------------------------------------------
// Ya NO hay credenciales en el código. Todos los usuarios (digitadores y
// administradores) se crean en Supabase → Authentication → Users, y el rol
// de administrador se asigna con el BLOQUE 5 de sql/setup.sql.
// Quien no tiene rol asignado entra como Digitador (solo ingreso de datos).
//
// Comodidad para el login: si el usuario escribe sin '@', se le agrega este
// dominio automáticamente (escriben "digitador1" → digitador1@censo.app).
const LOGIN_DOMAIN = 'censo.app';   // ⚠️ mismo dominio de los correos creados en Auth

// --- Estado global ----------------------------------------------------------
let currentUser = null;        // { username, role }
let votosFamilia = [];         // [{ partidoId, cantidad }]
let partidoSeleccionado = null;

// --- Helpers de DOM ---------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

function toast(mensaje, tipo = 'ok') {
  const box = $('#toast-box');
  box.textContent = mensaje;
  box.className =
    'max-w-md rounded-lg px-4 py-3 text-[14px] font-semibold text-white shadow-lg ' +
    (tipo === 'error' ? 'bg-red-600' : tipo === 'aviso' ? 'bg-amber-600' : 'bg-ink-900');
  box.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => box.classList.add('hidden'), 3800);
}

// ============================================================================
// 2. LOGIN / LOGOUT / SESIÓN
// ============================================================================

async function login(e) {
  e.preventDefault();
  const escrito = $('#login-user').value.trim().toLowerCase();
  const clave = $('#login-pass').value;
  const email = escrito.includes('@') ? escrito : `${escrito}@${LOGIN_DOMAIN}`;

  const errorEl = $('#login-error');
  errorEl.classList.add('hidden');

  const { data, error } = await sb.auth.signInWithPassword({ email, password: clave });
  if (error) {
    errorEl.textContent = 'Usuario o contraseña incorrectos.';
    errorEl.classList.remove('hidden');
    return;
  }

  currentUser = usuarioDesdeSesion(data.session);
  mostrarApp();
}

// El rol viaja DENTRO del token de sesión (app_metadata), asignado desde SQL.
// app_metadata solo puede modificarse desde el servidor: nadie puede volverse
// admin editando el código en su navegador.
function usuarioDesdeSesion(session) {
  const u = session.user;
  const rol = (u.app_metadata && u.app_metadata.role) === 'admin' ? 'admin' : 'digitador';
  return { username: (u.email || '').split('@')[0], role: rol };
}

function logout() {
  sb.auth.signOut().finally(() => location.reload());
}

function mostrarApp() {
  $('#view-login').classList.add('hidden');
  const app = $('#view-app');
  app.classList.remove('hidden');
  app.classList.add('flex');

  $('#user-chip').textContent =
    `${currentUser.username} · ${currentUser.role === 'admin' ? 'Administrador' : 'Digitador'}`;

  // El tab de Dashboard solo existe para el admin
  if (currentUser.role === 'admin') $('#tab-dashboard').classList.remove('hidden');

  cambiarSeccion('section-ingreso');
}

// ============================================================================
// 3. NAVEGACIÓN ENTRE SECCIONES
// ============================================================================

function cambiarSeccion(idSeccion) {
  // Guardia por rol: un digitador nunca puede abrir el dashboard
  if (idSeccion === 'section-dashboard' && (!currentUser || currentUser.role !== 'admin')) return;

  ['section-ingreso', 'section-dashboard'].forEach((id) => {
    $('#' + id).classList.toggle('hidden', id !== idSeccion);
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const activo = btn.dataset.seccion === idSeccion;
    btn.classList.toggle('bg-ink-50', activo);
    btn.classList.toggle('text-ink-900', activo);
    btn.classList.toggle('text-ink-200', !activo);
  });

  if (idSeccion === 'section-dashboard' && typeof initDashboard === 'function') {
    initDashboard();
  }
}

// ============================================================================
// 4. SELECTS DE UBICACIÓN EN CASCADA
// ============================================================================

const uniq = (arr) =>
  [...new Set(arr)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));

// Valores únicos de un campo, filtrando por los niveles superiores ya elegidos.
function opcionesUbicacion(campo, filtro) {
  return uniq(
    UBICACIONES
      .filter((fila) => Object.keys(filtro).every((k) => fila[k] === filtro[k]))
      .map((fila) => fila[campo])
  );
}

function llenarSelect(el, valores, { obligatorio = false } = {}) {
  el.innerHTML = '';
  const primera = document.createElement('option');
  primera.value = '';
  primera.textContent = obligatorio ? 'Seleccione…' : '— Ninguno / No aplica —';
  el.appendChild(primera);
  valores.forEach((v) => {
    const op = document.createElement('option');
    op.value = v;
    op.textContent = v;
    el.appendChild(op);
  });
  el.disabled = obligatorio && valores.length === 0;
  // Si solo existe una opción válida, se elige sola: en un censo de un solo
  // municipio el digitador no tiene que tocar estos selects.
  if (obligatorio && valores.length === 1) el.value = valores[0];
}

const ubicacionActual = () => ({
  departamento: $('#sel-departamento').value,
  municipio: $('#sel-municipio').value,
  comunidad: $('#inp-comunidad').value.trim(),
  caserio: $('#inp-caserio').value.trim(),
  barrio: $('#inp-barrio').value.trim(),
  direccion: $('#inp-direccion').value.trim(),
});

function initUbicacion() {
  llenarSelect($('#sel-departamento'), uniq(UBICACIONES.map((r) => r.departamento)), { obligatorio: true });
  actualizarMunicipios();

  $('#sel-departamento').addEventListener('change', actualizarMunicipios);
  $('#sel-municipio').addEventListener('change', () => {
    limpiarDetalleUbicacion();
    actualizarSugerencias();
  });
}

function actualizarMunicipios() {
  const { departamento } = ubicacionActual();
  llenarSelect($('#sel-municipio'), opcionesUbicacion('municipio', { departamento }), { obligatorio: true });
  limpiarDetalleUbicacion();
  actualizarSugerencias();
}

// La columna "Comunidad" del Excel alimenta SUGERENCIAS para escribir menos
// y con la misma ortografía; si un lugar no está en la lista, se escribe
// igual y no bloquea nada.
function actualizarSugerencias() {
  const { departamento, municipio } = ubicacionActual();
  const dl = $('#dl-comunidad');
  dl.innerHTML = '';
  opcionesUbicacion('comunidad', { departamento, municipio }).forEach((v) => {
    const op = document.createElement('option');
    op.value = v;
    dl.appendChild(op);
  });
}

// Al cambiar de municipio, los nombres de lugar anteriores ya no aplican.
function limpiarDetalleUbicacion() {
  ['#inp-comunidad', '#inp-caserio', '#inp-barrio', '#inp-direccion']
    .forEach((sel) => { $(sel).value = ''; });
}

// ============================================================================
// 5. VOTOS: FICHAS DE PARTIDO + LISTA DINÁMICA
// ============================================================================
// Nota de diseño: un <select> nativo NO puede mostrar imágenes, por eso los
// partidos se eligen con fichas (logo + sigla), más rápidas en el celular.

function renderChipsPartidos() {
  const cont = $('#chips-partidos');
  cont.innerHTML = '';
  PARTIDOS.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.partido = p.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.title = p.nombre;
    btn.className =
      'chip-partido flex flex-col items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-2.5 transition hover:border-ink-400 focus-visible:ring-2 focus-visible:ring-ink-400';
    btn.innerHTML = `
      <span class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full" style="background:${p.color}1A">
        <img src="${p.logo}" alt="" class="h-9 w-9 object-contain" onerror="this.remove()" />
      </span>
      <span class="text-[12px] font-bold" style="color:${p.color}">${p.sigla}</span>`;
    btn.addEventListener('click', () => seleccionarPartido(p.id));
    cont.appendChild(btn);
  });
}

function seleccionarPartido(id) {
  partidoSeleccionado = id;
  document.querySelectorAll('.chip-partido').forEach((btn) => {
    const activo = btn.dataset.partido === id;
    btn.setAttribute('aria-pressed', String(activo));
    btn.classList.toggle('ring-2', activo);
    btn.classList.toggle('ring-ink-900', activo);
    btn.classList.toggle('border-ink-900', activo);
  });
}

function agregarVoto() {
  const cantidad = parseInt($('#inp-cantidad').value, 10);

  if (!partidoSeleccionado) return toast('Primero selecciona un partido.', 'aviso');
  if (!Number.isInteger(cantidad) || cantidad < 1) return toast('La cantidad debe ser 1 o más.', 'aviso');
  if (votosFamilia.some((v) => v.partidoId === partidoSeleccionado)) {
    return toast('Ese partido ya está en la lista. Elimínalo para corregir la cantidad.', 'aviso');
  }

  votosFamilia.push({ partidoId: partidoSeleccionado, cantidad });
  renderListaVotos();

  // Listo para la siguiente línea
  $('#inp-cantidad').value = 1;
  seleccionarPartido(null);
  partidoSeleccionado = null;
}

function quitarVoto(indice) {
  votosFamilia.splice(indice, 1);
  renderListaVotos();
}

function renderListaVotos() {
  const lista = $('#lista-votos');
  lista.innerHTML = '';

  votosFamilia.forEach((v, i) => {
    const p = PARTIDOS.find((x) => x.id === v.partidoId) || { sigla: v.partidoId, nombre: v.partidoId, color: '#7C8496' };
    const li = document.createElement('li');
    li.className = 'flex items-center gap-3 px-4 py-2.5';
    li.innerHTML = `
      <span class="inline-flex h-7 w-12 items-center justify-center rounded-md text-[12px] font-extrabold text-white" style="background:${p.color}">${p.sigla}</span>
      <span class="flex-1 truncate text-[14px]">${p.nombre}</span>
      <span class="font-display text-[15px] font-extrabold tabular-nums">${v.cantidad} ${v.cantidad === 1 ? 'voto' : 'votos'}</span>
      <button type="button" class="quitar-voto rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600" aria-label="Quitar línea" data-indice="${i}">✕</button>`;
    lista.appendChild(li);
  });

  lista.querySelectorAll('.quitar-voto').forEach((btn) =>
    btn.addEventListener('click', () => quitarVoto(parseInt(btn.dataset.indice, 10)))
  );

  const total = votosFamilia.reduce((s, v) => s + v.cantidad, 0);
  $('#total-votos').textContent = total;
  $('#lista-vacia').classList.toggle('hidden', votosFamilia.length > 0);
  const filaTotal = $('#fila-total');
  filaTotal.classList.toggle('hidden', votosFamilia.length === 0);
  filaTotal.classList.toggle('flex', votosFamilia.length > 0);
}

// ============================================================================
// 6. GUARDAR FAMILIA (RPC registrar_familia)
// ============================================================================

async function guardarFamilia() {
  const u = ubicacionActual();
  const nombre = $('#inp-familia').value.trim();
  const telefono = $('#inp-telefono').value.trim();

  if (!u.departamento) return toast('Selecciona el departamento.', 'aviso');
  if (!u.municipio) return toast('Selecciona el municipio.', 'aviso');
  if (!nombre) return toast('Escribe el nombre o identificador de la familia.', 'aviso');
  if (!telefono) return toast('Escribe el teléfono de la familia.', 'aviso');
  if (votosFamilia.length === 0) return toast('Agrega al menos una línea de votos.', 'aviso');

  const payload = {
    ...u,
    nombre_familia: nombre,
    telefono,
    // registrado_por ya no se envía: el servidor lo toma del correo de la
    // sesión (no se puede falsificar desde el navegador).
    votos: votosFamilia.map((v) => ({ partido: v.partidoId, cantidad: v.cantidad })),
  };

  const btn = $('#btn-guardar');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    const { error } = await sb.rpc('registrar_familia', { payload });
    if (error) throw error;

    toast('Familia registrada correctamente.');
    // Se conserva depto/municipio/comunidad/caserío/barrio: el digitador sigue
    // casa por casa en el mismo lugar. La dirección es de CADA casa → se limpia.
    $('#inp-direccion').value = '';
    $('#inp-familia').value = '';
    $('#inp-telefono').value = '';
    votosFamilia = [];
    renderListaVotos();
    $('#inp-familia').focus();
  } catch (err) {
    const detalle = err && err.message ? err.message : 'sin conexión';
    toast(`No se pudo guardar (${detalle}). Verifica tu señal o la configuración de js/supabaseClient.js.`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar familia';
  }
}

// ============================================================================
// 7. INICIALIZACIÓN
// ============================================================================

function init() {
  $('#form-login').addEventListener('submit', login);
  $('#btn-logout').addEventListener('click', logout);
  document.querySelectorAll('.tab-btn').forEach((btn) =>
    btn.addEventListener('click', () => cambiarSeccion(btn.dataset.seccion))
  );
  $('#btn-agregar-voto').addEventListener('click', agregarVoto);
  $('#btn-guardar').addEventListener('click', guardarFamilia);

  initUbicacion();
  renderChipsPartidos();
  renderListaVotos();

  // Restaurar la sesión que Supabase guarda en el dispositivo:
  // el digitador no tiene que volver a loguearse cada vez que abre la app.
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session) {
      currentUser = usuarioDesdeSesion(data.session);
      mostrarApp();
    }
  });

  // PWA: registrar el service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin PWA, la app sigue funcionando */ });
  }
}

document.addEventListener('DOMContentLoaded', init);
