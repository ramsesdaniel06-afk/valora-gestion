// Módulo Compras: órdenes a proveedores, recepción de mercancía y pagos.
import { h, icon, money, int, fmtDate, today } from '../utils.js';
import { dataTable, pageHead, kpi, btn, emptyState, pill, openForm, openModal, confirmDialog, toast, kv, lineEditor } from '../ui.js';
import {
  list, getState, saveCompra, setEstadoCompra, recibirCompra, deleteCompra, compraTotal, compraPagado, compraRecibida,
  productById, productLabel, proveedorName, stockOf, porPagar,
} from '../store.js';
import { openTransactionForm } from './finanzas.js';

export const meta = { title: 'Compras', tone: 'sky' };
const EDITABLE_STATES = ['Planificada', 'Solicitada', 'Cancelada'];

export function openCompraForm(c = null) {
  const st = getState();
  const locked = c && compraRecibida(c);
  const fields = [
    { name: 'fecha', label: 'Fecha', type: 'date', required: true, default: today() },
    { name: 'proveedorId', label: 'Proveedor', type: 'select', required: true, options: st.proveedores.filter((p) => p.estadoEval !== 'Descartado' || p.id === c?.proveedorId).map((p) => ({ value: p.id, label: p.nombre })) },
    ...(locked ? [] : [{ name: 'estado', label: 'Estado', type: 'select', noBlank: true, options: EDITABLE_STATES, default: 'Planificada', help: 'Al recibir mercancía, el estado cambia solo.' }]),
    { name: 'metodoPago', label: 'Método de pago previsto', type: 'select', noBlank: true, options: list('metodosPago') },
    {
      name: 'lineas', label: 'Productos', type: 'custom', span2: true,
      build: () => lineEditor({ products: st.productos, lines: c?.lineas || [], priceKey: 'costo', priceLabel: 'Costo unit. (USD)', defaultPrice: (p) => p.costo ?? '', readOnly: !!locked }),
    },
    { name: 'nota', label: 'Notas', type: 'textarea', span2: true },
  ];
  return openForm({
    title: c ? `Editar ${c.codigo}` : 'Nueva compra', subtitle: locked ? 'Ya tiene mercancía recibida: los productos no se pueden cambiar.' : 'Elige el proveedor y los productos que vas a comprar.',
    tone: 'sky', size: 'wide', fields, values: c || { fecha: today(), estado: 'Planificada', metodoPago: list('metodosPago')[0] },
    submitLabel: c ? 'Guardar cambios' : 'Crear compra', successMessage: c ? 'Compra actualizada' : 'Compra creada',
    onSubmit: (v) => saveCompra(v, c?.id),
  });
}

function openRecepcion(c) {
  const inputs = {};
  const fields = [
    { name: 'fecha', label: 'Fecha de recepción', type: 'date', required: true, default: today() },
    {
      name: 'cantidades', label: '¿Cuántas unidades llegaron?', type: 'custom', span2: true,
      build: () => {
        const rows = c.lineas.map((l) => {
          const pendiente = l.cantidad - l.recibido;
          const input = h('input', { type: 'number', class: 'qty', min: '0', max: String(pendiente), step: '1', value: pendiente, disabled: pendiente === 0, 'aria-label': `Llegan de ${productLabel(l.productoId)}` });
          inputs[l.productoId] = input;
          return h('tr', null, h('td', null, productLabel(l.productoId)), h('td', { class: 'num' }, int(l.cantidad)), h('td', { class: 'num' }, int(l.recibido)), h('td', null, input));
        });
        return {
          node: h('div', { class: 'table-wrap' }, h('table', { class: 'lines' }, h('thead', null, h('tr', null, ['Producto', 'Pedido', 'Ya recibido', 'Llega ahora'].map((t) => h('th', null, t)))), h('tbody', null, rows))),
          get: () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])),
        };
      },
    },
  ];
  return openForm({
    title: `Recibir mercancía · ${c.codigo}`, subtitle: 'Se sumará al inventario y se actualizará el costo de cada producto con el costo de esta compra.',
    tone: 'mint', fields, values: {}, submitLabel: 'Registrar recepción', successMessage: 'Mercancía recibida: inventario actualizado',
    onSubmit: (v) => recibirCompra(c.id, v.cantidades, v.fecha),
  });
}

