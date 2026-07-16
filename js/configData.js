// ============================================================================
// CONFIGURACIÓN DE DATOS — este es el archivo que vas a editar con datos reales
// La estructura es idéntica a la plantilla Excel (plantilla_config_censo.xlsx):
// llenas el Excel, y cada fila de la hoja "Ubicaciones" se convierte en un
// objeto de UBICACIONES; cada fila de "Partidos" en un objeto de PARTIDOS.
// ============================================================================

// --- PARTIDOS (6) -----------------------------------------------------------
// id/sigla : se guarda en la base de datos (no cambiar después de tener datos)
// color    : se usa en las gráficas del dashboard y en las fichas del formulario
// logo     : ruta del PNG dentro de img/partidos/ (reemplazar los placeholders)
const PARTIDOS = [
  { id: 'P1', nombre: 'Partido Uno (editar)',    sigla: 'P1', color: '#DC2626', logo: 'img/partidos/p1.png' },
  { id: 'P2', nombre: 'Partido Dos (editar)',    sigla: 'P2', color: '#2563EB', logo: 'img/partidos/p2.png' },
  { id: 'P3', nombre: 'Partido Tres (editar)',   sigla: 'P3', color: '#16A34A', logo: 'img/partidos/p3.png' },
  { id: 'P4', nombre: 'Partido Cuatro (editar)', sigla: 'P4', color: '#D97706', logo: 'img/partidos/p4.png' },
  { id: 'P5', nombre: 'Partido Cinco (editar)',  sigla: 'P5', color: '#7C3AED', logo: 'img/partidos/p5.png' },
  { id: 'P6', nombre: 'Partido Seis (editar)',   sigla: 'P6', color: '#0891B2', logo: 'img/partidos/p6.png' },
];

// --- UBICACIONES (filas planas, igual que el Excel) -------------------------
// Cada fila = una combinación geográfica válida. Los <select> del formulario
// se llenan en cascada filtrando estas filas.
// Deja '' (vacío) cuando el nivel no aplique:
//   · zona urbana  → aldea:'' y caserio:'', con barrio lleno
//   · zona rural   → barrio:'', con aldea (y caserío si existe) llenos
const UBICACIONES = [
  // — Datos de ejemplo (reemplazar con los reales desde el Excel) —
  { departamento: 'Huehuetenango',  municipio: 'Huehuetenango',  aldea: '',             caserio: '',               barrio: 'Zona 1' },
  { departamento: 'Huehuetenango',  municipio: 'Huehuetenango',  aldea: '',             caserio: '',               barrio: 'Zona 3' },
  { departamento: 'Huehuetenango',  municipio: 'Huehuetenango',  aldea: 'Chinacá',      caserio: 'Los Regadillos', barrio: '' },
  { departamento: 'Huehuetenango',  municipio: 'Chiantla',       aldea: 'Buenos Aires', caserio: 'El Mirador',     barrio: '' },
  { departamento: 'Huehuetenango',  municipio: 'Chiantla',       aldea: 'Buenos Aires', caserio: 'La Cumbre',      barrio: '' },
  { departamento: 'Quetzaltenango', municipio: 'Quetzaltenango', aldea: '',             caserio: '',               barrio: 'Zona 1' },
  { departamento: 'Quetzaltenango', municipio: 'Salcajá',        aldea: '',             caserio: '',               barrio: 'San Jacinto' },
  { departamento: 'Guatemala',      municipio: 'Guatemala',      aldea: '',             caserio: '',               barrio: 'Zona 10' },
  { departamento: 'Guatemala',      municipio: 'Mixco',          aldea: '',             caserio: '',               barrio: 'Zona 1 de Mixco' },
];
