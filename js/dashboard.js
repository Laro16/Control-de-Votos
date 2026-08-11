// ============================================================================
// DASHBOARD.JS — solo Administrador
// Censo de UN municipio (Tamahú): la dimensión geográfica que varía es la
// COMUNIDAD, no el departamento/municipio. Por eso los filtros y la gráfica
// de ubicación trabajan a nivel de comunidad.
// Lee la vista "vista_censo" (requiere sesión de Supabase Auth con rol admin),
// pinta KPIs, 2 gráficas y una matriz comunidad × partido; también exporta un
// Excel con el mismo resumen territorial usando ExcelJS.
// ============================================================================

let censoRows = null;   // filas crudas de vista_censo
let chartPartidos = null;
let chartComunidad = null;
let ultimaActualizacion = null;

const GRIS_NEUTRO = '#7C8496';
const INK_900 = '#111826';

const colorPartido = (sigla) => {
  const p = PARTIDOS.find((x) => x.id === sigla);
  return p ? p.color : GRIS_NEUTRO;
};
const nombrePartido = (sigla) => {
  const p = PARTIDOS.find((x) => x.id === sigla);
  return p ? `${p.sigla} — ${p.nombre}` : sigla;
};

// Nombre de comunidad "efectivo" de una fila (con respaldos por si vino vacío).
const comunidadDe = (r) => r.comunidad || r.caserio || r.barrio || 'Sin comunidad';

// Universo de comunidades conocidas (del mapa municipal, en configData.js).
const TOTAL_COMUNIDADES =
  (typeof UBICACIONES !== 'undefined' && Array.isArray(UBICACIONES))
    ? new Set(UBICACIONES.map((u) => u.comunidad)).size
    : 0;

// --- Entrada principal (la llama app.js al abrir la pestaña) ----------------
function mostrarEstadoDashboard(mensaje, tipo = 'ok') {
  const texto = document.querySelector('#dash-actualizado');
  const punto = document.querySelector('#dash-estado-punto');
  if (texto) texto.textContent = mensaje;
  if (punto) {
    punto.classList.toggle('is-loading', tipo === 'loading');
    punto.classList.toggle('is-error', tipo === 'error');
  }
}

async function initDashboard(forzar = false) {
  if (censoRows && !forzar) {
    pintarTodo();
    return;
  }

  const aviso = document.querySelector('#dash-aviso');
  const btn = document.querySelector('#btn-refrescar');
  const textoBtn = btn ? btn.textContent : '';
  if (aviso) aviso.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Actualizando…';
  }
  mostrarEstadoDashboard('Actualizando resultados…', 'loading');

  try {
    // 1) Confirmar la sesión y el rol que controla la interfaz.
    const { data: sesionData } = await sb.auth.getSession();
    const rol = sesionData && sesionData.session
      ? (sesionData.session.user.app_metadata || {}).role
      : null;
    if (rol !== 'admin') {
      throw new Error(
        'Tu usuario no tiene rol de administrador. Asígnalo con el BLOQUE 5 de sql/setup.sql ' +
        'y vuelve a cerrar y abrir sesión para que el permiso entre en vigor.'
      );
    }

    // 2) Cargar todas las líneas del censo.
    const { data, error } = await sb
      .from('vista_censo')
      .select('*')
      .order('fecha_registro', { ascending: false });
    if (error) throw error;

    censoRows = data || [];
    ultimaActualizacion = new Date();
    const familias = new Set(censoRows.map((r) => r.familia_id)).size;
    mostrarEstadoDashboard(
      `Actualizado ${ultimaActualizacion.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })} · ${familias.toLocaleString('es-GT')} familias`
    );
    poblarFiltros();
    pintarTodo();
  } catch (err) {
    const mensaje = err && err.message ? err.message : 'No se pudieron cargar los datos.';
    if (aviso) {
      aviso.textContent = mensaje;
      aviso.classList.remove('hidden');
    }
    mostrarEstadoDashboard('No fue posible actualizar los resultados', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = textoBtn || 'Actualizar datos';
    }
  }
}

// --- Filtros -----------------------------------------------------------------

