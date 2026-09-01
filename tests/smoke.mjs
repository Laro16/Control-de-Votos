import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dashboardSource = readFileSync(
  new URL('../js/dashboard.js', import.meta.url),
  'utf8'
);
const appSource = readFileSync(
  new URL('../js/app.js', import.meta.url),
  'utf8'
);
const indexSource = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
);
const configSource = readFileSync(
  new URL('../js/configData.js', import.meta.url),
  'utf8'
);
const sqlSource = readFileSync(
  new URL('../sql/setup.sql', import.meta.url),
  'utf8'
);

const filtros = { partido: '', comunidad: '' };
class FakeImage {
  complete = false;
  naturalWidth = 0;
}

const context = vm.createContext({
  console,
  Image: FakeImage,
  PARTIDOS: [
    { id: 'P1', nombre: 'Partido 1', sigla: 'P1', color: '#111111', logo: 'p1.png' },
    { id: 'P2', nombre: 'Partido 2', sigla: 'P2', color: '#222222', logo: 'p2.png' },
    { id: 'NEUTRAL', nombre: 'Sin preferencia', sigla: 'NEUTRAL', color: '#667085', logo: 'neutral.svg' },
  ],
  UBICACIONES: [
    { comunidad: 'Centro' },
    { comunidad: 'Norte' },
  ],
  document: {
    addEventListener() {},
    querySelector(selector) {
      if (selector === '#f-partido') return { value: filtros.partido };
      if (selector === '#f-comunidad') return { value: filtros.comunidad };
      return null;
    },
  },
  window: { addEventListener() {} },
});

vm.runInContext(
  `${dashboardSource}\n` +
  'globalThis.__dashboardTest = {' +
  ' setRows: (rows) => { censoRows = rows; },' +
  ' setPersonas: (rows) => { personasRows = rows; },' +
  ' filasFiltradas,' +
  ' personasFiltradas,' +
  ' resumenPorComunidades,' +
  ' resumenPorFamilias,' +
  ' crearSeguimientoNeutral,' +
  ' ordenarResumenComunidades' +
  '};',
  context
);

const rows = [
  { familia_id: 'F1', comunidad: 'Centro', partido: 'P1', cantidad: 2 },
  { familia_id: 'F2', comunidad: 'Centro', partido: 'P2', cantidad: 1 },
  { familia_id: 'F3', comunidad: 'Norte', partido: 'P1', cantidad: 4 },
];
context.__dashboardTest.setRows(rows);

assert.equal(context.__dashboardTest.filasFiltradas().length, 3);

filtros.partido = 'P1';
assert.equal(context.__dashboardTest.filasFiltradas().length, 2);

filtros.comunidad = 'Centro';
assert.equal(context.__dashboardTest.filasFiltradas().length, 1);

assert.equal(
  context.__dashboardTest.filasFiltradas({ incluirPartido: false }).length,
  2,
  'la gráfica comparativa debe conservar todos los partidos de la comunidad'
);

filtros.partido = '';
filtros.comunidad = '';
const resumen = context.__dashboardTest.resumenPorComunidades(rows);
const centro = resumen.find((r) => r.comunidad === 'Centro');
assert.equal(centro.familias, 2);
assert.equal(centro.partidos.P1, 2);
assert.equal(centro.partidos.P2, 1);
assert.equal(centro.total, 3);
assert.equal(centro.liderId, 'P1');
assert.equal(centro.liderPct, 67);
assert.equal(
  context.__dashboardTest.ordenarResumenComunidades(resumen, 'total-desc')[0].comunidad,
  'Norte'
);

const familiaNeutral = context.__dashboardTest.resumenPorFamilias([
  { familia_id: 'FN', comunidad: 'Julunche', nombre_familia: 'Familia Neutral', modo_registro: 'PERSONAS', partido: 'P1', cantidad: 2 },
  { familia_id: 'FN', comunidad: 'Julunche', nombre_familia: 'Familia Neutral', modo_registro: 'PERSONAS', partido: 'NEUTRAL', cantidad: 3 },
], [
  { familia_id: 'FN', nombre_persona: 'Ana Neutral', partido: 'NEUTRAL' },
])[0];
assert.equal(familiaNeutral.total, 5);
assert.equal(familiaNeutral.preferencias.get('NEUTRAL'), 3);
assert.equal(familiaNeutral.modoRegistro, 'PERSONAS');
assert.equal(familiaNeutral.personas.length, 1);

const seguimiento = context.__dashboardTest.crearSeguimientoNeutral([
  { familia_id: 'FA', comunidad: 'Julunche', nombre_familia: 'Familia A', telefono: '1111', partido: 'NEUTRAL', cantidad: 2 },
  { familia_id: 'FB', comunidad: 'Centro', nombre_familia: 'Familia B', telefono: '2222', partido: 'NEUTRAL', cantidad: 1 },
], [
  { familia_id: 'FB', comunidad: 'Centro', nombre_familia: 'Familia B', nombre_persona: 'Beatriz', telefono_persona: '3333', partido: 'NEUTRAL' },
]);
assert.equal(seguimiento.length, 2, 'no debe duplicar el total familiar cuando existen nombres');
assert.equal(seguimiento.find((r) => r.familia === 'Familia A').cantidad, 2);
assert.equal(seguimiento.find((r) => r.persona === 'Beatriz').telefono, '3333');

assert.match(sqlSource, /\bcomunidad\s+text\b/);
assert.match(sqlSource, /\bdireccion\s+text\b/);
assert.match(sqlSource, /'NEUTRAL'/);
assert.match(sqlSource, /create table if not exists public\.personas/);
assert.match(sqlSource, /modo_registro\s+text not null default 'FAMILIA'/);
assert.match(sqlSource, /create view public\.vista_personas/);
assert.match(sqlSource, /if modo = 'FAMILIA'/);
assert.match(sqlSource, /insert into public\.personas/);
assert.match(sqlSource, /function public\.anular_familia\(familia_objetivo uuid\)/);
assert.match(sqlSource, /set anulado = true/);
assert.match(sqlSource, /grant execute[^;]+to authenticated;/s);
assert.doesNotMatch(sqlSource, /grant execute[^;]+to anon/s);
assert.match(appSource, /cantidad < 1 \|\| cantidad > 50/);
assert.match(appSource, /modo_registro: modoRegistro/);
assert.match(appSource, /personas: modoRegistro === 'PERSONAS'/);
assert.match(appSource, /function agregarPersona\(\)/);
assert.match(appSource, /No se pudo conectar\. Revisa tu conexión/);
assert.match(dashboardSource, /addWorksheet\('Personas'/);
assert.match(dashboardSource, /addWorksheet\('Seguimiento neutral'/);
assert.match(indexSource, /id="resumen-comunidades"/);
assert.match(indexSource, /id="tabla-comunidades-body"/);
assert.match(indexSource, /id="buscar-comunidad"/);
assert.match(indexSource, /id="gestion-registros"/);
assert.match(indexSource, /id="tabla-registros-body"/);
assert.match(indexSource, /id="modo-familia"/);
assert.match(indexSource, /id="modo-personas"/);
assert.match(indexSource, /id="lista-personas"/);
assert.match(indexSource, /img\/logo-censogt\.png/);
assert.match(configSource, /id: 'NEUTRAL'.+nombre: 'Sin preferencia'/);

console.log('OK: captura familiar/individual, seguimiento neutral, eliminación, filtros y esquema coherentes.');
