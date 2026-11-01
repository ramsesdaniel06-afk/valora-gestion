// Módulo Pedidos: ventas a clientes, estados de entrega, descuento de inventario y cobros.
import { h, icon, money, int, fmtDate, today, thisMonth, toNum } from '../utils.js';
import { dataTable, pageHead, kpi, btn, emptyState, pill, openForm, openModal, confirmDialog, toast, kv, lineEditor } from '../ui.js';
import {
  list, getState, savePedido, setEstadoPedido, deletePedido, pedidoTotal, pedidoSubtotal, pedidoCobrado, PEDIDO_SIGUIENTE, PEDIDO_ACTIVO,
  productLabel, stockOf, porCobrar,
} from '../store.js';
import { openTransactionForm } from './finanzas.js';

export const meta = { title: 'Pedidos', tone: 'peach' };

export function openPedidoForm(o = null) {
  const st = getState();
  const locked = o?.stockDescontado;
  const rate = st.meta.tasa;
  const fields = [
    { type: 'section', label: 'Cliente' },
    { name: 'cliente', label: 'Nombre del cliente', type: 'text', required: true },
    { name: 'telefono', label: 'Teléfono / WhatsApp', type: 'tel', placeholder: '+58 412 000 0000' },
    { name: 'fecha', label: 'Fecha', type: 'date', required: true, default: today() },
    { name: 'canal', label: 'Canal de venta', type: 'select', required: true, options: list('canales') },
    { name: 'metodoPago', label: 'Método de pago', type: 'select', noBlank: true, options: list('metodosPago') },
    { name: 'direccion', label: 'Dirección o punto de entrega', type: 'text', span2: true },
    { type: 'section', label: 'Productos' },
    {
      name: 'lineas', label: 'Productos del pedido', type: 'custom', span2: true,
      build: () => lineEditor({ products: st.productos, lines: o?.lineas || [], priceKey: 'precio', priceLabel: 'Precio unit. (USD)', defaultPrice: (p) => p.precio ?? '', stockOf, readOnly: !!locked }),
    },
    { name: 'descuento', label: 'Descuento (USD)', type: 'number' },
    { name: 'envio', label: 'Envío cobrado al cliente (USD)', type: 'number' },
    {
      name: 'total', label: 'Total del pedido', type: 'computed', span2: true,
      compute: (v) => {
        const sub = (v.lineas || []).reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0);
        const total = locked ? pedidoTotal({ ...o, descuento: toNum(v.descuento) || 0, envio: toNum(v.envio) || 0 }) : sub - (toNum(v.descuento) || 0) + (toNum(v.envio) || 0);
        return `${money(total)}${rate ? `  ·  ≈ ${money(total * rate, 'VES')}` : ''}`;
      },
    },
    { name: 'nota', label: 'Notas', type: 'textarea', span2: true },
  ];
  return openForm({
    title: o ? `Editar ${o.codigo}` : 'Nuevo pedido', subtitle: locked ? 'Este pedido ya descontó inventario: los productos no se pueden cambiar.' : 'Registra lo que pide tu cliente. El inventario se descuenta al pasar a "Preparando pedido".',
    tone: 'peach', size: 'wide', fields, values: o || { fecha: today(), metodoPago: list('metodosPago')[0] },
    submitLabel: o ? 'Guardar cambios' : 'Crear pedido', successMessage: o ? 'Pedido actualizado' : 'Pedido creado',
    onSubmit: (v) => { const { total: _t, ...rest } = v; return savePedido(rest, o?.id); },
  });
}

function changeEstado(id, estado, after) {
  const res = setEstadoPedido(id, estado);
  if (!res.ok) { toast(res.error, 'err'); return false; }
  toast(`Pedido en estado: ${estado}`);
  const o = getState().pedidos.find((x) => x.id === id);
  if (estado === 'Cancelado' && o && pedidoCobrado(o) > 0.009) {
    toast(`Este pedido tenía cobros por ${money(pedidoCobrado(o))}. Si los reembolsas, regístralo en Finanzas como "Devolución de dinero".`, 'err');
  }
  after?.();
  return true;
}