function llenarFiltro(el, valores, etiquetaTodos) {
  if (!el) return;                 // el HTML y el JS no coinciden (caché viejo)
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
  // Partido
  llenarFiltro(
    document.querySelector('#f-partido'),
    PARTIDOS.map((p) => p.id),
    'Todos los partidos'
  );
  [...document.querySelector('#f-partido').options].forEach((o) => {
    if (o.value) o.textContent = nombrePartido(o.value);
  });

  // Comunidad (solo las que tienen registros, ordenadas)
  const comunidades = [...new Set(censoRows.map(comunidadDe))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  llenarFiltro(document.querySelector('#f-comunidad'), comunidades, 'Todas las comunidades');
}

const valorDe = (sel) => {
  const el = document.querySelector(sel);
  return el ? el.value : '';
};
const partidoFiltro   = () => valorDe('#f-partido');
const comunidadFiltro = () => valorDe('#f-comunidad');

// Devuelve un único conjunto de datos coherente para KPIs, gráficas y Excel.
// La gráfica comparativa de partidos puede omitir sólo ese filtro para seguir
// mostrando el contexto completo y atenuar los partidos no seleccionados.
function filasFiltradas({ incluirPartido = true, incluirComunidad = true } = {}) {
  let filas = censoRows || [];
  const partido = partidoFiltro();
  const comunidad = comunidadFiltro();

  if (incluirComunidad && comunidad) {
    filas = filas.filter((r) => comunidadDe(r) === comunidad);
  }
  if (incluirPartido && partido) {
    filas = filas.filter((r) => r.partido === partido);
  }
  return filas;
}

// --- Logos de partido (precargados para poder dibujarlos en el canvas) ------

const LOGOS = {};
PARTIDOS.forEach((p) => {
  const img = new Image();
  img.src = p.logo;
  // Si falta el PNG, la gráfica simplemente no dibuja icono (no se rompe nada).
  img.onerror = () => { img.roto = true; };
  LOGOS[p.id] = img;
});
const logoListo = (img) => img && !img.roto && img.complete && img.naturalWidth > 0;

// --- Plugins de Chart.js ------------------------------------------------------

// Fondo blanco: si no, al exportar a Excel la imagen sale transparente.
const fondoBlanco = {
  id: 'fondoBlanco',
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

// Dibuja el logo del partido en el margen izquierdo, frente a su barra.
const logosEnEje = {
  id: 'logosEnEje',
  afterDraw(chart) {
    const claves = chart.$logoKeys;
    if (!claves) return;
    const eje = chart.scales.y;
    const ctx = chart.ctx;
    const tam = 22;
    claves.forEach((clave, i) => {
      const img = LOGOS[clave];
      if (!logoListo(img)) return;
      const y = eje.getPixelForTick(i);
      if (y == null || Number.isNaN(y)) return;
      ctx.drawImage(img, 4, y - tam / 2, tam, tam);
    });
  },
};

// Escribe el número (y el %) al final de cada barra.
const valorEnBarra = {
  id: 'valorEnBarra',
  afterDatasetsDraw(chart) {
    const total = chart.$total || 0;
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = '600 12px Inter, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    meta.data.forEach((barra, i) => {
      const v = chart.data.datasets[0].data[i];
      if (v == null || v === 0) return;   // la barra vacía ya comunica "0"
      const pct = total > 0 ? Math.round((v / total) * 100) : 0;
      const texto = total > 0 ? `${v.toLocaleString('es-GT')}  (${pct}%)` : String(v);
      const anchoTexto = ctx.measureText(texto).width;
      // Etiqueta a la derecha de la barra si hay lugar; si no, dentro en blanco.
      const cabe = barra.x + 8 + anchoTexto < chart.chartArea.right;
      ctx.fillStyle = cabe ? INK_900 : '#FFFFFF';
      ctx.textAlign = cabe ? 'left' : 'right';
      ctx.fillText(texto, cabe ? barra.x + 8 : barra.x - 8, barra.y);
    });
    ctx.restore();
  },
};

// Opciones comunes a las dos gráficas de barras horizontales.
function opcionesBarra({ total, alClic, etiquetaTooltip }) {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    onClick: alClic,
    onHover: (e, els) => {
      e.native.target.style.cursor = els.length ? 'pointer' : 'default';
    },
    layout: { padding: { right: 56 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: INK_900,
        padding: 10,
        displayColors: false,
        titleFont: { family: 'Inter', size: 12 },
        bodyFont: { family: 'Inter', size: 13, weight: '600' },
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.x;
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            return `${v.toLocaleString('es-GT')} ${etiquetaTooltip} · ${pct}% del total`;
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { precision: 0, font: { family: 'Inter', size: 11 }, color: '#7C8496' },
        grid: { color: '#EDEEF1', drawBorder: false },
      },
      y: {
        ticks: {
          font: { family: 'Inter', size: 12, weight: '600' }, color: INK_900,
          autoSkip: false,
          // Nombres largos (ej. "Cabecera municipal (Tamahú)") se recortan
          // para que no empujen la gráfica ni se solapen.
          callback(valor) {
            const txt = this.getLabelForValue(valor);
            return txt.length > 24 ? txt.slice(0, 23) + '…' : txt;
          },
        },
        grid: { display: false, drawBorder: false },
      },
    },
  };
}

// --- Pintado general ----------------------------------------------------------

function pintarTodo() {
  pintarResumen();
  pintarChartPartidos();
  pintarTablaComunidades();
  pintarChartComunidad();
  actualizarPista();
}

