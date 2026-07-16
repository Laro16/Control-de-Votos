// ============================================================================
// DASHBOARD.JS — solo Administrador
// Lee la vista "vista_censo" (requiere sesión de Supabase Auth),
// pinta resumen + 2 gráficas con Chart.js y exporta todo a Excel.
// ============================================================================

let censoRows = null;   // filas crudas de vista_censo
let chartPartidos = null;
let chartUbicacion = null;

const GRIS_NEUTRO = '#7C8496';
const colorPartido = (sigla) => {
  const p = PARTIDOS.find((x) => x.id === sigla);
  return p ? p.color : GRIS_NEUTRO;
};
const nombrePartido = (sigla) => {
  const p = PARTIDOS.find((x) => x.id === sigla);
  return p ? `${p.sigla} — ${p.nombre}` : sigla;
};

// --- Entrada principal (la llama app.js al abrir la pestaña) ----------------
async function initDashboard(forzar = false) {
  if (censoRows && !forzar) {
    pintarTodo();
    return;
  }

  const aviso = document.querySelector('#dash-aviso');
  aviso.classList.add('hidden');

  // 1) Sesión real de Supabase (sin ella, el RLS bloquea toda lectura)
  const sesion = await ensureAdminSession();
  if (!sesion.ok) {
    aviso.textContent =
      'No se pudo iniciar la sesión del dashboard en Supabase (' + sesion.mensaje + '). ' +
      'Verifica el paso 3 del README: crear el usuario en Authentication → Users con el mismo correo y contraseña que están en js/app.js.';
    aviso.classList.remove('hidden');
    return;
  }

  // 2) Datos
  const { data, error } = await sb
    .from('vista_censo')
    .select('*')
    .order('fecha_registro', { ascending: false });

  if (error) {
    aviso.textContent = 'No se pudieron cargar los datos: ' + error.message;
    aviso.classList.remove('hidden');
    return;
  }

  censoRows = data || [];
  poblarFiltros();
  pintarTodo();
}

// --- Filtros -----------------------------------------------------------------

function llenarFiltro(el, valores, etiquetaTodos) {
  const previo = el.value;
  el.innerHTML = '';
  const todos = document.createElement('option');
  todos.value = '';
  todos.textContent = etiquetaTodos;
  el.appendChild(todos);
  valores.forEach((v) => {
    const op = document.createElement('option');
    op.value = v;
    op.textContent = v;
    el.appendChild(op);
  });
  if ([...el.options].some((o) => o.value === previo)) el.value = previo;
}

function poblarFiltros() {
  llenarFiltro(
    document.querySelector('#f-partido'),
    PARTIDOS.map((p) => p.id),
    'Todos los partidos'
  );
  // Muestra el nombre completo del partido en el filtro
  [...document.querySelector('#f-partido').options].forEach((o) => {
    if (o.value) o.textContent = nombrePartido(o.value);
  });

  const deps = [...new Set(censoRows.map((r) => r.departamento))].sort((a, b) => a.localeCompare(b, 'es'));
  llenarFiltro(document.querySelector('#f-departamento'), deps, 'Todos los departamentos');
  poblarFiltroMunicipio();
}

function poblarFiltroMunicipio() {
  const dep = document.querySelector('#f-departamento').value;
  const filas = dep ? censoRows.filter((r) => r.departamento === dep) : censoRows;
  const muns = [...new Set(filas.map((r) => r.municipio))].sort((a, b) => a.localeCompare(b, 'es'));
  llenarFiltro(document.querySelector('#f-municipio'), muns, 'Todos los municipios');
}

function filasFiltradasPorUbicacion() {
  const dep = document.querySelector('#f-departamento').value;
  const mun = document.querySelector('#f-municipio').value;
  return censoRows.filter(
    (r) => (!dep || r.departamento === dep) && (!mun || r.municipio === mun)
  );
}

// --- Pintado general ----------------------------------------------------------

function pintarTodo() {
  pintarResumen();
  pintarChartPartidos();
  pintarChartUbicacion();
}

function pintarResumen() {
  const filas = filasFiltradasPorUbicacion();
  const familias = new Set(filas.map((r) => r.familia_id)).size;
  const votos = filas.reduce((s, r) => s + r.cantidad, 0);

  const porPartido = agrupar(filas, (r) => r.partido);
  let lider = '—';
  let colorLider = '#111826';
  if (votos > 0) {
    const [sigla] = [...porPartido.entries()].sort((a, b) => b[1] - a[1])[0];
    lider = sigla;
    colorLider = colorPartido(sigla);
  }

  document.querySelector('#card-familias').textContent = familias.toLocaleString('es-GT');
  document.querySelector('#card-votos').textContent = votos.toLocaleString('es-GT');
  const cardLider = document.querySelector('#card-lider');
  cardLider.textContent = lider;
  cardLider.style.color = colorLider;
}

