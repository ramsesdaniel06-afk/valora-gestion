// Panel: resumen del negocio, alertas y accesos rápidos.
import { h, icon, money, int, fmtDate, thisMonth, addMonths, monthLabel, today } from '../utils.js';
import { pageHead, kpi, btn, pill, pairedBars, donut, legend, CHART_COLORS, confirmDialog, toast } from '../ui.js';
import {
  getState, enrichProducts, resumenFinanzas, inventarioValor, porCobrar, porPagar, pedidoTotal, PEDIDO_ACTIVO, productLabel, MOV_SIGN, loadDemo,
} from '../store.js';
import { openProductForm } from './producto-ui.js';
import { openPedidoForm, openPedidoDetail } from './pedidos.js';
import { openCompraForm } from './compras.js';
import { openTransactionForm } from './finanzas.js';
import { pickExcelAndImport } from '../importer.js';

export const meta = { title: 'Panel', tone: 'lilac' };

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function fechaLarga() {
  const d = new Date();
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`;
}

const link = (href, text) => h('a', { href, style: { fontWeight: 600, fontSize: '13px' } }, text);
const panel = (title, action, ...children) => h('section', { class: 'panel' },
  h('div', { class: 'panel-head' }, h('h2', null, title), action || null), h('div', { class: 'panel-body' }, ...children));

export function render() {
  const st = getState();
  const rows = enrichProducts();
  const empty = !st.productos.length && !st.proveedores.length && !st.pedidos.length && !st.compras.length && !st.transacciones.length;

  const actions = [
    btn('Nuevo pedido', { ic: 'bag', onClick: () => openPedidoForm() }),
    btn('Nueva compra', { kind: 'soft', ic: 'truck', onClick: () => openCompraForm() }),
    btn('Registrar gasto', { kind: 'soft', ic: 'coins', onClick: () => openTransactionForm({ preset: { tipo: 'Egreso' } }) }),
    btn('Nuevo producto', { kind: 'soft', ic: 'tag', onClick: () => openProductForm() }),
  ];
  const head = pageHead({ title: `Resumen de ${st.meta.negocio}`, subtitle: `Hoy es ${fechaLarga()}. Esto es lo que necesita tu atención.`, tone: 'lilac', actions });

  if (empty) {
    const steps = [
      ['Pon la tasa del día', 'Para convertir bolívares a dólares en tus cobros y pagos.', () => document.querySelector('.rate-chip')?.click()],
      ['Registra tus proveedores', 'Con sus condiciones, tiempos y contacto.', () => { location.hash = '#/proveedores'; }],
      ['Crea tu catálogo', 'Uno por uno o importando tu Excel de VALORA.', () => { location.hash = '#/catalogo'; }],
      ['Registra tu primera compra', 'Al recibirla, el inventario se llena solo.', () => { location.hash = '#/compras'; }],
    ];
    return h('div', { 'data-tone': 'lilac' }, head,
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'Empieza en cuatro pasos')),
        h('div', { class: 'panel-body' },
          h('ol', { class: 'list', style: { listStyle: 'none' } }, steps.map(([t, d, fn], i) => h('li', null,
            h('span', { class: 'pill plain', 'data-tone': ['lilac', 'rose', 'sky', 'mint'][i] }, String(i + 1)),
            h('div', { class: 'grow' }, h('div', { class: 'title' }, t), h('div', { class: 'muted small' }, d)),
            btn('Ir', { kind: 'soft sm', onClick: fn })))),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' } },
            btn('Importar mi Excel', { ic: 'upload', onClick: pickExcelAndImport }),
            btn('Explorar con datos de ejemplo', { kind: 'soft', onClick: () => { loadDemo(); toast('Datos de ejemplo cargados. Puedes borrarlos en Configuración.'); } })))));
  }

  const ym = thisMonth();
  const r = resumenFinanzas(ym);
  const inv = inventarioValor();
  const cobrar = porCobrar();
  const pagar = porPagar();
  const reponer = rows.filter((p) => p.alertaStock === 'REPONER').sort((a, b) => a.stock - b.stock);
  const fichas = rows.filter((p) => p.controlFicha !== 'OK' || p.alertaCostos !== 'OK' || p.controlSku !== 'OK').length;
  const sinVerificar = rows.filter((p) => p.alertaVerif !== 'OK' && p.estadoVerif !== 'Descartado').length;
  const activos = st.pedidos.filter((o) => PEDIDO_ACTIVO(o.estado)).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const serie = [];
  for (let i = -5; i <= 0; i++) {
    const m = addMonths(ym, i); const x = resumenFinanzas(m);
    serie.push({ label: monthLabel(m).split(' ')[0], a: x.cobros, b: round(x.gastosOperativos + x.comprasProductos) });
  }
  const cats = Object.entries(inv.porCategoria).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }));

  const kpis = h('div', { class: 'kpis' },
    kpi({ label: `Ventas netas · ${monthLabel(ym)}`, value: money(r.ventasNetas), note: `Utilidad bruta ${money(r.utilidadBruta)}`, tone: 'mint' }),
    kpi({ label: 'Utilidad neta del mes', value: money(r.utilidadNeta), note: r.ventasNetas ? `${((r.utilidadNeta / r.ventasNetas) * 100).toFixed(0)}% de las ventas` : 'Aún sin ventas este mes', tone: 'lilac' }),
    kpi({ label: 'Inventario al costo', value: money(inv.costo), note: `${int(inv.unidades)} unidades · se vende por ${money(inv.venta)}`, tone: 'sky' }),
    kpi({ label: 'Saldo de caja', value: money(r.saldoCaja), note: `Por cobrar ${money(cobrar.reduce((a, x) => a + x.saldo, 0))} · por pagar ${money(pagar.reduce((a, x) => a + x.saldo, 0))}`, tone: 'butter' }));

  const reponerList = reponer.length
    ? h('ul', { class: 'list' }, reponer.slice(0, 6).map((p) => h('li', null,
      h('div', { class: 'grow' }, h('div', { class: 'title' }, p.nombre), h('div', { class: 'muted small' }, `${p.sku}${p.variante ? ' · ' + p.variante : ''}`)),
      h('div', { class: 'right' }, h('div', { class: 'neg num' }, `${int(p.stock)} en stock`), h('div', { class: 'muted small' }, `mínimo ${int(p.stockMin)}`)))))
    : h('p', { class: 'muted' }, 'Todo tu inventario está por encima del mínimo.');

  const pedidosList = activos.length
    ? h('ul', { class: 'list' }, activos.slice(0, 6).map((o) => h('li', null,
      h('div', { class: 'grow' }, h('div', { class: 'title' }, `${o.codigo} · ${o.cliente}`), h('div', { class: 'muted small' }, `${o.canal} · ${fmtDate(o.fecha)}`)),
      pill(o.estado), h('button', { class: 'btn soft sm', type: 'button', onclick: () => openPedidoDetail(o.id) }, 'Ver'))))
    : h('p', { class: 'muted' }, 'No hay pedidos en curso.');

  const movs = [...st.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
  const movList = movs.length
    ? h('ul', { class: 'list' }, movs.map((m) => h('li', null,
      h('div', { class: 'grow' }, h('div', { class: 'title' }, productLabel(m.productoId)), h('div', { class: 'muted small' }, `${m.tipo} · ${fmtDate(m.fecha)}`)),
      h('span', { class: `num ${MOV_SIGN[m.tipo] > 0 ? 'pos' : 'neg'}` }, `${MOV_SIGN[m.tipo] > 0 ? '+' : '−'}${int(m.cantidad)}`))))
    : h('p', { class: 'muted' }, 'Todavía no hay movimientos.');

  const pendientes = h('ul', { class: 'list' },
    h('li', null, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Fichas de producto por completar'), h('div', { class: 'muted small' }, 'Datos faltantes, costos o SKU repetido')), pill(String(fichas), fichas ? 'butter' : 'mint'), link('#/catalogo', 'Revisar')),
    h('li', null, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Productos sin verificar'), h('div', { class: 'muted small' }, 'Pendientes o en revisión')), pill(String(sinVerificar), sinVerificar ? 'butter' : 'mint'), link('#/catalogo', 'Revisar')),
    h('li', null, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Cobros pendientes'), h('div', { class: 'muted small' }, `${cobrar.length} pedidos con saldo`)), pill(money(cobrar.reduce((a, x) => a + x.saldo, 0)), cobrar.length ? 'rose' : 'mint'), link('#/finanzas', 'Ver')),
    h('li', null, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Pagos a proveedores'), h('div', { class: 'muted small' }, `${pagar.length} compras con saldo`)), pill(money(pagar.reduce((a, x) => a + x.saldo, 0)), pagar.length ? 'rose' : 'mint'), link('#/finanzas', 'Ver')));

  return h('div', { 'data-tone': 'lilac' }, head, kpis,
    h('div', { class: 'grid-2' },
      panel('Dinero que entró y salió, últimos 6 meses', h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--mint-300)' } }), 'Cobros'), h('span', null, h('i', { style: { background: 'var(--rose-300)' } }), 'Egresos')), pairedBars(serie)),
      panel('Inventario por categoría', null,
        cats.length ? h('div', { class: 'donut-wrap' }, donut(cats, { centerValue: money(inv.costo).replace('.00', ''), centerLabel: 'al costo' }), legend(cats)) : h('p', { class: 'muted' }, 'Cuando tengas stock verás aquí cómo se reparte.'))),
    h('div', { class: 'grid-eq' },
      panel('Por reponer', link('#/inventario', 'Ver inventario'), reponerList),
      panel('Pedidos en curso', link('#/pedidos', 'Ver pedidos'), pedidosList)),
    h('div', { class: 'grid-eq' },
      panel('Pendientes', null, pendientes),
      panel('Últimos movimientos de inventario', link('#/inventario', 'Ver todos'), movList)));
}

const round = (n) => Math.round(n * 100) / 100;
void icon; void today; void confirmDialog;
