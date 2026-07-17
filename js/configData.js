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
// "comunidad" es el tercer nivel genérico: aldea, caserío, barrio, colonia,
// cantón, zona… lo que use cada municipio. Deja '' si la familia se registra
// solo a nivel de municipio (p. ej. cabecera sin detalle).
const UBICACIONES = [
  // — Datos de ejemplo (reemplazar con los reales desde el Excel) —
  { departamento: 'Huehuetenango',  municipio: 'Huehuetenango',  comunidad: 'Zona 1' },
  { departamento: 'Huehuetenango',  municipio: 'Huehuetenango',  comunidad: 'Chinacá' },
  { departamento: 'Huehuetenango',  municipio: 'Chiantla',       comunidad: 'Buenos Aires' },
  { departamento: 'Huehuetenango',  municipio: 'Chiantla',       comunidad: 'El Mirador' },
  { departamento: 'Quetzaltenango', municipio: 'Quetzaltenango', comunidad: 'Zona 1' },
  { departamento: 'Quetzaltenango', municipio: 'Salcajá',        comunidad: 'San Jacinto' },
  { departamento: 'Guatemala',      municipio: 'Guatemala',      comunidad: 'Zona 10' },
  { departamento: 'Guatemala',      municipio: 'Mixco',          comunidad: '' },
];