export function openCompraDetail(id) {
  const c = getState().compras.find((x) => x.id === id);
  if (!c) return;
  const total = compraTotal(c); const pagado = compraPagado(c); const saldo = Math.round((total - pagado) * 100) / 100;
  const cancelada = c.estado === 'Cancelada';
  const completa = c.lineas.every((l) => l.recibido >= l.cantidad);
  const body = h('div', null,
    h('div', { style: { marginBottom: '14px', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, pill(c.estado), saldo > 0.009 && !cancelada ? pill(`Saldo ${money(saldo)}`, 'rose') : pill('Pagada', 'mint')),
    kv([['Proveedor', proveedorName(c.proveedorId)], ['Fecha', fmtDate(c.fecha)], ['Método de pago', c.metodoPago], ['Total', money(total)], ['Pagado', money(pagado)], ['Saldo', money(Math.max(0, saldo))]]),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ['Producto', 'Pedido', 'Recibido', 'Costo unit.', 'Subtotal'].map((t, i) => h('th', { class: i > 0 ? 'right' : '' }, t)))),
      h('tbody', null, c.lineas.map((l) => h('tr', null,
        h('td', null, productLabel(l.productoId)), h('td', { class: 'right num' }, int(l.cantidad)),
        h('td', { class: `right num ${l.recibido >= l.cantidad ? 'pos' : ''}` }, int(l.recibido)), h('td', { class: 'right num' }, money(l.costo)), h('td', { class: 'right num strong' }, money(l.cantidad * l.costo))))))),
    c.nota ? h('div', { class: 'notice', style: { marginTop: '14px' } }, c.nota) : null);

  const footer = [
    h('button', {
      class: 'btn danger left', type: 'button',
      onclick: async () => {
        const ok = await confirmDialog({ title: 'Eliminar compra', message: `¿Eliminar ${c.codigo}?`, confirmLabel: 'Eliminar', danger: true });
        if (!ok) return;
        const res = deleteCompra(c.id);
        if (!res.ok) { toast(res.error, 'err'); return; }
        m.close(); toast('Compra eliminada');
      },
    }, icon('trash'), 'Eliminar'),
    !compraRecibida(c) && !cancelada && c.estado === 'Planificada' ? h('button', { class: 'btn soft', type: 'button', onclick: () => { setEstadoCompra(c.id, 'Solicitada'); m.close(); toast('Compra marcada como solicitada'); } }, 'Marcar como solicitada') : null,
    !compraRecibida(c) && !cancelada ? h('button', { class: 'btn soft', type: 'button', onclick: () => { setEstadoCompra(c.id, 'Cancelada'); m.close(); toast('Compra cancelada'); } }, 'Cancelar compra') : null,
    h('button', { class: 'btn soft', type: 'button', onclick: () => { m.close(); openCompraForm(getState().compras.find((x) => x.id === id)); } }, icon('edit'), 'Editar'),
    saldo > 0.009 && !cancelada ? h('button', {
      class: 'btn tint', type: 'button',
      onclick: () => { m.close(); openTransactionForm({ title: 'Registrar pago a proveedor', subtitle: c.codigo, info: `Saldo pendiente: ${money(saldo)}`, preset: { tipo: 'Egreso', gasto: 'Compra de productos', monto: saldo, concepto: `Pago compra ${c.codigo}`, metodoPago: c.metodoPago, ref: { tipo: 'compra', id: c.id, codigo: c.codigo } } }); },
    }, icon('coins'), 'Registrar pago') : null,
    !cancelada && !completa ? h('button', { class: 'btn', type: 'button', onclick: () => { m.close(); openRecepcion(c); } }, icon('box'), 'Recibir mercancía') : null,
  ].filter(Boolean);
  const m = openModal({ title: c.codigo, subtitle: `${proveedorName(c.proveedorId)} · ${fmtDate(c.fecha)}`, tone: 'sky', size: 'wide', body, footer });
}

