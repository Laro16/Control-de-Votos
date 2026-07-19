// ============================================================================
// DASHBOARD.JS — solo Administrador
// Censo de UN municipio (Tamahú): la dimensión geográfica que varía es la
// COMUNIDAD, no el departamento/municipio. Por eso los filtros y la gráfica
// de ubicación trabajan a nivel de comunidad.
// Lee la vista "vista_censo" (requiere sesión de Supabase Auth con rol admin),
// pinta 4 KPIs + 2 gráficas con Chart.js y exporta un Excel con formato,
// resumen, gráficas y desglose por comunidad usando ExcelJS.
// ============================================================================

let censoRows = null;   // filas crudas de vista_censo
let chartPartidos = null;
let chartComunidad = null;

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
async function initDashboard(forzar = false) {
  if (censoRows && !forzar) {
    pintarTodo();
    return;
  }

  const aviso = document.querySelector('#dash-aviso');
  aviso.classList.add('hidden');

  // 1) Sesión con rol de administrador. El RLS del servidor bloquea la
  //    lectura a cualquier otro rol; esta verificación solo sirve para dar
  //    un mensaje claro en vez de una pantalla vacía.
  const { data: sesionData } = await sb.auth.getSession();
  const rol = sesionData && sesionData.session
    ? (sesionData.session.user.app_metadata || {}).role
    : null;
  if (rol !== 'admin') {
    aviso.textContent =
      'Tu usuario no tiene rol de administrador. Asígnalo con el BLOQUE 5 de sql/setup.sql ' +
      'y vuelve a cerrar y abrir sesión para que el permiso entre en vigor.';
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

const partidoFiltro   = () => document.querySelector('#f-partido').value;
const comunidadFiltro = () => document.querySelector('#f-comunidad').value;

function filasPorComunidad() {
  const c = comunidadFiltro();
  return c ? censoRows.filter((r) => comunidadDe(r) === c) : censoRows;
}

// --- Pintado general ----------------------------------------------------------

function pintarTodo() {
  pintarResumen();
  pintarChartPartidos();
  pintarChartComunidad();
}

function agrupar(filas, fnClave) {
  const mapa = new Map();
  filas.forEach((r) => {
    const clave = fnClave(r);
    mapa.set(clave, (mapa.get(clave) || 0) + r.cantidad);
  });
  return mapa;
}

function pintarResumen() {
  const filas = filasPorComunidad();               // respeta filtro de comunidad
  const familias = new Set(filas.map((r) => r.familia_id)).size;
  const votos = filas.reduce((s, r) => s + r.cantidad, 0);

  // Cobertura: comunidades con al menos un registro (métrica global del censo)
  const cubiertas = new Set(censoRows.map(comunidadDe)).size;

  // Partido líder dentro del ámbito filtrado
  const porPartido = agrupar(filas, (r) => r.partido);
  let lider = '—';
  let colorLider = INK_900;
  if (votos > 0) {
    const [sigla] = [...porPartido.entries()].sort((a, b) => b[1] - a[1])[0];
    lider = sigla;
    colorLider = colorPartido(sigla);
  }

  document.querySelector('#card-familias').textContent = familias.toLocaleString('es-GT');
  document.querySelector('#card-votos').textContent = votos.toLocaleString('es-GT');
  document.querySelector('#card-comunidades').textContent = cubiertas.toLocaleString('es-GT');
  const totalEl = document.querySelector('#card-comunidades-total');
  if (totalEl) totalEl.textContent = TOTAL_COMUNIDADES ? `de ${TOTAL_COMUNIDADES} comunidades` : 'comunidades';
  const cardLider = document.querySelector('#card-lider');
  cardLider.textContent = lider;
  cardLider.style.color = colorLider;
}

// --- Gráfica A: reparto de votos por partido (en el ámbito filtrado) ---------

function pintarChartPartidos() {
  const filas = filasPorComunidad();
  const lugar = comunidadFiltro() || 'todo el municipio';
  document.querySelector('#titulo-chart-partidos').textContent = `Votos por partido · ${lugar}`;

  const porPartido = agrupar(filas, (r) => r.partido);
  const siglas = PARTIDOS.map((p) => p.id).filter((s) => porPartido.has(s));
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
      // Fondo blanco al exportar a imagen (si no, sale transparente en Excel)
      animation: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { family: 'Inter' } } } },
    },
  });
}