function agrupar(filas, fnClave) {
  const mapa = new Map();
  filas.forEach((r) => {
    const clave = fnClave(r);
    mapa.set(clave, (mapa.get(clave) || 0) + r.cantidad);
  });
  return mapa;
}

// --- Gráfica A: qué partido lidera en la ubicación filtrada -------------------

function pintarChartPartidos() {
  const dep = document.querySelector('#f-departamento').value;
  const mun = document.querySelector('#f-municipio').value;
  const filas = filasFiltradasPorUbicacion();

  const lugar = mun || dep || 'todo el territorio';
  document.querySelector('#titulo-chart-partidos').textContent = `Votos por partido · ${lugar}`;

  const porPartido = agrupar(filas, (r) => r.partido);
  const siglas = PARTIDOS.map((p) => p.id).filter((s) => porPartido.has(s));
  // Partidos fuera del catálogo (por si cambió configData) al final
  [...porPartido.keys()].forEach((s) => { if (!siglas.includes(s)) siglas.push(s); });

  if (chartPartidos) chartPartidos.destroy();
  chartPartidos = new Chart(document.querySelector('#chart-partidos'), {
    type: 'doughnut',
    data: {
      labels: siglas.map(nombrePartido),
      datasets: [{
        data: siglas.map((s) => porPartido.get(s)),
        backgroundColor: siglas.map(colorPartido),
        borderColor: '#FFFFFF',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { family: 'Inter' } } } },
    },
  });
}

// --- Gráfica B: dónde es más fuerte el partido seleccionado -------------------

function pintarChartUbicacion() {
  const partido = document.querySelector('#f-partido').value;
  const dep = document.querySelector('#f-departamento').value;
  const mun = document.querySelector('#f-municipio').value;

  let filas = filasFiltradasPorUbicacion();
  if (partido) filas = filas.filter((r) => r.partido === partido);

  // Nivel de agrupación: sin filtros → departamento; con departamento →
  // municipio; con municipio → localidad (caserío / aldea / barrio).
  let fnClave, nivel;
  if (mun) {
    fnClave = (r) => r.caserio || r.aldea || r.barrio || 'Centro / sin detalle';
    nivel = 'localidad';
  } else if (dep) {
    fnClave = (r) => r.municipio;
    nivel = 'municipio';
  } else {
    fnClave = (r) => r.departamento;
    nivel = 'departamento';
  }

  const titulo = partido
    ? `Dónde es más fuerte ${partido} · por ${nivel}`
    : `Votos totales · por ${nivel}`;
  document.querySelector('#titulo-chart-ubicacion').textContent = titulo;

  const grupos = [...agrupar(filas, fnClave).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12); // top 12 para que la gráfica respire

  if (chartUbicacion) chartUbicacion.destroy();
  chartUbicacion = new Chart(document.querySelector('#chart-ubicacion'), {
    type: 'bar',
    data: {
      labels: grupos.map(([clave]) => clave),
      datasets: [{
        data: grupos.map(([, total]) => total),
        backgroundColor: partido ? colorPartido(partido) : '#1D2432',
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { precision: 0, font: { family: 'Inter' } }, grid: { color: '#E9EBEF' } },
        y: { ticks: { font: { family: 'Inter' } }, grid: { display: false } },
      },
    },
  });
}

// --- Exportación a Excel -------------------------------------------------------

function exportarExcel() {
  if (!censoRows || censoRows.length === 0) {
    return toast('Todavía no hay datos para exportar.', 'aviso');
  }

  const filas = censoRows.map((r) => ({
    'Departamento': r.departamento,
    'Municipio': r.municipio,
    'Aldea': r.aldea || '',
    'Caserío': r.caserio || '',
    'Barrio': r.barrio || '',
    'Familia': r.nombre_familia,
    'Teléfono': r.telefono || '',
    'Partido': r.partido,
    'Votos': r.cantidad,
    'Registrado por': r.registrado_por || '',
    'Fecha': new Date(r.fecha_registro).toLocaleString('es-GT'),
  }));

  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = Object.keys(filas[0]).map((k) => ({
    wch: Math.max(k.length, ...filas.map((f) => String(f[k]).length)) + 2,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Censo');

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `censo_${fecha}.xlsx`);
}

// --- Eventos de la sección ------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#f-partido').addEventListener('change', pintarTodo);
  document.querySelector('#f-departamento').addEventListener('change', () => {
    poblarFiltroMunicipio();
    pintarTodo();
  });
  document.querySelector('#f-municipio').addEventListener('change', pintarTodo);
  document.querySelector('#btn-refrescar').addEventListener('click', () => initDashboard(true));
  document.querySelector('#btn-exportar').addEventListener('click', exportarExcel);
});
