// Módulo Proveedores (hoja Proveedores del Excel).
import { h, icon, money, fmtDate, int } from '../utils.js';
import { dataTable, pageHead, kpi, btn, emptyState, pill, openForm, confirmDialog, toast } from '../ui.js';
import { list, getState, saveProveedor, deleteProveedor } from '../store.js';
import { pickExcelAndImport } from '../importer.js';

export const meta = { title: 'Proveedores', tone: 'rose' };

export function openProveedorForm(p = null) {
  const fields = [
    { type: 'section', label: 'Identificación' },
    { name: 'nombre', label: 'Nombre comercial', type: 'text', required: true },
    { name: 'razon', label: 'Razón social', type: 'text' },
    { name: 'tipo', label: 'Tipo de proveedor', type: 'select', options: list('tiposProveedor') },
    { name: 'estadoEval', label: 'Estado de evaluación', type: 'select', noBlank: true, options: list('estadosProveedor'), default: 'Por evaluar' },
    { name: 'fuenteInfo', label: 'Fuente de información', type: 'text', placeholder: 'Instagram, referido, feria…' },
    { name: 'fechaEval', label: 'Fecha de evaluación', type: 'date' },
    { type: 'section', label: 'Contacto' },
    { name: 'contacto', label: 'Persona de contacto', type: 'text' },
    { name: 'telefono', label: 'Teléfono', type: 'tel', placeholder: '+58 414 000 0000' },
    { name: 'correo', label: 'Correo', type: 'email' },
    { name: 'web', label: 'Instagram o web', type: 'text' },
    { name: 'ubicacion', label: 'Ubicación', type: 'text' },
    { name: 'cobertura', label: 'Cobertura de entrega', type: 'text', placeholder: 'Nacional, solo Carabobo…' },
    { type: 'section', label: 'Condiciones comerciales' },
    { name: 'categorias', label: 'Categorías que suministra', type: 'multi', options: list('categorias'), span2: true },
    { name: 'monedaCompra', label: 'Moneda de compra', type: 'select', noBlank: true, options: list('monedas'), default: 'USD' },
    { name: 'pedidoMin', label: 'Pedido mínimo (USD)', type: 'number' },
    { name: 'tiempoRepo', label: 'Tiempo de reposición', type: 'text', placeholder: '3 días, 2 semanas…' },
    { name: 'condPago', label: 'Condiciones de pago', type: 'text' },
    { name: 'politicaCambios', label: 'Política de cambios', type: 'text', span2: true },
    { name: 'obs', label: 'Observaciones', type: 'textarea', span2: true },
  ];
  let modal;
  const extraFooter = p ? [h('button', {
    class: 'btn danger left', type: 'button',
    onclick: async () => {
      const ok = await confirmDialog({ title: 'Eliminar proveedor', message: `¿Eliminar a "${p.nombre}"?`, confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      const res = deleteProveedor(p.id);
      if (!res.ok) { toast(res.error, 'err'); return; }
      modal?.close();
      toast('Proveedor eliminado');
    },
  }, icon('trash'), 'Eliminar')] : [];
  modal = openForm({
    title: p ? 'Editar proveedor' : 'Nuevo proveedor', subtitle: p ? `${p.codigo} · ${p.nombre}` : 'Guarda aquí sus condiciones para comparar y decidir mejor.',
    tone: 'rose', size: '', fields, values: p || {}, submitLabel: p ? 'Guardar cambios' : 'Crear proveedor', extraFooter,
    successMessage: p ? 'Proveedor actualizado' : 'Proveedor creado',
    onSubmit: (v) => saveProveedor(v, p?.id),
  });
  return modal;
}

export function render() {
  const st = getState();
  const rows = st.proveedores.map((p) => ({ ...p, nProductos: st.productos.filter((x) => x.proveedorId === p.id).length }));
  const aprobados = rows.filter((p) => p.estadoEval === 'Aprobado').length;
  const porEvaluar = rows.filter((p) => ['Por evaluar', 'En evaluación'].includes(p.estadoEval)).length;

  const table = dataTable({
    id: 'proveedores', rows, defaultSort: { key: 'nombre', dir: 'asc' },
    empty: emptyState({
      title: 'Aún no hay proveedores', text: 'Registra de dónde vienen tus productos para comparar costos, tiempos y condiciones.',
      actions: [btn('Nuevo proveedor', { ic: 'plus', onClick: () => openProveedorForm() }), btn('Importar desde Excel', { kind: 'soft', ic: 'upload', onClick: pickExcelAndImport })],
    }),
    searchText: (r) => [r.codigo, r.nombre, r.razon, r.contacto, r.ubicacion, r.tipo, (r.categorias || []).join(' ')].join(' '),
    filters: [
      { key: 'tipo', label: 'Tipo', options: () => list('tiposProveedor'), test: (r, v) => r.tipo === v },
      { key: 'estado', label: 'Estado', options: () => list('estadosProveedor'), test: (r, v) => r.estadoEval === v },
      { key: 'cat', label: 'Categoría', options: () => list('categorias'), test: (r, v) => (r.categorias || []).includes(v) },
    ],
    onRowClick: (r) => openProveedorForm(st.proveedores.find((x) => x.id === r.id)),
    columns: [
      { key: 'codigo', label: 'ID', sort: (r) => r.codigo, render: (r) => h('span', { class: 'num muted' }, r.codigo) },
      { key: 'nombre', label: 'Proveedor', sort: (r) => r.nombre, render: (r) => h('div', null, h('div', { class: 'strong' }, r.nombre), h('div', { class: 'sub' }, r.razon || r.ubicacion || '')) },
      { key: 'tipo', label: 'Tipo', sort: (r) => r.tipo, render: (r) => (r.tipo ? pill(r.tipo, 'rose') : '—') },
      {
        key: 'contacto', label: 'Contacto', render: (r) => {
          const digits = String(r.telefono || '').replace(/\D/g, '');
          return h('div', null, h('div', null, r.contacto || '—'), digits.length >= 7
            ? h('a', { class: 'sub', href: `https://wa.me/${digits}`, target: '_blank', rel: 'noopener noreferrer' }, r.telefono)
            : h('div', { class: 'sub' }, r.telefono || ''));
        },
      },
      { key: 'cats', label: 'Categorías', render: (r) => h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } }, (r.categorias || []).map((c) => pill(c, 'lilac'))) },
      { key: 'repo', label: 'Reposición', render: (r) => h('div', null, h('div', null, r.tiempoRepo || '—'), r.pedidoMin !== '' && r.pedidoMin !== null ? h('div', { class: 'sub' }, `Mín. ${money(r.pedidoMin)}`) : null) },
      { key: 'prod', label: 'Productos', align: 'right', sort: (r) => r.nProductos, render: (r) => h('span', { class: 'num' }, int(r.nProductos)) },
      { key: 'estado', label: 'Evaluación', sort: (r) => r.estadoEval, render: (r) => h('div', null, pill(r.estadoEval), r.fechaEval ? h('div', { class: 'sub' }, fmtDate(r.fechaEval)) : null) },
    ],
    exportCfg: {
      filename: 'valora-proveedores.csv',
      headers: ['ID', 'Nombre comercial', 'Razón social', 'Tipo', 'Contacto', 'Teléfono', 'Correo', 'Instagram o web', 'Ubicación', 'Cobertura', 'Categorías', 'Moneda', 'Pedido mínimo', 'Reposición', 'Condiciones de pago', 'Política de cambios', 'Fuente', 'Estado', 'Fecha evaluación', 'Observaciones'],
      map: (r) => [r.codigo, r.nombre, r.razon, r.tipo, r.contacto, r.telefono, r.correo, r.web, r.ubicacion, r.cobertura, (r.categorias || []).join('; '), r.monedaCompra, r.pedidoMin, r.tiempoRepo, r.condPago, r.politicaCambios, r.fuenteInfo, r.estadoEval, r.fechaEval, r.obs],
    },
  });

  return h('div', { 'data-tone': meta.tone },
    pageHead({
      title: 'Proveedores', tone: meta.tone,
      subtitle: 'Quién te surte, en cuánto tiempo y bajo qué condiciones. Toca un proveedor para editarlo.',
      actions: [btn('Importar Excel', { kind: 'soft', ic: 'upload', onClick: pickExcelAndImport }), btn('Nuevo proveedor', { ic: 'plus', onClick: () => openProveedorForm() })],
    }),
    rows.length ? h('div', { class: 'kpis' },
      kpi({ label: 'Proveedores', value: int(rows.length), tone: 'rose' }),
      kpi({ label: 'Aprobados', value: int(aprobados), note: 'Listos para comprarles', tone: 'mint' }),
      kpi({ label: 'Por evaluar', value: int(porEvaluar), note: 'Faltan datos para decidir', tone: 'butter' })) : null,
    table);
}