export function render() {
  const st = getState();
  const rows = st.compras.map((c) => ({ ...c, total: compraTotal(c), pagado: compraPagado(c), unidades: c.lineas.reduce((a, l) => a + l.cantidad, 0) }))
    .map((c) => ({ ...c, saldo: c.estado === 'Cancelada' ? 0 : Math.round((c.total - c.pagado) * 100) / 100 }));
  const enCamino = rows.filter((c) => ['Solicitada', 'Recibida parcialmente'].includes(c.estado));
  const pagar = porPagar();

  const table = dataTable({
    id: 'compras', rows: rows.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.codigo.localeCompare(a.codigo)),
    empty: emptyState({ title: 'Aún no has registrado compras', text: 'Crea una compra para llevar el control de lo que pides, lo que llega y lo que pagas.', actions: [btn('Nueva compra', { ic: 'plus', onClick: () => openCompraForm() })] }),
    searchText: (r) => [r.codigo, proveedorName(r.proveedorId), r.estado, ...r.lineas.map((l) => productLabel(l.productoId))].join(' '),
    filters: [
      { key: 'estado', label: 'Estado', options: () => list('estadosCompra'), test: (r, v) => r.estado === v },
      { key: 'prov', label: 'Proveedor', options: () => st.proveedores.map((p) => ({ value: p.id, label: p.nombre })), test: (r, v) => r.proveedorId === v },
    ],
    onRowClick: (r) => openCompraDetail(r.id),
    columns: [
      { key: 'codigo', label: 'Compra', sort: (r) => r.codigo, render: (r) => h('span', { class: 'strong num' }, r.codigo) },
      { key: 'fecha', label: 'Fecha', sort: (r) => r.fecha, render: (r) => h('span', { class: 'num' }, fmtDate(r.fecha)) },
      { key: 'prov', label: 'Proveedor', sort: (r) => proveedorName(r.proveedorId), render: (r) => proveedorName(r.proveedorId) },
      { key: 'items', label: 'Productos', render: (r) => h('div', null, `${r.lineas.length} ${r.lineas.length === 1 ? 'producto' : 'productos'}`, h('div', { class: 'sub' }, `${int(r.unidades)} unidades`)) },
      { key: 'estado', label: 'Estado', sort: (r) => r.estado, render: (r) => pill(r.estado) },
      { key: 'total', label: 'Total', align: 'right', sort: (r) => r.total, render: (r) => h('span', { class: 'num strong' }, money(r.total)) },
      { key: 'pagado', label: 'Pagado', align: 'right', sort: (r) => r.pagado, render: (r) => h('span', { class: 'num' }, money(r.pagado)) },
      { key: 'saldo', label: 'Saldo', align: 'right', sort: (r) => r.saldo, render: (r) => h('span', { class: `num ${r.saldo > 0 ? 'neg' : 'muted'}` }, money(r.saldo)) },
    ],
    exportCfg: { filename: 'valora-compras.csv', headers: ['Compra', 'Fecha', 'Proveedor', 'Estado', 'Total USD', 'Pagado USD', 'Saldo USD'], map: (r) => [r.codigo, r.fecha, proveedorName(r.proveedorId), r.estado, r.total, r.pagado, r.saldo] },
  });

  return h('div', { 'data-tone': meta.tone },
    pageHead({
      title: 'Compras', tone: meta.tone,
      subtitle: 'Pide a tus proveedores, registra lo que llega (sube el inventario solo) y lleva lo que debes.',
      actions: [btn('Nueva compra', { ic: 'plus', onClick: () => openCompraForm() })],
    }),
    rows.length ? h('div', { class: 'kpis' },
      kpi({ label: 'Compras registradas', value: int(rows.length), note: `${int(rows.filter((c) => c.estado === 'Recibida completa').length)} recibidas completas`, tone: 'sky' }),
      kpi({ label: 'En camino', value: int(enCamino.length), note: 'Solicitadas o con recepción parcial', tone: 'lilac' }),
      kpi({ label: 'Por pagar', value: money(pagar.reduce((a, x) => a + x.saldo, 0)), note: `${pagar.length} compras con saldo`, tone: 'rose' })) : null,
    table);
}
void productById; void stockOf;
