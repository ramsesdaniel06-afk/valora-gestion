// Módulo Catálogo maestro (hoja Catalago_Maestro del Excel).
import { h, icon, money, int, pct, fmtDate } from '../utils.js';
import { dataTable, pageHead, kpi, btn, emptyState, pill } from '../ui.js';
import { list, enrichProducts, proveedorName } from '../store.js';
import { openProductForm, openProductDetail, alertPills } from './producto-ui.js';
import { pickExcelAndImport } from '../importer.js';

export const meta = { title: 'Catálogo', tone: 'lilac' };

export function render() {
  const rows = enrichProducts();
  const reponer = rows.filter((p) => p.alertaStock === 'REPONER').length;
  const fichas = rows.filter((p) => p.controlFicha !== 'OK' || p.alertaCostos !== 'OK').length;
  const sinVerificar = rows.filter((p) => p.alertaVerif !== 'OK' && p.estadoVerif !== 'Descartado').length;

  const columns = [
    { key: 'sku', label: 'SKU', sort: (r) => r.sku, render: (r) => h('span', { class: 'strong num' }, r.sku || '—') },
    {
      key: 'nombre', label: 'Producto', sort: (r) => r.nombre,
      render: (r) => h('div', null, h('div', { class: 'strong' }, r.nombre), h('div', { class: 'sub' }, [r.marca, r.variante, r.presentacion].filter(Boolean).join(' · '))),
    },
    { key: 'categoria', label: 'Categoría', sort: (r) => r.categoria, render: (r) => pill(r.categoria, 'lilac') },
    { key: 'costo', label: 'Costo', align: 'right', sort: (r) => r.costo, render: (r) => h('span', { class: 'num' }, r.costo === null ? '—' : money(r.costo)) },
    { key: 'precio', label: 'Precio', align: 'right', sort: (r) => r.precio, render: (r) => h('span', { class: 'num' }, r.precio === null ? '—' : money(r.precio)) },
    { key: 'margen', label: 'Margen', align: 'right', sort: (r) => r.margen, render: (r) => h('span', { class: `num ${r.margen !== null && r.margen < 0.2 ? 'neg' : ''}` }, pct(r.margen)) },
    {
      key: 'stock', label: 'Stock', align: 'right', sort: (r) => r.stock,
      render: (r) => h('div', null, h('span', { class: `num strong ${r.alertaStock === 'REPONER' ? 'neg' : ''}` }, int(r.stock)), r.stockMin !== null ? h('div', { class: 'sub' }, `mín. ${int(r.stockMin)}`) : null),
    },
    { key: 'estado', label: 'Estado comercial', sort: (r) => r.estadoComercial, render: (r) => pill(r.estadoComercial) },
    { key: 'alertas', label: 'Alertas', render: alertPills },
  ];

  const filters = [
    { key: 'cat', label: 'Categoría', options: () => list('categorias'), test: (r, v) => r.categoria === v },
    { key: 'verif', label: 'Verificación', options: () => list('estadosVerificacion'), test: (r, v) => r.estadoVerif === v },
    { key: 'com', label: 'Estado comercial', options: () => list('estadosComerciales'), test: (r, v) => r.estadoComercial === v },
    {
      key: 'alerta', label: 'Alertas',
      options: [{ value: 'any', label: 'Con alguna alerta' }, { value: 'stock', label: 'Por reponer' }, { value: 'ficha', label: 'Ficha incompleta' }, { value: 'costos', label: 'Costos por completar' }, { value: 'sku', label: 'SKU duplicado' }, { value: 'verif', label: 'Sin verificar' }],
      test: (r, v) => ({
        any: r.hasAlert, stock: r.alertaStock === 'REPONER', ficha: r.controlFicha !== 'OK', costos: r.alertaCostos !== 'OK', sku: r.controlSku !== 'OK', verif: r.alertaVerif !== 'OK',
      })[v],
    },
  ];

  const empty = emptyState({
    title: 'Tu catálogo está vacío',
    text: 'Crea tu primer producto o importa el catálogo desde tu Excel de VALORA.',
    actions: [btn('Nuevo producto', { ic: 'plus', onClick: () => openProductForm() }), btn('Importar desde Excel', { kind: 'soft', ic: 'upload', onClick: pickExcelAndImport })],
  });

  const table = dataTable({
    id: 'catalogo', columns, rows, filters, empty, defaultSort: { key: 'sku', dir: 'asc' },
    searchText: (r) => [r.sku, r.nombre, r.marca, r.tipo, r.variante, r.categoria, proveedorName(r.proveedorId)].join(' '),
    onRowClick: (r) => openProductDetail(r.id),
    exportCfg: {
      filename: 'valora-catalogo.csv',
      headers: ['SKU', 'Categoría', 'Marca', 'Nombre comercial', 'Tipo', 'Variante', 'Presentación', 'Proveedor', 'Fuente de verificación', 'Costo USD', 'Precio USD', 'Margen %', 'Estado verificación', 'Estado comercial', 'Fecha verificación', 'Observaciones', 'Stock mínimo', 'Stock actual', 'Alerta de stock', 'Alerta de verificación', 'Alerta de costos', 'Control SKU', 'Control de ficha'],
      map: (r) => [r.sku, r.categoria, r.marca, r.nombre, r.tipo, r.variante, r.presentacion, proveedorName(r.proveedorId), r.fuente, r.costo ?? '', r.precio ?? '', r.margen === null ? '' : (r.margen * 100).toFixed(1), r.estadoVerif, r.estadoComercial, r.fechaVerif, r.obs, r.stockMin ?? '', r.stock, r.alertaStock, r.alertaVerif, r.alertaCostos, r.controlSku, r.controlFicha],
    },
  });

  return h('div', { 'data-tone': meta.tone },
    pageHead({
      title: 'Catálogo maestro', tone: meta.tone,
      subtitle: 'Todos tus productos con costo, precio, margen y alertas. Toca un producto para ver su ficha completa.',
      actions: [btn('Importar Excel', { kind: 'soft', ic: 'upload', onClick: pickExcelAndImport }), btn('Nuevo producto', { ic: 'plus', onClick: () => openProductForm() })],
    }),
    rows.length ? h('div', { class: 'kpis' },
      kpi({ label: 'Productos en catálogo', value: int(rows.length), note: `${int(rows.filter((p) => p.estadoComercial === 'Disponible en stock').length)} disponibles en stock`, tone: 'lilac' }),
      kpi({ label: 'Por reponer', value: int(reponer), note: reponer ? 'Stock igual o menor al mínimo' : 'Todo en orden', tone: 'rose' }),
      kpi({ label: 'Fichas por completar', value: int(fichas), note: 'Datos o costos pendientes', tone: 'butter' }),
      kpi({ label: 'Sin verificar', value: int(sinVerificar), note: 'Pendientes o en revisión', tone: 'sky' })) : null,
    table);
}

void icon; void fmtDate;
