// Importa el Catálogo y los Proveedores desde el Excel de VALORA (hojas Catalago_Maestro y Proveedores).
// SheetJS se carga solo cuando se necesita, para que la app arranque rápido.
import { h, norm } from './utils.js';
import { toast, openModal, pill } from './ui.js';
import { importProductos, importProveedores } from './store.js';

const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let loading;

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = h('script', { src: SHEETJS, crossorigin: 'anonymous' });
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { loading = null; reject(new Error('No se pudo cargar el lector de Excel. Revisa tu conexión a internet.')); };
      document.head.append(s);
    });
  }
  return loading;
}

const PRODUCT_COLS = {
  sku: ['sku'], categoria: ['categoria'], marca: ['marca'], nombre: ['nombre comercial'], tipo: ['tipo de producto'], variante: ['variante / tono', 'variante'],
  presentacion: ['presentacion'], proveedor: ['proveedor princ.', 'proveedor principal'], fuente: ['fuente de verificacion'], costo: ['costo de adquisicion usd'],
  precio: ['precio de venta usd'], estadoVerif: ['estado de verificacion'], estadoComercial: ['estado comercial'], fechaVerif: ['fecha de verificacion'],
  obs: ['observaciones'], stockMin: ['stock minimo'], stockActual: ['stock actual'],
};
const PROVIDER_COLS = {
  nombre: ['nombre comercial'], razon: ['razon social'], tipo: ['tipo de proveedor'], contacto: ['persona de contacto'], telefono: ['telefono'], correo: ['correo'],
  web: ['instagram o web'], ubicacion: ['ubicacion'], cobertura: ['cobertura de entrega'], categorias: ['categorias suministradas'], monedaCompra: ['moneda de compra'],
  pedidoMin: ['pedido minimo'], tiempoRepo: ['tiempo de reposicion'], condPago: ['condiciones de pago'], politicaCambios: ['politica de cambios'],
  fuenteInfo: ['fuente de informacion'], estadoEval: ['estado de evaluacion'], fechaEval: ['fecha de evaluacion'], obs: ['observaciones'],
};

function toIsoDate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

function sheetRows(XLSX, wb, nameHint, map) {
  const name = wb.SheetNames.find((n) => norm(n).includes(nameHint));
  if (!name) return null;
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', cellDates: true });
  const headers = (grid[0] || []).map((x) => norm(x).trim());
  const idx = {};
  for (const [field, aliases] of Object.entries(map)) idx[field] = headers.findIndex((hd) => aliases.includes(hd));
  return grid.slice(1).map((r) => {
    const o = {};
    for (const [field, i] of Object.entries(idx)) o[field] = i >= 0 ? r[i] : '';
    if (o.fechaVerif !== undefined) o.fechaVerif = toIsoDate(o.fechaVerif);
    if (o.fechaEval !== undefined) o.fechaEval = toIsoDate(o.fechaEval);
    return o;
  }).filter((o) => Object.values(o).some((v) => v !== '' && v !== null));
}

export function pickExcelAndImport() {
  const input = h('input', { type: 'file', accept: '.xlsx,.xlsm,.xls', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (file) await importFile(file);
  });
  document.body.append(input);
  input.click();
}

export async function importFile(file) {
  try {
    toast('Leyendo el Excel…');
    const XLSX = await loadSheetJS();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    // Proveedores primero, para poder enlazar el "Proveedor Princ." de cada producto.
    const prov = sheetRows(XLSX, wb, 'proveedores', PROVIDER_COLS);
    const prods = sheetRows(XLSX, wb, 'catalago', PRODUCT_COLS) || sheetRows(XLSX, wb, 'catalogo', PRODUCT_COLS);
    if (!prov && !prods) { toast('No encontré las hojas "Catalago_Maestro" ni "Proveedores" en ese archivo.', 'err'); return; }
    const rp = prov ? importProveedores(prov) : null;
    const rc = prods ? importProductos(prods) : null;
    const m = openModal({
      title: 'Importación terminada', size: 'narrow', tone: 'mint',
      body: h('div', null,
        rp ? h('p', null, h('strong', null, `${rp.creados} proveedores`), ` creados${rp.omitidos ? `, ${rp.omitidos} omitidos (vacíos o repetidos)` : ''}.`) : null,
        rc ? h('p', null, h('strong', null, `${rc.creados} productos`), ` creados${rc.omitidos ? `, ${rc.omitidos} omitidos (sin nombre o con SKU repetido)` : ''}.`) : null,
        ((rp?.creados || 0) + (rp?.omitidos || 0) + (rc?.creados || 0) + (rc?.omitidos || 0)) > 0 ? null : h('p', { class: 'muted' }, 'Tu Excel no tiene filas con datos todavía: llénalo y vuelve a importar, o crea los registros desde aquí.')),
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Listo')],
    });
  } catch (e) {
    console.error(e);
    toast(e.message || 'No se pudo leer el archivo.', 'err');
  }
}
void pill;