function actualizarPista() {
  const p = partidoFiltro();
  const c = comunidadFiltro();
  const pista = document.querySelector('#pista-filtros');
  const conteo = document.querySelector('#filtros-conteo');
  const chips = document.querySelector('#filtros-activos');
  const exportContext = document.querySelector('#export-context');
  const filtros = [];
  if (p) filtros.push({ tipo: 'partido', texto: `Partido: ${nombrePartido(p)}` });
  if (c) filtros.push({ tipo: 'comunidad', texto: `Comunidad: ${c}` });

  if (conteo) {
    conteo.textContent = filtros.length
      ? `${filtros.length} ${filtros.length === 1 ? 'filtro activo' : 'filtros activos'}`
      : 'Sin filtros';
  }

  if (chips) {
    chips.innerHTML = '';
    filtros.forEach(({ tipo, texto }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dash-filter-chip';
      btn.setAttribute('aria-label', `Quitar filtro ${texto}`);
      btn.append(document.createTextNode(texto));
      const cerrar = document.createElement('span');
      cerrar.textContent = '×';
      cerrar.setAttribute('aria-hidden', 'true');
      btn.appendChild(cerrar);
      btn.addEventListener('click', () => {
        const select = document.querySelector(tipo === 'partido' ? '#f-partido' : '#f-comunidad');
        if (select) select.value = '';
        pintarTodo();
      });
      chips.appendChild(btn);
    });
  }

  const filas = filasFiltradas();
  if (exportContext) {
    const comunidades = new Set(filas.map(comunidadDe)).size;
    const votantes = filas.reduce((s, r) => s + r.cantidad, 0);
    exportContext.textContent = filas.length
      ? `${comunidades} ${comunidades === 1 ? 'comunidad' : 'comunidades'} · ${votantes.toLocaleString('es-GT')} votantes`
      : 'Sin datos para exportar';
  }

  if (!pista) return;
  if (!p && !c) {
    pista.textContent =
      'Toca cualquier barra de las gráficas para filtrar. Tócala otra vez para quitar el filtro.';
    return;
  }
  const partes = [];
  if (p) partes.push(`Partido: ${nombrePartido(p)}`);
  if (c) partes.push(`Comunidad: ${c}`);
  pista.textContent = 'Mostrando → ' + partes.join('   ·   ');
}

function agrupar(filas, fnClave) {
  const mapa = new Map();
  filas.forEach((r) => {
    const clave = fnClave(r);
    mapa.set(clave, (mapa.get(clave) || 0) + r.cantidad);
  });
  return mapa;
}

// --- Matriz comunidad × partido --------------------------------------------

function resumenPorComunidades(filas) {
  const mapa = new Map();

  (filas || []).forEach((r) => {
    const comunidad = comunidadDe(r);
    if (!mapa.has(comunidad)) {
      mapa.set(comunidad, {
        comunidad,
        familiasSet: new Set(),
        partidos: Object.fromEntries(PARTIDOS.map((p) => [p.id, 0])),
        total: 0,
      });
    }

    const item = mapa.get(comunidad);
    item.familiasSet.add(r.familia_id);
    const cantidad = Number(r.cantidad) || 0;
    item.partidos[r.partido] = (item.partidos[r.partido] || 0) + cantidad;
    item.total += cantidad;
  });

  return [...mapa.values()].map((item) => {
    const [liderId, liderVotos] = Object.entries(item.partidos)
      .sort((a, b) => b[1] - a[1])[0] || [null, 0];
    return {
      comunidad: item.comunidad,
      familias: item.familiasSet.size,
      partidos: item.partidos,
      total: item.total,
      liderId: liderVotos > 0 ? liderId : null,
      liderVotos,
      liderPct: item.total > 0 ? Math.round((liderVotos / item.total) * 100) : 0,
    };
  });
}

function ordenarResumenComunidades(resumen, orden = 'total-desc') {
  const copia = [...resumen];
  const porNombre = (a, b) => a.comunidad.localeCompare(b.comunidad, 'es');
  if (orden === 'nombre-asc') return copia.sort(porNombre);
  if (orden === 'familias-desc') {
    return copia.sort((a, b) => b.familias - a.familias || b.total - a.total || porNombre(a, b));
  }
  if (orden === 'lider-asc') {
    return copia.sort((a, b) =>
      String(a.liderId || '').localeCompare(String(b.liderId || ''), 'es') ||
      b.total - a.total || porNombre(a, b)
    );
  }
  return copia.sort((a, b) => b.total - a.total || porNombre(a, b));
}

const normalizarTexto = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

function crearCelda(texto, etiqueta = 'td') {
  const celda = document.createElement(etiqueta);
  celda.textContent = texto;
  return celda;
}

function pintarEncabezadoComunidades() {
  const head = document.querySelector('#tabla-comunidades-head');
  if (!head) return;
  head.innerHTML = '';
  const fila = document.createElement('tr');

  const comunidad = crearCelda('Comunidad', 'th');
  comunidad.scope = 'col';
  fila.appendChild(comunidad);

  const familias = crearCelda('Familias', 'th');
  familias.scope = 'col';
  fila.appendChild(familias);

  PARTIDOS.forEach((p) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.title = p.nombre;
    const contenido = document.createElement('span');
    contenido.className = 'dash-party-head';
    const punto = document.createElement('span');
    punto.className = 'dash-party-dot';
    punto.style.setProperty('--party-color', p.color);
    punto.setAttribute('aria-hidden', 'true');
    contenido.append(punto, document.createTextNode(p.sigla));
    th.appendChild(contenido);
    fila.appendChild(th);
  });

  ['Total', 'Líder', 'Detalle'].forEach((texto) => {
    const th = crearCelda(texto, 'th');
    th.scope = 'col';
    fila.appendChild(th);
  });
  head.appendChild(fila);
}

