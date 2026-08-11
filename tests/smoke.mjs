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
  ' filasFiltradas,' +
  ' resumenPorComunidades,' +
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

assert.match(sqlSource, /\bcomunidad\s+text\b/);
assert.match(sqlSource, /\bdireccion\s+text\b/);
assert.match(sqlSource, /grant execute[^;]+to authenticated;/s);
assert.doesNotMatch(sqlSource, /grant execute[^;]+to anon/s);
assert.match(appSource, /cantidad < 1 \|\| cantidad > 50/);
assert.match(appSource, /No se pudo conectar\. Revisa tu conexión/);
assert.match(indexSource, /id="resumen-comunidades"/);
assert.match(indexSource, /id="tabla-comunidades-body"/);
assert.match(indexSource, /id="buscar-comunidad"/);

console.log('OK: filtros, resumen comunitario, validaciones y esquema coherentes.');
