/* ============================================================
   Salco Lente: configuración
   Lo "de negocio" se edita acá y en data/productos.json.
   ============================================================ */
window.SL = window.SL || {};

SL.CONFIG = {
  CATALOGO_URL: 'data/productos.json',   // puede ser la URL de un servicio con el mismo formato (debe permitir CORS)

  /* Recordatorio de Mi Salcobrand (se muestra en la vista de producto y en Mi lista) */
  MI_SALCO: {
    activo: true,
    corto: 'No olvides usar tu código Mi Salcobrand en caja.',
    largo: 'Antes de pagar, indica tu código Mi Salcobrand en caja para aprovechar tus beneficios.'
  },

  /* Lectura de códigos de barras */
  SCAN: { INTERVALO_MS: 140, ANCHO_ANALISIS: 1280 },

  CATEGORIAS: {
    skincare:  { nombre: 'Skincare',  emoji: '🧴', c1: '#d9f0ff', c2: '#9fd8ff' },
    bebe:      { nombre: 'Bebé',      emoji: '👶', c1: '#fff3b0', c2: '#ffd54a' },
    vitaminas: { nombre: 'Vitaminas', emoji: '🌿', c1: '#e5f6b8', c2: '#c2e66a' },
    salud:     { nombre: 'Salud',     emoji: '💊', c1: '#ffd9d1', c2: '#ffb4a6' },
    higiene:   { nombre: 'Higiene',   emoji: '🧼', c1: '#eadcff', c2: '#cdb8ff' }
  },

  TEXTO: {
    AVISO: 'Información referencial. No reemplaza la orientación de un médico, químico farmacéutico u otro profesional de la salud. Revisa siempre el envase y el folleto.',
    AVISO_SALUD: 'Los medicamentos se muestran solo con información de la ficha. Esta herramienta no recomienda ni diagnostica: consulta a un químico farmacéutico o a tu médico.'
  }
};
