// Módulo Finanzas: transacciones, estado de resultados, caja, cuentas por cobrar y por pagar.
import { h, icon, money, int, fmtDate, today, thisMonth, monthLabel, addMonths, toNum, round2 } from '../utils.js';
import { dataTable, pageHead, kpi, btn, emptyState, pill, openForm, confirmDialog, toast, hbars, CHART_COLORS } from '../ui.js';
import {
  list, getState, saveTransaccion, deleteTransaccion, resumenFinanzas, porCobrar, porPagar, cashSign,
  pedidoTotal, compraTotal, pedidoCobrado, compraPagado,
} from '../store.js';

export const meta = { title: 'Finanzas', tone: 'butter' };
let period = thisMonth();
let tab = 'transacciones';

/**
 * Formulario de transacción. `preset` puede traer tipo, monto, concepto, ref, metodoPago.
 * `tx` = transacción existente a editar.
 */
export function openTransactionForm({ tx = null, preset = {}, title, subtitle, info } = {}) {
  const st = getState();
  const v0 = tx || { fecha: today(), tipo: 'Egreso', moneda: 'USD', metodoPago: list('metodosPago')[0], tasa: st.meta.tasa || '', ...preset };
  const fields = [
    { name: 'tipo', label: 'Tipo de transacción', type: 'select', noBlank: true, required: true, options: list('tiposTransaccion') },
    { name: 'fecha', label: 'Fecha', type: 'date', required: true },
    { name: 'gasto', label: 'Tipo de gasto', type: 'select', required: true, options: list('tiposGasto'), show: (v) => v.tipo === 'Egreso' },
    { name: 'sentido', label: '¿Entra o sale dinero?', type: 'select', noBlank: true, options: ['Entrada', 'Salida'], show: (v) => v.tipo === 'Otro' },
    { name: 'metodoPago', label: 'Método de pago', type: 'select', noBlank: true, required: true, options: list('metodosPago') },
    { name: 'moneda', label: 'Moneda', type: 'select', noBlank: true, required: true, options: list('monedas') },
    {
      name: 'monto', label: 'Monto', type: 'number', required: true, min: '0',
      // En cobros y pagos propuestos, el monto sigue a la moneda mientras la persona no lo escriba a mano.
      ...(preset.monto && !tx ? {
        autofillStart: true,
        autofill: (v) => {
          const t = toNum(v.tasa) || st.meta.tasa;
          return v.moneda === 'VES' && t > 0 ? round2(preset.monto * t) : preset.monto;
        },
      } : {}),
    },
    { name: 'tasa', label: 'Tasa (Bs. por 1 USD)', type: 'number', show: (v) => v.moneda === 'VES', help: 'Se propone la tasa del día; puedes cambiarla.' },
    {
      name: 'equiv', label: 'Equivale a', type: 'computed', span2: true,
      compute: (v) => {
        const m = toNum(v.monto);
        if (!m) return 'Escribe el monto';
        if (v.moneda === 'VES') { const t = toNum(v.tasa); return t > 0 ? `${money(m / t)} (USD)` : 'Falta la tasa de cambio'; }
        return `${money(m)} (USD)`;
      },
    },
    { name: 'concepto', label: 'Concepto', type: 'text', span2: true, placeholder: 'Para qué es este movimiento de dinero' },
  ];
  if (info) fields.unshift({ name: 'info', label: 'Referencia', type: 'computed', span2: true, compute: () => info });
  return openForm({
    title: title || (tx ? 'Editar transacción' : 'Nueva transacción'), subtitle, tone: 'butter', fields, values: v0,
    submitLabel: tx ? 'Guardar cambios' : 'Registrar', successMessage: tx ? 'Transacción actualizada' : 'Transacción registrada',
    onSubmit: (v) => {
      const { equiv: _e, info: _i, ...rest } = v;
      return saveTransaccion({ ...rest, ref: tx ? tx.ref : preset.ref || null }, tx?.id);
    },
  });
}