export function openPedidoDetail(id) {
  const o = getState().pedidos.find((x) => x.id === id);
  if (!o) return;
  const total = pedidoTotal(o); const cobrado = pedidoCobrado(o); const saldo = Math.round((total - cobrado) * 100) / 100;
  const siguiente = PEDIDO_SIGUIENTE[o.estado];
  const rate = getState().meta.tasa;
  const digits = String(o.telefono || '').replace(/\D/g, '');

  const select = h('select', { 'aria-label': 'Cambiar estado' }, list('estadosPedido').map((e) => h('option', { value: e }, e)));
  select.value = o.estado;

  const body = h('div', null,
    h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
      pill(o.estado), o.stockDescontado ? pill('Inventario descontado', 'mint') : pill('Sin descontar inventario', 'gray'),
      o.estado === 'Cancelado' ? null : saldo > 0.009 ? pill(`Por cobrar ${money(saldo)}`, 'rose') : pill('Cobrado', 'mint')),
    kv([
      ['Cliente', o.cliente],
      ['Teléfono', digits.length >= 7 ? h('a', { href: `https://wa.me/${digits}`, target: '_blank', rel: 'noopener noreferrer' }, o.telefono) : o.telefono],
      ['Canal', o.canal], ['Fecha', fmtDate(o.fecha)], ['Método de pago', o.metodoPago], ['Entrega', o.direccion],
    ]),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ['Producto', 'Cant.', 'Precio unit.', 'Subtotal'].map((t, i) => h('th', { class: i > 0 ? 'right' : '' }, t)))),
      h('tbody', null, o.lineas.map((l) => h('tr', null, h('td', null, productLabel(l.productoId)), h('td', { class: 'right num' }, int(l.cantidad)), h('td', { class: 'right num' }, money(l.precio)), h('td', { class: 'right num strong' }, money(l.cantidad * l.precio))))))),
    h('div', { class: 'totals' },
      h('div', null, h('span', null, 'Subtotal'), h('span', { class: 'num' }, money(pedidoSubtotal(o)))),
      o.descuento ? h('div', null, h('span', null, 'Descuento'), h('span', { class: 'num neg' }, `− ${money(o.descuento)}`)) : null,
      o.envio ? h('div', null, h('span', null, 'Envío'), h('span', { class: 'num' }, money(o.envio))) : null,
      h('div', { class: 'total' }, h('span', null, 'Total'), h('span', { class: 'num' }, money(total))),
      rate ? h('div', { class: 'muted small' }, h('span', null, `En bolívares (tasa ${rate})`), h('span', { class: 'num' }, money(total * rate, 'VES'))) : null,
      h('div', null, h('span', null, 'Cobrado'), h('span', { class: 'num pos' }, money(cobrado)))),
    o.nota ? h('div', { class: 'notice', style: { marginTop: '14px' } }, o.nota) : null,
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '18px', flexWrap: 'wrap' } },
      h('label', { class: 'small strong', for: 'sel-estado' }, 'Cambiar estado a'), Object.assign(select, { id: 'sel-estado', style: { width: 'auto', minWidth: '220px' } }),
      h('button', { class: 'btn soft sm', type: 'button', onclick: () => { if (select.value !== o.estado && changeEstado(o.id, select.value)) { m.close(); openPedidoDetail(o.id); } } }, 'Aplicar')));

  const footer = [
    h('button', {
      class: 'btn danger left', type: 'button',
      onclick: async () => {
        const ok = await confirmDialog({ title: 'Eliminar pedido', message: `¿Eliminar ${o.codigo} de ${o.cliente}?`, confirmLabel: 'Eliminar', danger: true });
        if (!ok) return;
        const res = deletePedido(o.id);
        if (!res.ok) { toast(res.error, 'err'); return; }
        m.close(); toast('Pedido eliminado');
      },
    }, icon('trash'), 'Eliminar'),
    h('button', { class: 'btn soft', type: 'button', onclick: () => { m.close(); openPedidoForm(getState().pedidos.find((x) => x.id === id)); } }, icon('edit'), 'Editar'),
    saldo > 0.009 && o.estado !== 'Cancelado' ? h('button', {
      class: 'btn tint', type: 'button',
      onclick: () => { m.close(); openTransactionForm({ title: 'Registrar cobro', subtitle: `${o.codigo} · ${o.cliente}`, info: `Saldo pendiente: ${money(saldo)}`, preset: { tipo: 'Ingreso', monto: saldo, concepto: `Cobro pedido ${o.codigo}`, metodoPago: o.metodoPago, ref: { tipo: 'pedido', id: o.id, codigo: o.codigo } } }); },
    }, icon('coins'), 'Registrar cobro') : null,
    siguiente ? h('button', { class: 'btn', type: 'button', onclick: () => { if (changeEstado(o.id, siguiente)) { m.close(); openPedidoDetail(o.id); } } }, `Pasar a "${siguiente}"`) : null,
  ].filter(Boolean);
  const m = openModal({ title: o.codigo, subtitle: `${o.cliente} · ${o.canal}`, tone: 'peach', size: 'wide', body, footer });
}

