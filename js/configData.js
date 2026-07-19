// ============================================================================
// CONFIGURACIÓN DE DATOS
// Ubicaciones generadas del mapa municipal "Ubicación de Comunidades"
// (Municipalidad de Tamahú, IUSI Catastro-Ortofotos-RIC, año 2021).
// ============================================================================

// --- PARTIDOS (6) -----------------------------------------------------------
// id/sigla : se guarda en la base de datos (no cambiar después de tener datos)
// color    : se usa en las gráficas del dashboard y en las fichas del formulario
// logo     : ruta del PNG dentro de img/partidos/ (reemplazar los placeholders)
const PARTIDOS = [
  { id: 'P1', nombre: 'Prosperidad Ciudadana', sigla: 'PC',       color: '#DC2626', logo: 'img/partidos/p1.png' },
  { id: 'P2', nombre: 'Cabal',                 sigla: 'CABAL',    color: '#2563EB', logo: 'img/partidos/p2.png' },
  { id: 'P3', nombre: 'Valor',                 sigla: 'VALOR',    color: '#16A34A', logo: 'img/partidos/p3.png' },
  { id: 'P4', nombre: 'Victoria',              sigla: 'VICTORIA', color: '#D97706', logo: 'img/partidos/p4.png' },
  { id: 'P5', nombre: 'UNE',                   sigla: 'UNE',      color: '#7C3AED', logo: 'img/partidos/p5.png' },
  { id: 'P6', nombre: 'Elefante',              sigla: 'ELEFANTE', color: '#0891B2', logo: 'img/partidos/p6.png' },
];

// --- UBICACIONES -------------------------------------------------------------
// Censo de un solo municipio: Tamahú, Alta Verapaz. Los selects se eligen
// solos al abrir la app (única opción). La columna "comunidad" alimenta las
// SUGERENCIAS del campo Comunidad; si un lugar no aparece, se escribe libre.
const D = 'Alta Verapaz';
const M = 'Tamahú';
const UBICACIONES = [
  { departamento: D, municipio: M, comunidad: 'Cabecera municipal (Tamahú)' },

  // Aldeas (según el mapa: símbolo de triángulo)
  { departamento: D, municipio: M, comunidad: 'Sesarb' },
  { departamento: D, municipio: M, comunidad: 'Sesarb II' },
  { departamento: D, municipio: M, comunidad: 'Sequib' },
  { departamento: D, municipio: M, comunidad: 'San Pablo Sesooch' },

  // Caseríos
  { departamento: D, municipio: M, comunidad: 'Arenal' },
  { departamento: D, municipio: M, comunidad: 'Atipal' },
  { departamento: D, municipio: M, comunidad: 'Cantilha' },
  { departamento: D, municipio: M, comunidad: 'Caserío La Libertad' },
  { departamento: D, municipio: M, comunidad: 'Caserío Pancoj' },
  { departamento: D, municipio: M, comunidad: 'Catilhá' },
  { departamento: D, municipio: M, comunidad: 'Chijicay' },
  { departamento: D, municipio: M, comunidad: 'Chimulun' },
  { departamento: D, municipio: M, comunidad: 'Chipocaj' },
  { departamento: D, municipio: M, comunidad: 'Chiquin Guaxcux' },
  { departamento: D, municipio: M, comunidad: 'Chitiulub' },
  { departamento: D, municipio: M, comunidad: 'Comonhoj' },
  { departamento: D, municipio: M, comunidad: 'Concepción de María' },
  { departamento: D, municipio: M, comunidad: 'Eben Ezer II' },
  { departamento: D, municipio: M, comunidad: 'El Mirador' },
  { departamento: D, municipio: M, comunidad: 'Guaxaxul' },
  { departamento: D, municipio: M, comunidad: 'Ixcamul' },
  { departamento: D, municipio: M, comunidad: 'Jolomche' },
  { departamento: D, municipio: M, comunidad: 'La Soledad' },
  { departamento: D, municipio: M, comunidad: 'Nachuwá' },
  { departamento: D, municipio: M, comunidad: 'Naxombal' },
  { departamento: D, municipio: M, comunidad: 'Nueva Esperanza' },
  { departamento: D, municipio: M, comunidad: 'Nuevo San Marcos' },
  { departamento: D, municipio: M, comunidad: 'Orquilha' },
  { departamento: D, municipio: M, comunidad: 'Pancox' },
  { departamento: D, municipio: M, comunidad: 'Panhorna' },
  { departamento: D, municipio: M, comunidad: 'Pansup' },
  { departamento: D, municipio: M, comunidad: 'Pantic' },
  { departamento: D, municipio: M, comunidad: 'Pantoón' },
  { departamento: D, municipio: M, comunidad: 'Popabaj' },
  { departamento: D, municipio: M, comunidad: 'San Francisco de Asis' },
  { departamento: D, municipio: M, comunidad: 'Santa Ana' },
  { departamento: D, municipio: M, comunidad: 'Sesarb Sechaj' },
  { departamento: D, municipio: M, comunidad: 'Yuxilha' },

  // En el mapa aparece al borde del perímetro, sobre la RN-7E (¿pertenece?)
  { departamento: D, municipio: M, comunidad: 'Calera' },
];