async function removeTx(t) {
  const ok = await confirmDialog({ title: 'Eliminar transacción', message: `Se eliminará "${t.concepto || t.tipo}" por ${money(t.montoUSD)}. El saldo de caja se recalcula.`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  deleteTransaccion(t.id);
  toast('Transacción eliminada');
}

export function render(rerender) {
  const st = getState();
  const r = resumenFinanzas(period);
  const cobrar = porCobrar();
  const pagar = porPagar();
  const totalCobrar = round2(cobrar.reduce((a, x) => a + x.saldo, 0));
  const totalPagar = round2(pagar.reduce((a, x) => a + x.saldo, 0));

  const periodBar = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', disabled: !period, onclick: () => { period = addMonths(period || thisMonth(), -1); rerender(); } }, h('span', { 'aria-hidden': 'true' }, '‹')),
    h('input', { type: 'month', 'aria-label': 'Mes', value: period, style: { width: '170px' }, onchange: (e) => { period = e.target.value; rerender(); } }),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', disabled: !period, onclick: () => { period = addMonths(period || thisMonth(), 1); rerender(); } }, h('span', { 'aria-hidden': 'true' }, '›')),
    h('button', { class: `btn sm ${period ? 'soft' : 'tint'}`, type: 'button', onclick: () => { period = period ? '' : thisMonth(); rerender(); } }, period ? 'Ver todo el historial' : 'Volver al mes actual'));

  const row = (label, value, { strong = false, neg = false, indent = false, note } = {}) => h('tr', null,
    h('td', { style: { paddingLeft: indent ? '28px' : '14px', fontWeight: strong ? 700 : 500 } }, label, note ? h('div', { class: 'sub' }, note) : null),
    h('td', { class: `right num ${strong ? 'strong' : ''} ${neg && value > 0 ? 'neg' : ''}` }, neg && value > 0 ? `− ${money(value)}` : money(value)));

  const resultados = h('div', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, `Estado de resultados · ${monthLabel(period)}`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('tbody', null,
      row('Ventas de pedidos', r.ventasPedidos, { note: 'Pedidos que ya salieron del inventario, estén cobrados o no' }),
      row('Otros ingresos', r.otrosIngresos, { indent: true, note: 'Cobros registrados sin pedido' }),
      row('Devoluciones de dinero', r.devoluciones, { neg: true, indent: true }),
      row('Ventas netas', r.ventasNetas, { strong: true }),
      row('Costo de lo vendido', r.costoVentas, { neg: true, indent: true, note: 'Costo de adquisición de los productos que salieron por venta' }),
      row('Utilidad bruta', r.utilidadBruta, { strong: true }),
      row('Mermas y pérdidas', r.mermas, { neg: true, indent: true, note: 'Productos dañados, perdidos o ajustados a la baja' }),
      row('Gastos operativos', r.gastosOperativos, { neg: true, indent: true, note: 'Embalaje, transporte, marketing, comisiones…' }),
      row('Utilidad neta', r.utilidadNeta, { strong: true })))),
    h('div', { class: 'panel-body' }, h('p', { class: 'muted small' },
      `Las compras de mercancía (${money(r.comprasProductos)} en este período) no se restan aquí: se convierten en inventario y se descuentan cuando vendes. Los aportes de capital y pagos de préstamos tampoco son ventas ni gastos; solo mueven la caja.`)));

  const gastos = Object.entries(r.gastosPorTipo).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const metodos = Object.entries(r.porMetodo).filter(([, v]) => Math.abs(v) > 0.004).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  const lateral = h('div', null,
    h('div', { class: 'panel', style: { marginBottom: '16px' } },
      h('div', { class: 'panel-head' }, h('h2', null, 'Flujo de caja del período')),
      h('div', { class: 'panel-body' },
        h('div', { class: 'totals', style: { maxWidth: 'none' } },
          h('div', null, h('span', null, 'Entradas'), h('span', { class: 'pos num' }, money(r.entradas))),
          h('div', null, h('span', null, 'Salidas (incluye compras)'), h('span', { class: 'neg num' }, r.salidas ? `− ${money(r.salidas)}` : money(0))),
          h('div', { class: 'total' }, h('span', null, 'Flujo neto'), h('span', { class: `num ${r.flujoNeto < 0 ? 'neg' : ''}` }, money(r.flujoNeto)))))),
    h('div', { class: 'panel', style: { marginBottom: '16px' } },
      h('div', { class: 'panel-head' }, h('h2', null, 'Dónde está tu dinero'), h('span', { class: 'muted small' }, 'Saldo histórico')),
      h('div', { class: 'panel-body' }, metodos.length ? hbars(metodos, { tone: 'butter' }) : h('p', { class: 'muted' }, 'Aún no hay movimientos de dinero.'))),
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Gastos operativos por tipo')),
      h('div', { class: 'panel-body' }, gastos.length ? hbars(gastos, { tone: 'rose' }) : h('p', { class: 'muted' }, 'No hay gastos en este período.'))));

  // --- Pestañas
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    [['transacciones', 'Transacciones'], ['cobrar', `Por cobrar (${cobrar.length})`], ['pagar', `Por pagar (${pagar.length})`]].map(([k, label]) => h('button', {
      role: 'tab', type: 'button', 'aria-selected': String(tab === k), onclick: () => { tab = k; rerender(); },
    }, label)));

  let content;
  if (tab === 'transacciones') {
    const rows = st.transacciones.filter((t) => !period || t.fecha.startsWith(period)).sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.createdAt).localeCompare(String(a.createdAt)));
    content = dataTable({
      id: 'fin-tx', rows, pageSize: 20,
      empty: emptyState({ title: 'Sin transacciones en este período', text: 'Registra ingresos, gastos y aportes para ver tus finanzas al día.', actions: [btn('Nueva transacción', { ic: 'plus', onClick: () => openTransactionForm() })] }),
      searchText: (t) => [t.concepto, t.tipo, t.gasto, t.metodoPago, t.ref?.codigo].join(' '),
      filters: [
        { key: 'tipo', label: 'Tipo', options: () => list('tiposTransaccion'), test: (t, v) => t.tipo === v },
        { key: 'metodo', label: 'Método', options: () => list('metodosPago'), test: (t, v) => t.metodoPago === v },
      ],
      onRowClick: (t) => openTransactionForm({ tx: t }),
      columns: [
        { key: 'fecha', label: 'Fecha', sort: (t) => t.fecha, render: (t) => h('span', { class: 'num' }, fmtDate(t.fecha)) },
        { key: 'tipo', label: 'Tipo', render: (t) => pill(t.tipo, cashSign(t) > 0 ? 'mint' : 'rose') },
        { key: 'concepto', label: 'Concepto', render: (t) => h('div', null, h('div', { class: 'strong' }, t.concepto || '—'), h('div', { class: 'sub' }, [t.gasto, t.ref?.codigo].filter(Boolean).join(' · '))) },
        { key: 'metodo', label: 'Método', sort: (t) => t.metodoPago, render: (t) => t.metodoPago },
        { key: 'monto', label: 'Monto', align: 'right', render: (t) => h('div', null, h('div', { class: 'num' }, money(t.monto, t.moneda)), t.moneda === 'VES' ? h('div', { class: 'sub' }, `tasa ${t.tasa}`) : null) },
        { key: 'usd', label: 'USD', align: 'right', sort: (t) => cashSign(t) * t.montoUSD, render: (t) => h('span', { class: `num ${cashSign(t) > 0 ? 'pos' : 'neg'}` }, `${cashSign(t) > 0 ? '+' : '−'}${money(t.montoUSD)}`) },
        { key: 'acc', label: '', render: (t) => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Eliminar transacción', onclick: () => removeTx(t) }, icon('trash')) },
      ],
      exportCfg: { filename: `valora-transacciones-${period || 'todo'}.csv`, headers: ['Fecha', 'Tipo', 'Tipo de gasto', 'Concepto', 'Método', 'Moneda', 'Monto', 'Tasa', 'Monto USD', 'Efecto en caja USD', 'Referencia'], map: (t) => [t.fecha, t.tipo, t.gasto, t.concepto, t.metodoPago, t.moneda, t.monto, t.tasa, t.montoUSD, cashSign(t) * t.montoUSD, t.ref?.codigo || ''] },
    });
  } else if (tab === 'cobrar') {
    content = h('div', { class: 'panel' },
      cobrar.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, ['Pedido', 'Cliente', 'Estado', 'Total', 'Cobrado', 'Saldo', ''].map((t, i) => h('th', { class: i >= 3 && i <= 5 ? 'right' : '' }, t)))),
          h('tbody', null, cobrar.map(({ o, saldo }) => h('tr', null,
            h('td', { class: 'strong' }, o.codigo), h('td', null, o.cliente), h('td', null, pill(o.estado)),
            h('td', { class: 'right num' }, money(pedidoTotal(o))), h('td', { class: 'right num' }, money(pedidoCobrado(o))), h('td', { class: 'right num neg' }, money(saldo)),
            h('td', { class: 'right' }, btn('Registrar cobro', { kind: 'tint sm', onClick: () => openTransactionForm({ title: 'Registrar cobro', subtitle: `${o.codigo} · ${o.cliente}`, info: `Saldo pendiente: ${money(saldo)}`, preset: { tipo: 'Ingreso', monto: saldo, concepto: `Cobro pedido ${o.codigo}`, metodoPago: o.metodoPago, ref: { tipo: 'pedido', id: o.id, codigo: o.codigo } } }) }))))),
          ))
        : emptyState({ title: 'Nada por cobrar', text: 'Todos los pedidos activos están cobrados.' }));
  } else {
    content = h('div', { class: 'panel' },
      pagar.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, ['Compra', 'Proveedor', 'Estado', 'Total', 'Pagado', 'Saldo', ''].map((t, i) => h('th', { class: i >= 3 && i <= 5 ? 'right' : '' }, t)))),
          h('tbody', null, pagar.map(({ c, saldo }) => h('tr', null,
            h('td', { class: 'strong' }, c.codigo), h('td', null, st.proveedores.find((p) => p.id === c.proveedorId)?.nombre || '—'), h('td', null, pill(c.estado)),
            h('td', { class: 'right num' }, money(compraTotal(c))), h('td', { class: 'right num' }, money(compraPagado(c))), h('td', { class: 'right num neg' }, money(saldo)),
            h('td', { class: 'right' }, btn('Registrar pago', { kind: 'tint sm', onClick: () => openTransactionForm({ title: 'Registrar pago a proveedor', subtitle: `${c.codigo}`, info: `Saldo pendiente: ${money(saldo)}`, preset: { tipo: 'Egreso', gasto: 'Compra de productos', monto: saldo, concepto: `Pago compra ${c.codigo}`, metodoPago: c.metodoPago, ref: { tipo: 'compra', id: c.id, codigo: c.codigo } } }) }))))),
          ))
        : emptyState({ title: 'Nada por pagar', text: 'No tienes compras con saldo pendiente.' }));
  }

  return h('div', { 'data-tone': meta.tone },
    pageHead({
      title: 'Finanzas', tone: meta.tone,
      subtitle: 'Ventas, gastos, utilidad y caja en dólares. Los bolívares se convierten con la tasa que registres.',
      actions: [periodBar, btn('Nueva transacción', { ic: 'plus', onClick: () => openTransactionForm() })],
    }),
    h('div', { class: 'kpis' },
      kpi({ label: `Ventas netas · ${monthLabel(period)}`, value: money(r.ventasNetas), note: `Cobrado en el período: ${money(r.cobros)}`, tone: 'mint' }),
      kpi({ label: 'Utilidad neta', value: money(r.utilidadNeta), note: r.ventasNetas ? `${((r.utilidadNeta / r.ventasNetas) * 100).toFixed(0)}% de las ventas` : 'Sin ventas en el período', tone: 'lilac' }),
      kpi({ label: 'Saldo de caja', value: money(r.saldoCaja), note: 'Todo el historial', tone: 'butter' }),
      kpi({ label: 'Por cobrar / por pagar', value: `${money(totalCobrar)} / ${money(totalPagar)}`, note: `${cobrar.length} ${cobrar.length === 1 ? 'pedido' : 'pedidos'} · ${pagar.length} ${pagar.length === 1 ? 'compra' : 'compras'}`, tone: 'sky' })),
    h('div', { class: 'grid-2' }, resultados, lateral),
    tabs, content);
}
void CHART_COLORS;
