// Formularios y fichas de producto / movimiento compartidos por Catálogo, Inventario y Panel.
import { h, icon, money, int, pct, fmtDate, today, toNum } from '../utils.js';
import { openForm, openModal, confirmDialog, pill, toast, kv } from '../ui.js';
import {
  getState, list, enrichProducts, saveProducto, deleteProducto, addMovimiento, deleteMovimiento, suggestSku,
  proveedorName, productLabel, MOV_SIGN, MANUAL_MOV_TYPES,
} from '../store.js';

/** Alertas del Excel traducidas a etiquetas cortas para la tabla. */
export function alertPills(p) {
  const out = [];
  if (p.alertaVerif !== 'OK') out.push(pill('Verificar', 'butter'));
  if (p.alertaCostos === 'COMPLETAR COSTOS') out.push(pill('Completar costos', 'butter'));
  if (p.alertaCostos === 'REVISAR PRECIO') out.push(pill('Revisar precio', 'rose'));
  if (p.controlSku !== 'OK') out.push(pill('SKU duplicado', 'rose'));
  if (p.controlFicha !== 'OK') out.push(pill('Ficha incompleta', 'butter'));
  if (p.alertaStock === 'REPONER') out.push(pill('Reponer', 'rose'));
  if (p.alertaStock === 'DEFINIR MÍNIMO') out.push(pill('Definir mínimo', 'butter'));
  return out.length ? h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, out) : pill('OK', 'mint');
}

export function openProductForm(p = null, { onSaved } = {}) {
  const st = getState();
  const margen = (v) => {
    const c = toNum(v.costo); const pr = toNum(v.precio);
    if (c === null || pr === null || pr === 0) return 'Completa costo y precio';
    return `${pct((pr - c) / pr)} · ganancia de ${money(pr - c)} por unidad`;
  };
  const fields = [
    { type: 'section', label: 'Identificación' },
    { name: 'categoria', label: 'Categoría', type: 'select', required: true, options: list('categorias') },
    { name: 'sku', label: 'SKU', type: 'text', required: true, autofill: (v) => (v.categoria ? suggestSku(v.categoria) : ''), help: 'Se sugiere según la categoría; puedes cambiarlo.' },
    { name: 'marca', label: 'Marca', type: 'text', required: true },
    { name: 'nombre', label: 'Nombre comercial', type: 'text', required: true },
    { name: 'tipo', label: 'Tipo de producto', type: 'text', required: true, placeholder: 'Esmalte, crema, shampoo…' },
    { name: 'variante', label: 'Variante / tono', type: 'text' },
    { name: 'presentacion', label: 'Presentación', type: 'text', placeholder: '30 ml, pack x5…' },
    { name: 'unidad', label: 'Unidad de medida', type: 'select', noBlank: true, options: list('unidades'), default: 'Unidad' },
    { type: 'section', label: 'Origen y verificación' },
    { name: 'proveedorId', label: 'Proveedor principal', type: 'select', options: st.proveedores.map((x) => ({ value: x.id, label: x.nombre })) },
    { name: 'fuente', label: 'Fuente de verificación', type: 'text', placeholder: 'Web oficial, catálogo, Instagram…' },
    { name: 'estadoVerif', label: 'Estado de verificación', type: 'select', noBlank: true, options: list('estadosVerificacion'), default: 'Pendiente' },
    { name: 'fechaVerif', label: 'Fecha de verificación', type: 'date' },
    { name: 'estadoComercial', label: 'Estado comercial', type: 'select', noBlank: true, options: list('estadosComerciales'), default: 'En evaluación' },
    { type: 'section', label: 'Precios' },
    { name: 'costo', label: 'Costo de adquisición (USD)', type: 'number' },
    { name: 'precio', label: 'Precio de venta (USD)', type: 'number' },
    { name: 'margen', label: 'Margen bruto', type: 'computed', compute: margen, span2: true },
    { type: 'section', label: 'Inventario' },
    { name: 'stockMin', label: 'Stock mínimo', type: 'number', step: '1', help: 'Cuando el stock llegue a este número, aparece la alerta "Reponer".' },
    ...(p ? [] : [{ name: 'stockInicial', label: 'Stock inicial', type: 'number', step: '1', help: 'Si ya tienes unidades, se registran como un ajuste positivo.' }]),
    { name: 'obs', label: 'Observaciones', type: 'textarea', span2: true },
  ];
  return openForm({
    title: p ? 'Editar producto' : 'Nuevo producto',
    subtitle: p ? `${p.sku} · ${p.nombre}` : 'Completa la ficha. Los campos con * son obligatorios.',
    tone: 'lilac', fields, values: p || {}, submitLabel: p ? 'Guardar cambios' : 'Crear producto',
    successMessage: p ? 'Producto actualizado' : 'Producto creado',
    onSubmit: (v) => {
      const { stockInicial, margen: _m, ...rest } = v;
      const res = saveProducto(rest, { id: p?.id, stockInicial });
      if (res.ok) onSaved?.(res);
      return res;
    },
  });
}