function pintarTablaComunidades() {
  const body = document.querySelector('#tabla-comunidades-body');
  const foot = document.querySelector('#tabla-comunidades-foot');
  const shell = document.querySelector('.dash-table-shell');
  const vacio = document.querySelector('#tabla-comunidades-vacia');
  const contador = document.querySelector('#comunidades-conteo');
  if (!body || !foot) return;

  pintarEncabezadoComunidades();
  body.innerHTML = '';
  foot.innerHTML = '';

  const resumen = resumenPorComunidades(filasFiltradas());
  const busqueda = normalizarTexto(valorDe('#buscar-comunidad'));
  const orden = valorDe('#orden-comunidades') || 'total-desc';
  const visibles = ordenarResumenComunidades(
    resumen.filter((r) => !busqueda || normalizarTexto(r.comunidad).includes(busqueda)),
    orden
  );

  if (contador) {
    contador.textContent = `Mostrando ${visibles.length} de ${resumen.length} ${resumen.length === 1 ? 'comunidad' : 'comunidades'}`;
  }
  if (shell) shell.classList.toggle('hidden', visibles.length === 0);
  if (vacio) vacio.classList.toggle('hidden', visibles.length > 0);

  const partidoActivo = partidoFiltro();
  const comunidadActiva = comunidadFiltro();
  visibles.forEach((item) => {
    const tr = document.createElement('tr');
    tr.classList.toggle('is-selected', item.comunidad === comunidadActiva);

    const nombre = document.createElement('th');
    nombre.scope = 'row';
    const principal = document.createElement('span');
    principal.className = 'dash-community-name';
    principal.textContent = item.comunidad;
    const secundario = document.createElement('span');
    secundario.className = 'dash-community-sub';
    secundario.textContent = `${item.familias} ${item.familias === 1 ? 'familia' : 'familias'}`;
    nombre.append(principal, secundario);
    tr.appendChild(nombre);

    tr.appendChild(crearCelda(item.familias.toLocaleString('es-GT')));
    PARTIDOS.forEach((p) => {
      const td = crearCelda((item.partidos[p.id] || 0).toLocaleString('es-GT'));
      td.className = 'dash-party-cell';
      td.style.setProperty('--party-color', p.color);
      td.classList.toggle('is-active', partidoActivo === p.id);
      tr.appendChild(td);
    });

    const total = crearCelda(item.total.toLocaleString('es-GT'));
    total.className = 'dash-total-cell';
    tr.appendChild(total);

    const lider = document.createElement('td');
    if (item.liderId) {
      const partido = PARTIDOS.find((p) => p.id === item.liderId);
      const badge = document.createElement('span');
      badge.className = 'dash-leader-badge';
      badge.style.setProperty('--party-color', colorPartido(item.liderId));
      badge.textContent = `${partido ? partido.sigla : item.liderId} · ${item.liderPct}%`;
      lider.appendChild(badge);
    } else {
      lider.textContent = '—';
    }
    tr.appendChild(lider);

    const accion = document.createElement('td');
    const btn = document.createElement('button');
    const seleccionada = item.comunidad === comunidadActiva;
    btn.type = 'button';
    btn.className = 'dash-detail-button';
    btn.textContent = seleccionada ? 'Quitar filtro' : 'Ver detalle';
    btn.setAttribute('aria-label', `${seleccionada ? 'Quitar filtro de' : 'Ver detalle de'} ${item.comunidad}`);
    btn.addEventListener('click', () => {
      const select = document.querySelector('#f-comunidad');
      if (!select) return;
      select.value = seleccionada ? '' : item.comunidad;
      pintarTodo();
      document.querySelector('#filtros-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    accion.appendChild(btn);
    tr.appendChild(accion);
    body.appendChild(tr);
  });

  if (resumen.length > 0) {
    const tr = document.createElement('tr');
    const etiqueta = crearCelda('Total del filtro', 'th');
    etiqueta.scope = 'row';
    tr.appendChild(etiqueta);
    tr.appendChild(crearCelda(resumen.reduce((s, r) => s + r.familias, 0).toLocaleString('es-GT')));
    PARTIDOS.forEach((p) => {
      tr.appendChild(crearCelda(
        resumen.reduce((s, r) => s + (r.partidos[p.id] || 0), 0).toLocaleString('es-GT')
      ));
    });
    tr.appendChild(crearCelda(resumen.reduce((s, r) => s + r.total, 0).toLocaleString('es-GT')));
    tr.appendChild(crearCelda('—'));
    tr.appendChild(crearCelda(''));
    foot.appendChild(tr);
  }
}

function pintarResumen() {
  const filas = filasFiltradas();
  const familias = new Set(filas.map((r) => r.familia_id)).size;
  const votos = filas.reduce((s, r) => s + r.cantidad, 0);

  const cubiertas = new Set(filas.map(comunidadDe)).size;

  // Partido líder dentro del ámbito filtrado
  const porPartido = agrupar(filas, (r) => r.partido);
  let lider = '—';
  let colorLider = INK_900;
  let siglaLider = null;
  let pctLider = 0;
  if (votos > 0) {
    const [sigla, cant] = [...porPartido.entries()].sort((a, b) => b[1] - a[1])[0];
    siglaLider = sigla;
    pctLider = Math.round((cant / votos) * 100);
    const p = PARTIDOS.find((x) => x.id === sigla);
    lider = p ? p.nombre : sigla;
    colorLider = colorPartido(sigla);
  }

  document.querySelector('#card-familias').textContent = familias.toLocaleString('es-GT');
  document.querySelector('#card-votos').textContent = votos.toLocaleString('es-GT');
  document.querySelector('#card-comunidades').textContent = cubiertas.toLocaleString('es-GT');
  const totalEl = document.querySelector('#card-comunidades-total');
  if (totalEl) {
    totalEl.textContent = partidoFiltro() || comunidadFiltro()
      ? 'con el filtro actual'
      : (TOTAL_COMUNIDADES ? `de ${TOTAL_COMUNIDADES} comunidades` : 'comunidades');
  }

  // Promedio de votos por familia (ayuda a detectar cifras raras al digitar)
  const promEl = document.querySelector('#card-votos-prom');
  if (promEl) {
    promEl.innerHTML = familias > 0
      ? `≈ ${(votos / familias).toLocaleString('es-GT', { maximumFractionDigits: 1 })} por familia`
      : '&nbsp;';
  }

  const cardLider = document.querySelector('#card-lider');
  cardLider.textContent = lider;
  cardLider.style.color = colorLider;

  const liderLabel = document.querySelector('#card-lider-label');
  if (liderLabel) liderLabel.textContent = partidoFiltro() ? 'Partido filtrado' : 'Partido líder';

  const pctEl = document.querySelector('#card-lider-pct');
  if (pctEl) pctEl.innerHTML = siglaLider ? `${pctLider}% de los votos` : '&nbsp;';

  const logoLider = document.querySelector('#card-lider-logo');
  const pLider = siglaLider ? PARTIDOS.find((x) => x.id === siglaLider) : null;
  if (pLider) {
    logoLider.src = pLider.logo;
    logoLider.classList.remove('hidden');
    logoLider.onerror = () => logoLider.classList.add('hidden');
  } else {
    logoLider.classList.add('hidden');
  }
}

// Muestra u oculta el mensaje de "sin datos" sobre una gráfica.
function mostrarVacio(id, mostrar) {
  const el = document.querySelector(id);
  if (!el) return;
  el.classList.toggle('hidden', !mostrar);
  el.classList.toggle('flex', mostrar);
}

// --- Gráfica A: votos por partido (barras horizontales, con logo) -------------

function pintarChartPartidos() {
  const filas = filasFiltradas({ incluirPartido: false });
  const lugar = comunidadFiltro() || 'todo el municipio';
  document.querySelector('#titulo-chart-partidos').textContent = `Votantes por partido · ${lugar}`;

  const porPartido = agrupar(filas, (r) => r.partido);
  // Todos los partidos aparecen (aunque tengan 0), ordenados de mayor a menor.
  const datos = PARTIDOS
    .map((p) => ({ id: p.id, nombre: p.nombre, total: porPartido.get(p.id) || 0 }))
    .sort((a, b) => b.total - a.total);

  const total = datos.reduce((s, d) => s + d.total, 0);
  const seleccionado = partidoFiltro();

  mostrarVacio('#vacio-partidos', total === 0);

  if (chartPartidos) chartPartidos.destroy();
  chartPartidos = new Chart(document.querySelector('#chart-partidos'), {
    type: 'bar',
    plugins: [fondoBlanco, logosEnEje, valorEnBarra],
    data: {
      labels: datos.map((d) => d.nombre),
      datasets: [{
        data: datos.map((d) => d.total),
        backgroundColor: datos.map((d) =>
          // Si hay un partido seleccionado, los demás se atenúan.
          !seleccionado || seleccionado === d.id ? colorPartido(d.id) : '#D8DBE1'
        ),
        borderRadius: 6,
        barPercentage: 0.72,
      }],
    },
    options: opcionesBarra({
      total,
      etiquetaTooltip: 'votantes',
      alClic: (evt, els) => {
        if (!els.length) return;
        const id = datos[els[0].index].id;
        const sel = document.querySelector('#f-partido');
        sel.value = sel.value === id ? '' : id;   // volver a tocar = quitar filtro
        pintarTodo();
      },
    }),
  });

  // Espacio a la izquierda para los logos + qué logo va en cada fila
  chartPartidos.$logoKeys = datos.map((d) => d.id);
  chartPartidos.$total = total;
  chartPartidos.options.layout.padding.left = 30;
  chartPartidos.update('none');
}

// --- Gráfica B: dónde se concentran los votos --------------------------------

function pintarChartComunidad() {
  const partido = partidoFiltro();
  const com = comunidadFiltro();
  const filas = filasFiltradas();

  // Sin comunidad fija → agrupamos por comunidad.
  // Con una comunidad fija → bajamos un nivel (caserío / barrio) para el detalle.
  let fnClave, nivel;
  if (com) {
    fnClave = (r) => r.caserio || r.barrio || r.direccion || 'Sin detalle';
    nivel = 'caserío';
  } else {
    fnClave = comunidadDe;
    nivel = 'comunidad';
  }

  const quien = partido ? nombrePartido(partido) : 'Votantes totales';
  document.querySelector('#titulo-chart-comunidad').textContent = `${quien} · por ${nivel}`;

  const todos = [...agrupar(filas, fnClave).entries()].sort((a, b) => b[1] - a[1]);
  const grupos = todos.slice(0, 10);
  const sub = document.querySelector('#sub-chart-comunidad');
  if (sub) {
    sub.textContent = todos.length > 10
      ? `Mostrando las 10 de ${todos.length} con más votantes; la tabla incluye todas`
      : `${todos.length} ${nivel === 'caserío' ? 'caseríos' : 'comunidades'} con registros`;
  }

  const total = todos.reduce((s, g) => s + g[1], 0);
  const colorBarra = partido ? colorPartido(partido) : INK_900;

  mostrarVacio('#vacio-comunidad', grupos.length === 0);

  if (chartComunidad) chartComunidad.destroy();
  chartComunidad = new Chart(document.querySelector('#chart-comunidad'), {
    type: 'bar',
    plugins: [fondoBlanco, valorEnBarra],
    data: {
      labels: grupos.map(([clave]) => clave),
      datasets: [{
        data: grupos.map(([, t]) => t),
        backgroundColor: colorBarra,
        borderRadius: 6,
        barPercentage: 0.75,
      }],
    },
    options: opcionesBarra({
      total,
      etiquetaTooltip: 'votantes',
      alClic: (evt, els) => {
        if (!els.length) return;
        // Solo se filtra al hacer clic cuando estamos viendo comunidades.
        if (com) return;
        const clave = grupos[els[0].index][0];
        const sel = document.querySelector('#f-comunidad');
        if (![...sel.options].some((o) => o.value === clave)) return;
        sel.value = sel.value === clave ? '' : clave;
        pintarTodo();
      },
    }),
  });
  chartComunidad.$total = total;
  chartComunidad.update('none');
}

// Cuando terminan de cargar los PNG, se repintan las gráficas para que salgan.
window.addEventListener('load', () => {
  Object.values(LOGOS).forEach((img) => {
    if (!img.complete) img.addEventListener('load', () => { if (chartPartidos) chartPartidos.update('none'); });
  });
});

// ============================================================================
// EXPORTACIÓN A EXCEL (ExcelJS) — Resumen + gráficas + Detalle + Por comunidad
// ============================================================================

const XL = {
  ink:    'FF111826',
  ink700: 'FF2A3244',
  gris:   'FF5A6376',
  franja: 'FFF4F5F7',
  blanco: 'FFFFFFFF',
  verde:  'FF16A34A',
};
const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();

async function exportarExcel() {
  if (!censoRows || censoRows.length === 0) {
    return toast('Todavía no hay datos para exportar.', 'aviso');
  }
  if (typeof ExcelJS === 'undefined') {
    return toast('No se cargó ExcelJS (revisa tu conexión y recarga la página).', 'error');
  }

  const filasAmbito = filasFiltradas();
  if (filasAmbito.length === 0) {
    return toast('No hay datos que coincidan con los filtros actuales.', 'aviso');
  }

  const btn = document.querySelector('#btn-exportar');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generando…';

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Soluciones Digitales GT';
    wb.created = new Date();

    // Ámbito actual (para que el Excel refleje lo que ve el admin)
    const com = comunidadFiltro();
    const partido = partidoFiltro();
    const partesAmbito = [];
    if (com) partesAmbito.push(`Comunidad: ${com}`);
    if (partido) partesAmbito.push(`Partido: ${nombrePartido(partido)}`);
    const ambito = partesAmbito.length
      ? partesAmbito.join(' · ')
      : 'Todo el municipio (Tamahú)';

    // ---- Métricas -----------------------------------------------------------
    const familias = new Set(filasAmbito.map((r) => r.familia_id)).size;
    const votos = filasAmbito.reduce((s, r) => s + r.cantidad, 0);
    const cubiertas = new Set(filasAmbito.map(comunidadDe)).size;

    const porPartido = [...agrupar(filasAmbito, (r) => r.partido).entries()]
      .sort((a, b) => b[1] - a[1]);
    const lider = porPartido.length ? porPartido[0][0] : '—';

    // ========================================================================
    // HOJA 1 · RESUMEN
    // ========================================================================
    const ws = wb.addWorksheet('Resumen', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait' },
    });
    ws.columns = [
      { width: 3 }, { width: 26 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 3 },
    ];

    // Franja de título
    ws.mergeCells('B2:E2');
    const t = ws.getCell('B2');
    t.value = 'Censo de popularidad · Tamahú, Alta Verapaz';
    t.font = { name: 'Arial', size: 15, bold: true, color: { argb: XL.blanco } };
    t.alignment = { vertical: 'middle', indent: 1 };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.ink } };
    ws.getRow(2).height = 30;

    ws.mergeCells('B3:E3');
    const sub = ws.getCell('B3');
    sub.value = `Ámbito: ${ambito}   ·   Generado: ${new Date().toLocaleString('es-GT')}`;
    sub.font = { name: 'Arial', size: 9, color: { argb: XL.gris } };
    sub.alignment = { indent: 1 };

    // Tarjetas KPI (fila 5)
    const kpis = [
      ['Familias censadas', familias],
      ['Votantes registrados', votos],
      ['Comunidades cubiertas', TOTAL_COMUNIDADES ? `${cubiertas} / ${TOTAL_COMUNIDADES}` : cubiertas],
      ['Partido líder', lider],
    ];
    let fila = 5;
    kpis.forEach(([etq, val], i) => {
      const rEtq = fila + i * 2;
      const rVal = rEtq + 1;
      const cEtq = ws.getCell(`B${rEtq}`);
      cEtq.value = etq.toUpperCase();
      cEtq.font = { name: 'Arial', size: 8, bold: true, color: { argb: XL.gris } };
      const cVal = ws.getCell(`B${rVal}`);
      cVal.value = typeof val === 'number' ? val : String(val);
      cVal.font = { name: 'Arial', size: 20, bold: true,
        color: { argb: etq === 'Partido líder' ? argb(colorPartido(lider)) : XL.ink } };
      if (typeof val === 'number') cVal.numFmt = '#,##0';
    });

    // Tabla "Votos por partido" (a la derecha de los KPIs)
    const encTablaFila = 5;
    ws.getCell(`D${encTablaFila}`).value = 'PARTIDO';
    ws.getCell(`E${encTablaFila}`).value = 'VOTANTES';
    ['D', 'E'].forEach((c) => {
      const cell = ws.getCell(`${c}${encTablaFila}`);
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: XL.blanco } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.ink700 } };
      cell.alignment = { horizontal: c === 'E' ? 'right' : 'left', indent: 1 };
    });
    porPartido.forEach(([sigla, cant], i) => {
      const r = encTablaFila + 1 + i;
      const cP = ws.getCell(`D${r}`);
      cP.value = nombrePartido(sigla);
      cP.font = { name: 'Arial', size: 10, color: { argb: argb(colorPartido(sigla)) }, bold: true };
      const cV = ws.getCell(`E${r}`);
      cV.value = cant;
      cV.numFmt = '#,##0';
      cV.alignment = { horizontal: 'right', indent: 1 };
      if (i % 2 === 1) {
        [cP, cV].forEach((x) => x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.franja } });
      }
    });

    // Gráficas (imágenes de los charts en pantalla — reflejan el filtro actual)
    const filaGraficas = fila + kpis.length * 2 + 1;
    ws.mergeCells(`B${filaGraficas}:E${filaGraficas}`);
    const gTit = ws.getCell(`B${filaGraficas}`);
    gTit.value = 'Gráficas';
    gTit.font = { name: 'Arial', size: 11, bold: true, color: { argb: XL.ink } };

    const agregarImagen = (chart, filaTop, alto) => {
      if (!chart) return filaTop;
      try {
        const base64 = chart.toBase64Image('image/png', 1);
        const id = wb.addImage({ base64, extension: 'png' });
        ws.addImage(id, {
          tl: { col: 1, row: filaTop },        // columna B (índice 1)
          ext: { width: 460, height: alto },
          editAs: 'oneCell',
        });
      } catch (e) { /* si el chart no está listo, se omite */ }
      return filaTop;
    };
    const inicioG = filaGraficas; // fila índice base 0 aproximada
    agregarImagen(chartPartidos, inicioG, 240);
    agregarImagen(chartComunidad, inicioG + 14, 260);

    // ========================================================================
    // HOJA 2 · DETALLE (todas las filas del ámbito)
    // ========================================================================
    const wd = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
    const cols = [
      { header: 'Comunidad',      key: 'comunidad',  width: 24 },
      { header: 'Caserío',        key: 'caserio',    width: 18 },
      { header: 'Barrio',         key: 'barrio',     width: 16 },
      { header: 'Dirección',      key: 'direccion',  width: 22 },
      { header: 'Familia',        key: 'familia',    width: 26 },
      { header: 'Teléfono',       key: 'telefono',   width: 14 },
      { header: 'Partido',        key: 'partido',    width: 10 },
      { header: 'Votantes',       key: 'votos',      width: 10 },
      { header: 'Registrado por', key: 'registrado', width: 24 },
      { header: 'Fecha',          key: 'fecha',      width: 20 },
    ];
    wd.columns = cols;
    filasAmbito.forEach((r) => {
      wd.addRow({
        comunidad: comunidadDe(r),
        caserio: r.caserio || '',
        barrio: r.barrio || '',
        direccion: r.direccion || '',
        familia: r.nombre_familia,
        telefono: r.telefono || '',
        partido: r.partido,
        votos: r.cantidad,
        registrado: r.registrado_por || '',
        fecha: new Date(r.fecha_registro).toLocaleString('es-GT'),
      });
    });
    estilizarTabla(wd, cols.length);

    // ========================================================================
    // HOJA 3 · POR COMUNIDAD (matriz comunidad × partido)
    // ========================================================================
    const wc = wb.addWorksheet('Por comunidad', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
    const siglas = partido ? [partido] : PARTIDOS.map((p) => p.id);
    wc.columns = [
      { header: 'Comunidad', key: 'com', width: 26 },
      { header: 'Familias', key: 'familias', width: 10 },
      ...siglas.map((s) => ({ header: s, key: s, width: 9 })),
      { header: 'Total votantes', key: 'total', width: 14 },
      { header: 'Partido líder', key: 'lider', width: 22 },
    ];
    const resumenComunidades = ordenarResumenComunidades(
      resumenPorComunidades(filasAmbito),
      'total-desc'
    );
    resumenComunidades.forEach((item) => {
        const fila = {
          com: item.comunidad,
          familias: item.familias,
          total: item.total,
          lider: item.liderId
            ? `${nombrePartido(item.liderId)} (${item.liderPct}%)`
            : '—',
        };
        siglas.forEach((s) => { fila[s] = item.partidos[s] || 0; });
        wc.addRow(fila);
      });
    const totalComunidad = {
      com: 'TOTAL DEL FILTRO',
      familias: new Set(filasAmbito.map((r) => r.familia_id)).size,
      total: filasAmbito.reduce((s, r) => s + r.cantidad, 0),
      lider: '',
    };
    siglas.forEach((s) => {
      totalComunidad[s] = filasAmbito
        .filter((r) => r.partido === s)
        .reduce((suma, r) => suma + r.cantidad, 0);
    });
    const filaTotal = wc.addRow(totalComunidad);
    filaTotal.font = { name: 'Arial', size: 10, bold: true };

    estilizarTabla(wc, siglas.length + 4);
    // Colorear encabezados de partido con su color
    siglas.forEach((s, i) => {
      const cell = wc.getRow(1).getCell(i + 3);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(colorPartido(s)) } };
    });

    // ---- Descargar ----------------------------------------------------------
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fecha = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `censo_tamahu_${fecha}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);

    toast('Excel generado.');
  } catch (err) {
    const detalle = err && err.message ? err.message : 'error desconocido';
    toast('No se pudo generar el Excel: ' + detalle, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

// Encabezado de color, filas alternadas y borde inferior fino.
function estilizarTabla(ws, nCols) {
  const enc = ws.getRow(1);
  enc.height = 22;
  for (let c = 1; c <= nCols; c++) {
    const cell = enc.getCell(c);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: XL.blanco } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.ink } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  }
  ws.eachRow((row, n) => {
    if (n === 1) return;
    if (n % 2 === 0) {
      for (let c = 1; c <= nCols; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.franja } };
      }
    }
    row.eachCell((cell) => {
      cell.font = cell.font || { name: 'Arial', size: 10 };
      if (!cell.alignment) cell.alignment = { indent: 1 };
    });
  });
}

// --- Eventos de la sección ------------------------------------------------------

// Si un elemento no existe (por ejemplo, index.html nuevo con JS viejo en caché),
// se omite ese listener en vez de romper toda la inicialización del panel.
function alEvento(sel, evento, fn) {
  const el = document.querySelector(sel);
  if (el) el.addEventListener(evento, fn);
}

document.addEventListener('DOMContentLoaded', () => {
  alEvento('#f-partido', 'change', pintarTodo);
  alEvento('#f-comunidad', 'change', pintarTodo);
  alEvento('#buscar-comunidad', 'input', pintarTablaComunidades);
  alEvento('#orden-comunidades', 'change', pintarTablaComunidades);
  alEvento('#btn-refrescar', 'click', () => initDashboard(true));
  alEvento('#btn-limpiar', 'click', () => {
    const p = document.querySelector('#f-partido');
    const c = document.querySelector('#f-comunidad');
    const b = document.querySelector('#buscar-comunidad');
    if (p) p.value = '';
    if (c) c.value = '';
    if (b) b.value = '';
    pintarTodo();
  });
  alEvento('#btn-exportar', 'click', exportarExcel);
});