// --- Gráfica B: dónde se concentran los votos, por comunidad -----------------

function pintarChartComunidad() {
  const partido = partidoFiltro();
  const com = comunidadFiltro();

  let filas = filasPorComunidad();
  if (partido) filas = filas.filter((r) => r.partido === partido);

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

  const quien = partido ? nombrePartido(partido).split(' — ')[0] : 'Votos totales';
  document.querySelector('#titulo-chart-comunidad').textContent =
    `${partido ? 'Fuerza de ' + quien : quien} · por ${nivel}`;

  const grupos = [...agrupar(filas, fnClave).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12); // top 12 para que respire

  if (chartComunidad) chartComunidad.destroy();
  chartComunidad = new Chart(document.querySelector('#chart-comunidad'), {
    type: 'bar',
    data: {
      labels: grupos.map(([clave]) => clave),
      datasets: [{
        data: grupos.map(([, total]) => total),
        backgroundColor: partido ? colorPartido(partido) : INK_900,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { precision: 0, font: { family: 'Inter' } }, grid: { color: '#E9EBEF' } },
        y: { ticks: { font: { family: 'Inter' } }, grid: { display: false } },
      },
    },
  });
}

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
    const filasAmbito = filasPorComunidad();
    const ambito = com || 'Todo el municipio (Tamahú)';

    // ---- Métricas -----------------------------------------------------------
    const familias = new Set(filasAmbito.map((r) => r.familia_id)).size;
    const votos = filasAmbito.reduce((s, r) => s + r.cantidad, 0);
    const cubiertas = new Set(censoRows.map(comunidadDe)).size;

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
      ['Votos registrados', votos],
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
    ws.getCell(`E${encTablaFila}`).value = 'VOTOS';
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
      { header: 'Votos',          key: 'votos',      width: 8 },
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
    const wc = wb.addWorksheet('Por comunidad', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    const siglas = PARTIDOS.map((p) => p.id);
    wc.columns = [
      { header: 'Comunidad', key: 'com', width: 26 },
      ...siglas.map((s) => ({ header: s, key: s, width: 9 })),
      { header: 'Total', key: 'total', width: 10 },
    ];
    // Agregación comunidad → {partido: votos}
    const matriz = new Map();
    censoRows.forEach((r) => {
      const c = comunidadDe(r);
      if (!matriz.has(c)) matriz.set(c, {});
      matriz.get(c)[r.partido] = (matriz.get(c)[r.partido] || 0) + r.cantidad;
    });
    [...matriz.entries()]
      .map(([c, obj]) => {
        const total = Object.values(obj).reduce((s, n) => s + n, 0);
        return [c, obj, total];
      })
      .sort((a, b) => b[2] - a[2])
      .forEach(([c, obj, total]) => {
        const fila = { com: c, total };
        siglas.forEach((s) => { fila[s] = obj[s] || 0; });
        wc.addRow(fila);
      });
    estilizarTabla(wc, siglas.length + 2);
    // Colorear encabezados de partido con su color
    siglas.forEach((s, i) => {
      const cell = wc.getRow(1).getCell(i + 2);
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

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#f-partido').addEventListener('change', pintarTodo);
  document.querySelector('#f-comunidad').addEventListener('change', pintarTodo);
  document.querySelector('#btn-refrescar').addEventListener('click', () => initDashboard(true));
  document.querySelector('#btn-exportar').addEventListener('click', exportarExcel);
});