export function openMovementForm({ productoId = '', tipo = 'Ajuste positivo' } = {}) {
  const st = getState();
  const stocks = new Map(enrichProducts().map((x) => [x.id, x.stock]));
  const fields = [
    { name: 'fecha', label: 'Fecha', type: 'date', required: true, default: today() },
    { name: 'tipo', label: 'Tipo de movimiento', type: 'select', noBlank: true, required: true, options: MANUAL_MOV_TYPES, default: tipo },
    { name: 'productoId', label: 'Producto', type: 'select', required: true, span2: true, options: [...st.productos].sort((a, b) => a.sku.localeCompare(b.sku)).map((x) => ({ value: x.id, label: `${x.sku} · ${x.nombre}${x.variante ? ' · ' + x.variante : ''} (stock ${int(stocks.get(x.id) || 0)})` })) },
    { name: 'cantidad', label: 'Cantidad', type: 'number', step: '1', min: '1', required: true },
    { name: 'motivo', label: 'Motivo', type: 'select', options: list('motivosAjuste'), help: 'Opcional, pero ayuda a entender los ajustes después.' },
    { name: 'nota', label: 'Nota', type: 'textarea', span2: true },
  ];
  return openForm({
    title: 'Registrar movimiento', subtitle: 'Ajustes, devoluciones y pérdidas. Las compras y ventas se registran desde sus módulos.',
    tone: 'mint', fields, values: { productoId, tipo, fecha: today() }, submitLabel: 'Registrar', successMessage: 'Movimiento registrado',
    onSubmit: (v) => addMovimiento(v),
  });
}

export function openProductDetail(id) {
  const p = enrichProducts().find((x) => x.id === id);
  if (!p) return;
  const st = getState();
  const movs = st.movimientos.filter((m) => m.productoId === id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const body = h('div', null,
    h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
      pill(p.estadoComercial), pill(p.estadoVerif), alertPills(p)),
    kv([
      ['SKU', p.sku], ['Categoría', p.categoria], ['Marca', p.marca], ['Tipo', p.tipo], ['Variante / tono', p.variante], ['Presentación', p.presentacion],
      ['Proveedor principal', proveedorName(p.proveedorId)], ['Fuente de verificación', p.fuente], ['Fecha de verificación', fmtDate(p.fechaVerif)],
      ['Costo', p.costo === null ? '—' : money(p.costo)], ['Precio de venta', p.precio === null ? '—' : money(p.precio)], ['Margen bruto', pct(p.margen)],
      ['Stock actual', `${int(p.stock)} ${p.unidad ? p.unidad.toLowerCase() + 's' : ''}`], ['Stock mínimo', p.stockMin === null ? '—' : int(p.stockMin)], ['Valor en stock (costo)', money(p.stock * (p.costo || 0))],
    ]),
    p.obs ? h('div', { class: 'notice', style: { marginBottom: '14px' } }, p.obs) : null,
    h('h3', { style: { fontFamily: 'var(--font-display)', fontSize: '16px', margin: '6px 0 8px' } }, 'Últimos movimientos'),
    movs.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, ['Fecha', 'Tipo', 'Cantidad', 'Origen'].map((t, i) => h('th', { class: i === 2 ? 'right' : '' }, t)))),
        h('tbody', null, movs.map((m) => h('tr', null,
          h('td', null, fmtDate(m.fecha)), h('td', null, pill(m.tipo)),
          h('td', { class: `right num ${MOV_SIGN[m.tipo] > 0 ? 'pos' : 'neg'}` }, `${MOV_SIGN[m.tipo] > 0 ? '+' : '−'}${int(m.cantidad)}`),
          h('td', null, m.ref?.codigo || m.motivo || m.nota || '—'))))))
      : h('p', { class: 'muted' }, 'Todavía no hay movimientos para este producto.'));

  const m = openModal({
    title: p.nombre, subtitle: `${p.sku}${p.variante ? ' · ' + p.variante : ''}`, tone: 'lilac', size: 'wide', body,
    footer: [
      h('button', {
        class: 'btn danger left', type: 'button',
        onclick: async () => {
          const ok = await confirmDialog({ title: 'Eliminar producto', message: `¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar', danger: true });
          if (!ok) return;
          const res = deleteProducto(id);
          if (!res.ok) { toast(res.error, 'err'); return; }
          m.close(); toast('Producto eliminado');
        },
      }, icon('trash'), 'Eliminar'),
      h('button', { class: 'btn tint', type: 'button', onclick: () => { m.close(); openMovementForm({ productoId: id }); } }, icon('swap'), 'Ajustar stock'),
      h('button', { class: 'btn', type: 'button', onclick: () => { m.close(); openProductForm(getState().productos.find((x) => x.id === id)); } }, icon('edit'), 'Editar'),
    ],
  });
}

export async function removeMovimiento(m) {
  const ok = await confirmDialog({ title: 'Eliminar movimiento', message: `Se eliminará el movimiento de ${m.cantidad} unidad(es) de "${productLabel(m.productoId)}".`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  const res = deleteMovimiento(m.id);
  toast(res.ok ? 'Movimiento eliminado' : res.error, res.ok ? 'ok' : 'err');
}
