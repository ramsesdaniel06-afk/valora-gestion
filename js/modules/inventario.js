// Módulo Inventario: existencias y kárdex de movimientos.
import { h, icon, money, int, fmtDate } from '../utils.js';
import { dataTable, pageHead, kpi, btn, emptyState, pill } from '../ui.js';
import { list, getState, enrichProducts, inventarioValor, productById, productLabel, MOV_SIGN } from '../store.js';
import { openMovementForm, openProductDetail, removeMovimiento } from './producto-ui.js';

export const meta = { title: 'Inventario', tone: 'mint' };
let tab = 'existencias';

export function render(rerender) {
  const st = getState();
  const rows = enrichProducts();
  const val = inventarioValor();
  const reponer = rows.filter((p) => p.alertaStock === 'REPONER').length;
  const agotados = rows.filter((p) => p.stock <= 0 && !['Descontinuado', 'Disponible por encargo'].includes(p.estadoComercial)).length;

  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    [['existencias', 'Existencias'], ['movimientos', 'Movimientos']].map(([k, label]) => h('button', {
      role: 'tab', type: 'button', 'aria-selected': String(tab === k), onclick: () => { tab = k; rerender(); },
    }, label)));

  let content;
  if (tab === 'existencias') {
    content = dataTable({
      id: 'inv-existencias', rows, defaultSort: { key: 'sku', dir: 'asc' },
      empty: emptyState({ title: 'Aún no hay productos', text: 'Crea productos en el Catálogo y aquí verás cuánto tienes de cada uno.' }),
      searchText: (r) => [r.sku, r.nombre, r.marca, r.variante].join(' '),
      filters: [
        { key: 'cat', label: 'Categoría', options: () => list('categorias'), test: (r, v) => r.categoria === v },
        { key: 'stock', label: 'Estado de stock', options: ['REPONER', 'STOCK OK', 'POR ENCARGO', 'DEFINIR MÍNIMO', 'NO REPONER'], test: (r, v) => r.alertaStock === v },
      ],
      onRowClick: (r) => openProductDetail(r.id),
      columns: [
        { key: 'sku', label: 'SKU', sort: (r) => r.sku, render: (r) => h('span', { class: 'strong num' }, r.sku) },
        { key: 'nombre', label: 'Producto', sort: (r) => r.nombre, render: (r) => h('div', null, h('div', { class: 'strong' }, r.nombre), h('div', { class: 'sub' }, [r.marca, r.variante].filter(Boolean).join(' · '))) },
        { key: 'categoria', label: 'Categoría', sort: (r) => r.categoria, render: (r) => pill(r.categoria, 'lilac') },
        { key: 'stock', label: 'Stock', align: 'right', sort: (r) => r.stock, render: (r) => h('span', { class: `num strong ${r.alertaStock === 'REPONER' ? 'neg' : ''}` }, int(r.stock)) },
        { key: 'min', label: 'Mínimo', align: 'right', sort: (r) => r.stockMin, render: (r) => h('span', { class: 'num muted' }, r.stockMin === null ? '—' : int(r.stockMin)) },
        { key: 'vc', label: 'Valor al costo', align: 'right', sort: (r) => r.stock * (r.costo || 0), render: (r) => h('span', { class: 'num' }, money(Math.max(0, r.stock) * (r.costo || 0))) },
        { key: 'vp', label: 'Valor al precio', align: 'right', sort: (r) => r.stock * (r.precio || 0), render: (r) => h('span', { class: 'num' }, money(Math.max(0, r.stock) * (r.precio || 0))) },
        { key: 'estado', label: 'Estado', sort: (r) => r.alertaStock, render: (r) => pill(r.alertaStock) },
      ],
      exportCfg: { filename: 'valora-existencias.csv', headers: ['SKU', 'Producto', 'Categoría', 'Stock', 'Mínimo', 'Costo', 'Precio', 'Estado'], map: (r) => [r.sku, r.nombre, r.categoria, r.stock, r.stockMin ?? '', r.costo ?? '', r.precio ?? '', r.alertaStock] },
    });
  } else {
    const movs = [...st.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.createdAt).localeCompare(String(a.createdAt)));
    content = dataTable({
      id: 'inv-movimientos', rows: movs, pageSize: 30,
      empty: emptyState({ title: 'Sin movimientos todavía', text: 'Aquí aparecerán las entradas por compra, salidas por venta y tus ajustes.', actions: [btn('Registrar movimiento', { ic: 'plus', onClick: () => openMovementForm() })] }),
      searchText: (r) => [productLabel(r.productoId), r.tipo, r.ref?.codigo, r.motivo, r.nota].join(' '),
      filters: [
        { key: 'tipo', label: 'Tipo', options: () => list('tiposMovimiento'), test: (r, v) => r.tipo === v },
        { key: 'origen', label: 'Origen', options: [{ value: 'compra', label: 'Compras' }, { value: 'pedido', label: 'Pedidos' }, { value: 'manual', label: 'Manuales' }], test: (r, v) => (v === 'manual' ? !r.ref : r.ref?.tipo === v) },
      ],
      columns: [
        { key: 'fecha', label: 'Fecha', sort: (r) => r.fecha, render: (r) => h('span', { class: 'num' }, fmtDate(r.fecha)) },
        { key: 'tipo', label: 'Tipo', sort: (r) => r.tipo, render: (r) => pill(r.tipo, MOV_SIGN[r.tipo] > 0 ? 'mint' : 'rose') },
        {
          key: 'prod', label: 'Producto', render: (r) => {
            const p = productById(r.productoId);
            return p ? h('div', null, h('div', { class: 'strong' }, p.nombre), h('div', { class: 'sub' }, `${p.sku}${p.variante ? ' · ' + p.variante : ''}`)) : h('span', { class: 'muted' }, '(eliminado)');
          },
        },
        { key: 'cant', label: 'Cantidad', align: 'right', sort: (r) => MOV_SIGN[r.tipo] * r.cantidad, render: (r) => h('span', { class: `num ${MOV_SIGN[r.tipo] > 0 ? 'pos' : 'neg'}` }, `${MOV_SIGN[r.tipo] > 0 ? '+' : '−'}${int(r.cantidad)}`) },
        { key: 'costo', label: 'Costo unit.', align: 'right', render: (r) => h('span', { class: 'num muted' }, money(r.costoUnit)) },
        { key: 'origen', label: 'Origen / detalle', render: (r) => h('div', null, r.ref ? h('div', { class: 'strong' }, r.ref.codigo) : null, h('div', { class: 'sub' }, [r.motivo, r.nota].filter(Boolean).join(' · ') || (r.ref ? '' : '—'))) },
        { key: 'acc', label: '', render: (r) => (r.ref ? null : h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Eliminar movimiento', onclick: () => removeMovimiento(r) }, icon('trash'))) },
      ],
      exportCfg: { filename: 'valora-movimientos.csv', headers: ['Fecha', 'Tipo', 'Producto', 'Cantidad', 'Costo unitario', 'Origen', 'Motivo', 'Nota'], map: (r) => [r.fecha, r.tipo, productLabel(r.productoId), MOV_SIGN[r.tipo] * r.cantidad, r.costoUnit, r.ref?.codigo || '', r.motivo, r.nota] },
    });
  }

  return h('div', { 'data-tone': meta.tone },
    pageHead({
      title: 'Inventario', tone: meta.tone,
      subtitle: 'El stock se calcula solo a partir de las compras recibidas, los pedidos y tus ajustes.',
      actions: [btn('Registrar movimiento', { ic: 'swap', onClick: () => openMovementForm() })],
    }),
    h('div', { class: 'kpis' },
      kpi({ label: 'Unidades en stock', value: int(val.unidades), note: `${int(rows.filter((p) => p.stock > 0).length)} productos con existencias`, tone: 'mint' }),
      kpi({ label: 'Valor al costo', value: money(val.costo), note: 'Lo que invertiste en la mercancía', tone: 'lilac' }),
      kpi({ label: 'Valor al precio de venta', value: money(val.venta), note: `Ganancia potencial ${money(val.venta - val.costo)}`, tone: 'butter' }),
      kpi({ label: 'Por reponer', value: int(reponer), note: agotados ? `${int(agotados)} sin existencias` : 'Sin productos agotados', tone: 'rose' })),
    tabs, content);
}