export function render() {
  const st = getState();
  const rows = st.pedidos.map((o) => {
    const total = pedidoTotal(o); const cobrado = pedidoCobrado(o);
    return { ...o, total, cobrado, saldo: o.estado === 'Cancelado' ? 0 : Math.round((total - cobrado) * 100) / 100 };
  }).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.codigo.localeCompare(a.codigo));

  const mes = thisMonth();
  const ventasMes = rows.filter((o) => o.fecha.startsWith(mes) && o.estado !== 'Cancelado').reduce((a, o) => a + o.total, 0);
  const activos = rows.filter((o) => PEDIDO_ACTIVO(o.estado));
  const incidencias = rows.filter((o) => o.estado === 'Incidencia').length;
  const porCob = porCobrar().reduce((a, x) => a + x.saldo, 0);

  const table = dataTable({
    id: 'pedidos', rows,
    empty: emptyState({ title: 'Todavía no hay pedidos', text: 'Registra el primer pedido de un cliente y sigue su camino hasta la entrega.', actions: [btn('Nuevo pedido', { ic: 'plus', onClick: () => openPedidoForm() })] }),
    searchText: (r) => [r.codigo, r.cliente, r.telefono, r.canal, r.estado, ...r.lineas.map((l) => productLabel(l.productoId))].join(' '),
    filters: [
      { key: 'estado', label: 'Estado', options: () => [{ value: '__activos', label: 'Solo activos' }, ...list('estadosPedido')], test: (r, v) => (v === '__activos' ? PEDIDO_ACTIVO(r.estado) : r.estado === v) },
      { key: 'canal', label: 'Canal', options: () => list('canales'), test: (r, v) => r.canal === v },
    ],
    onRowClick: (r) => openPedidoDetail(r.id),
    columns: [
      { key: 'codigo', label: 'Pedido', sort: (r) => r.codigo, render: (r) => h('span', { class: 'strong num' }, r.codigo) },
      { key: 'fecha', label: 'Fecha', sort: (r) => r.fecha, render: (r) => h('span', { class: 'num' }, fmtDate(r.fecha)) },
      { key: 'cliente', label: 'Cliente', sort: (r) => r.cliente, render: (r) => h('div', null, h('div', { class: 'strong' }, r.cliente), h('div', { class: 'sub' }, r.canal)) },
      { key: 'items', label: 'Productos', render: (r) => h('div', null, `${r.lineas.reduce((a, l) => a + l.cantidad, 0)} unidades`, h('div', { class: 'sub' }, `${r.lineas.length} ${r.lineas.length === 1 ? 'producto' : 'productos'}`)) },
      { key: 'estado', label: 'Estado', sort: (r) => r.estado, render: (r) => pill(r.estado) },
      { key: 'total', label: 'Total', align: 'right', sort: (r) => r.total, render: (r) => h('span', { class: 'num strong' }, money(r.total)) },
      { key: 'saldo', label: 'Por cobrar', align: 'right', sort: (r) => r.saldo, render: (r) => h('span', { class: `num ${r.saldo > 0 ? 'neg' : 'muted'}` }, money(r.saldo)) },
      {
        key: 'acc', label: '', render: (r) => (PEDIDO_SIGUIENTE[r.estado]
          ? h('button', { class: 'btn tint sm', type: 'button', onclick: () => changeEstado(r.id, PEDIDO_SIGUIENTE[r.estado]) }, `Pasar a ${PEDIDO_SIGUIENTE[r.estado]}`) : null),
      },
    ],
    exportCfg: { filename: 'valora-pedidos.csv', headers: ['Pedido', 'Fecha', 'Cliente', 'Teléfono', 'Canal', 'Estado', 'Total USD', 'Cobrado USD', 'Por cobrar USD'], map: (r) => [r.codigo, r.fecha, r.cliente, r.telefono, r.canal, r.estado, r.total, r.cobrado, r.saldo] },
  });

  return h('div', { 'data-tone': meta.tone },
    pageHead({
      title: 'Pedidos', tone: meta.tone,
      subtitle: 'De la solicitud del cliente a la entrega. El inventario y los cobros se enlazan solos.',
      actions: [btn('Nuevo pedido', { ic: 'plus', onClick: () => openPedidoForm() })],
    }),
    rows.length ? h('div', { class: 'kpis' },
      kpi({ label: 'Pedidos activos', value: int(activos.length), note: incidencias ? `${incidencias} con incidencia` : 'Sin incidencias', tone: 'peach' }),
      kpi({ label: 'Vendido este mes', value: money(ventasMes), note: 'Pedidos no cancelados', tone: 'mint' }),
      kpi({ label: 'Por cobrar', value: money(porCob), note: 'Saldo de pedidos', tone: 'rose' })) : null,
    table);
}
