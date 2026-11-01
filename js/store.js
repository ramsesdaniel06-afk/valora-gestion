// Estado de la aplicación, reglas de negocio y persistencia.
// Todo el estado vive en un objeto simple que se guarda en localStorage
// y, si se configura, se sincroniza con Supabase (ver cloud.js).
import { uid, today, nextCode, round2, toNum, norm } from './utils.js';
import { emptyState, defaultLists, demoData, LIST_DEFS } from './seed.js';

const KEY = 'valora.v1';
let state = load();
const listeners = new Set();
const persistHooks = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
  return emptyState();
}

/** Completa claves faltantes para que versiones viejas del respaldo sigan funcionando. */
function migrate(s) {
  const base = emptyState();
  const out = { ...base, ...s, meta: { ...base.meta, ...(s.meta || {}) }, lists: { ...defaultLists(), ...(s.lists || {}) } };
  for (const k of ['productos', 'proveedores', 'movimientos', 'compras', 'pedidos', 'transacciones']) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}

export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onPersist = (fn) => { persistHooks.add(fn); };

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('No se pudo guardar', e); window.dispatchEvent(new CustomEvent('valora:storage-error')); }
  persistHooks.forEach((fn) => fn(state));
}
export function commit(mutator) {
  mutator(state);
  persist();
  listeners.forEach((fn) => fn(state));
}
export function replaceState(next, { silent = false } = {}) {
  state = migrate(next);
  persist();
  if (!silent) listeners.forEach((fn) => fn(state));
}

const stamp = () => new Date().toISOString();
const fail = (error) => ({ ok: false, error });
const done = (extra = {}) => ({ ok: true, ...extra });

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------
export const list = (key) => state.lists[key] || [];
export const listDef = (key) => LIST_DEFS.find((d) => d.key === key);

export function addListItem(key, value) {
  const v = String(value || '').trim();
  if (!v) return fail('Escribe un valor.');
  if (list(key).some((x) => norm(x) === norm(v))) return fail('Ese valor ya existe en la lista.');
  commit((s) => { s.lists[key] = [...list(key), v]; });
  return done();
}
export function removeListItem(key, value) {
  const def = listDef(key);
  if (def?.locked || def?.protect?.includes(value)) return fail('Este valor es parte de las reglas automáticas y no se puede quitar.');
  commit((s) => { s.lists[key] = list(key).filter((x) => x !== value); });
  return done();
}

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------
export const MOV_SIGN = {
  'Entrada por compra': 1,
  'Salida por venta': -1,
  'Ajuste positivo': 1,
  'Ajuste negativo': -1,
  'Devolución recibida': 1,
  'Salida por pérdida': -1,
};
export const MANUAL_MOV_TYPES = ['Ajuste positivo', 'Ajuste negativo', 'Devolución recibida', 'Salida por pérdida'];

export function stockMap(s = state) {
  const m = new Map();
  for (const mv of s.movimientos) m.set(mv.productoId, (m.get(mv.productoId) || 0) + (MOV_SIGN[mv.tipo] || 0) * mv.cantidad);
  return m;
}
export const stockOf = (id) => stockMap().get(id) || 0;

const blank = (v) => v === null || v === undefined || v === '';

/** Calcula las mismas columnas automáticas de la hoja Catalago_Maestro. */
export function enrichProducts(s = state) {
  const stocks = stockMap(s);
  const skuCount = new Map();
  for (const p of s.productos) { const k = norm(p.sku); if (k) skuCount.set(k, (skuCount.get(k) || 0) + 1); }
  return s.productos.map((p) => {
    const stock = stocks.get(p.id) || 0;
    const margen = blank(p.costo) || blank(p.precio) || Number(p.precio) === 0 ? null : (p.precio - p.costo) / p.precio;
    const alertaVerif = p.estadoVerif === 'Verificado' ? 'OK' : 'REVISAR';
    const alertaCostos = blank(p.costo) || blank(p.precio) || p.costo <= 0 || p.precio <= 0 ? 'COMPLETAR COSTOS' : p.precio <= p.costo ? 'REVISAR PRECIO' : 'OK';
    const controlSku = p.sku && skuCount.get(norm(p.sku)) > 1 ? 'SKU DUPLICADO' : 'OK';
    const controlFicha = [p.sku, p.categoria, p.marca, p.tipo, p.estadoVerif, p.fuente].some(blank) ? 'FICHA INCOMPLETA' : 'OK';
    let alertaStock;
    if (p.estadoComercial === 'Descontinuado') alertaStock = 'NO REPONER';
    else if (p.estadoComercial === 'Disponible por encargo') alertaStock = 'POR ENCARGO';
    else if (blank(p.stockMin)) alertaStock = 'DEFINIR MÍNIMO';
    else alertaStock = stock <= p.stockMin ? 'REPONER' : 'STOCK OK';
    const hasAlert = alertaVerif !== 'OK' || alertaCostos !== 'OK' || controlSku !== 'OK' || controlFicha !== 'OK' || alertaStock === 'REPONER';
    return { ...p, stock, margen, alertaVerif, alertaCostos, controlSku, controlFicha, alertaStock, hasAlert };
  });
}

export const productById = (id) => state.productos.find((p) => p.id === id);
export const proveedorById = (id) => state.proveedores.find((p) => p.id === id);
export const productLabel = (id) => { const p = productById(id); return p ? `${p.sku} · ${p.nombre}${p.variante ? ' · ' + p.variante : ''}` : '(producto eliminado)'; };
export const proveedorName = (id) => proveedorById(id)?.nombre || '—';

const SKU_PREFIX = { Beauty: 'BEA', Skin: 'SKI', Hair: 'HAI', Body: 'BOD', Nails: 'NAI', Angelus: 'ANG' };
export function suggestSku(categoria) {
  const prefix = SKU_PREFIX[categoria] || String(categoria || 'PRD').normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'PRD';
  return nextCode(prefix, state.productos.filter((p) => String(p.sku).startsWith(prefix + '-')), 'sku');
}

export function saveProducto(values, { id = null, stockInicial = 0 } = {}) {
  const v = { ...values, costo: toNum(values.costo), precio: toNum(values.precio), stockMin: toNum(values.stockMin) };
  v.sku = String(v.sku || '').trim().toUpperCase();
  if (!v.sku) return fail('El SKU es obligatorio.');
  if (!String(v.nombre || '').trim()) return fail('El nombre comercial es obligatorio.');
  if (state.productos.some((p) => p.id !== id && norm(p.sku) === norm(v.sku))) return fail(`Ya existe un producto con el SKU ${v.sku}.`);
  if (v.costo !== null && v.costo < 0) return fail('El costo no puede ser negativo.');
  if (v.precio !== null && v.precio < 0) return fail('El precio no puede ser negativo.');
  let newId = id;
  commit((s) => {
    if (id) {
      const i = s.productos.findIndex((p) => p.id === id);
      s.productos[i] = { ...s.productos[i], ...v, updatedAt: stamp() };
    } else {
      newId = uid();
      s.productos.push({ id: newId, ...v, createdAt: stamp(), updatedAt: stamp() });
      const qty = Number(stockInicial) || 0;
      if (qty > 0) s.movimientos.push({ id: uid(), fecha: today(), tipo: 'Ajuste positivo', productoId: newId, cantidad: qty, costoUnit: v.costo ?? 0, motivo: 'Otro motivo', nota: 'Stock inicial', ref: null, createdAt: stamp() });
    }
  });
  return done({ id: newId });
}

export function deleteProducto(id) {
  const usedIn = [
    state.movimientos.some((m) => m.productoId === id) && 'movimientos de inventario',
    state.compras.some((c) => c.lineas.some((l) => l.productoId === id)) && 'compras',
    state.pedidos.some((o) => o.lineas.some((l) => l.productoId === id)) && 'pedidos',
  ].filter(Boolean);
  if (usedIn.length) return fail(`No se puede eliminar: tiene ${usedIn.join(', ')}. Mejor márcalo como "Descontinuado".`);
  commit((s) => { s.productos = s.productos.filter((p) => p.id !== id); });
  return done();
}

export function addMovimiento({ fecha, tipo, productoId, cantidad, motivo = '', nota = '', ref = null, costoUnit }) {
  const qty = Number(cantidad);
  if (!productoId) return fail('Elige un producto.');
  if (!(qty > 0)) return fail('La cantidad debe ser mayor que cero.');
  const p = productById(productoId);
  if (!p) return fail('El producto ya no existe.');
  if (MOV_SIGN[tipo] < 0 && qty > stockOf(productoId)) return fail(`Solo hay ${stockOf(productoId)} en stock de ${p.nombre}.`);
  commit((s) => {
    s.movimientos.push({ id: uid(), fecha: fecha || today(), tipo, productoId, cantidad: qty, costoUnit: costoUnit ?? p.costo ?? 0, motivo, nota, ref, createdAt: stamp() });
  });
  return done();
}

export function deleteMovimiento(id) {
  const m = state.movimientos.find((x) => x.id === id);
  if (!m) return fail('No encontrado.');
  if (m.ref) return fail('Este movimiento viene de una compra o pedido. Corrígelo desde ese documento.');
  const stockAfter = stockOf(m.productoId) - MOV_SIGN[m.tipo] * m.cantidad;
  if (stockAfter < 0) return fail('Si eliminas este movimiento el stock quedaría negativo.');
  commit((s) => { s.movimientos = s.movimientos.filter((x) => x.id !== id); });
  return done();
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------
export function saveProveedor(values, id = null) {
  const v = { ...values, pedidoMin: toNum(values.pedidoMin) ?? '' };
  if (!String(v.nombre || '').trim()) return fail('El nombre comercial es obligatorio.');
  let newId = id;
  commit((s) => {
    if (id) {
      const i = s.proveedores.findIndex((p) => p.id === id);
      s.proveedores[i] = { ...s.proveedores[i], ...v, updatedAt: stamp() };
    } else {
      newId = uid();
      s.proveedores.push({ id: newId, ...v, codigo: nextCode('PRV', s.proveedores), createdAt: stamp(), updatedAt: stamp() });
    }
  });
  return done({ id: newId });
}
export function deleteProveedor(id) {
  if (state.productos.some((p) => p.proveedorId === id) || state.compras.some((c) => c.proveedorId === id)) {
    return fail('No se puede eliminar: tiene productos o compras asociadas. Puedes marcarlo como "Descartado".');
  }
  commit((s) => { s.proveedores = s.proveedores.filter((p) => p.id !== id); });
  return done();
}

// ---------------------------------------------------------------------------
// Finanzas: transacciones
// ---------------------------------------------------------------------------
export function cashSign(t) {
  if (t.tipo === 'Ingreso' || t.tipo === 'Aporte de capital') return 1;
  if (t.tipo === 'Otro') return t.sentido === 'Salida' ? -1 : 1;
  return -1; // Egreso, Devolución de dinero, Pago de préstamo
}

export function saveTransaccion(values, id = null) {
  const monto = toNum(values.monto);
  if (!(monto > 0)) return fail('El monto debe ser mayor que cero.');
  const tasa = values.moneda === 'VES' ? toNum(values.tasa) : 1;
  if (values.moneda === 'VES' && !(tasa > 0)) return fail('Indica la tasa de cambio (Bs. por USD).');
  if (values.tipo === 'Egreso' && !values.gasto) return fail('Elige el tipo de gasto.');
  const v = {
    fecha: values.fecha || today(), tipo: values.tipo, gasto: values.tipo === 'Egreso' ? values.gasto : '',
    metodoPago: values.metodoPago, moneda: values.moneda, monto, tasa, montoUSD: round2(values.moneda === 'VES' ? monto / tasa : monto),
    concepto: String(values.concepto || '').trim(), sentido: values.tipo === 'Otro' ? values.sentido || 'Entrada' : '', ref: values.ref || null,
  };
  commit((s) => {
    if (id) {
      const i = s.transacciones.findIndex((t) => t.id === id);
      s.transacciones[i] = { ...s.transacciones[i], ...v };
    } else s.transacciones.push({ id: uid(), ...v, createdAt: stamp() });
  });
  return done();
}
export function deleteTransaccion(id) {
  commit((s) => { s.transacciones = s.transacciones.filter((t) => t.id !== id); });
  return done();
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------
export const compraTotal = (c) => round2(c.lineas.reduce((a, l) => a + l.cantidad * l.costo, 0));
export const compraPagado = (c, s = state) => round2(s.transacciones.filter((t) => t.ref?.tipo === 'compra' && t.ref.id === c.id).reduce((a, t) => a + (t.tipo === 'Egreso' ? t.montoUSD : -t.montoUSD), 0));
export const compraRecibida = (c) => c.lineas.some((l) => l.recibido > 0);

function cleanLines(lineas, priceKey) {
  return (lineas || [])
    .map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad) || 0, [priceKey]: Number(l[priceKey]) || 0, ...(l.recibido !== undefined ? { recibido: l.recibido } : {}) }))
    .filter((l) => l.productoId && l.cantidad > 0);
}

export function saveCompra(values, id = null) {
  if (!values.proveedorId) return fail('Elige el proveedor.');
  const existing = id ? state.compras.find((c) => c.id === id) : null;
  const locked = existing && compraRecibida(existing);
  const lineas = locked ? existing.lineas : cleanLines(values.lineas, 'costo').map((l) => ({ ...l, recibido: 0 }));
  if (!lineas.length) return fail('Agrega al menos un producto con cantidad.');
  if (new Set(lineas.map((l) => l.productoId)).size !== lineas.length) return fail('Hay un producto repetido. Suma las cantidades en una sola línea.');
  let newId = id;
  commit((s) => {
    const base = { fecha: values.fecha || today(), proveedorId: values.proveedorId, metodoPago: values.metodoPago, nota: values.nota || '', lineas };
    if (id) {
      const i = s.compras.findIndex((c) => c.id === id);
      s.compras[i] = { ...s.compras[i], ...base, estado: locked ? s.compras[i].estado : values.estado, updatedAt: stamp() };
    } else {
      newId = uid();
      s.compras.push({ id: newId, codigo: nextCode('CMP', s.compras), estado: values.estado || 'Planificada', ...base, createdAt: stamp(), updatedAt: stamp() });
    }
  });
  return done({ id: newId });
}

export function setEstadoCompra(id, estado) {
  const c = state.compras.find((x) => x.id === id);
  if (!c) return fail('Compra no encontrada.');
  if (compraRecibida(c)) return fail('Esta compra ya tiene mercancía recibida; su estado se actualiza solo.');
  commit((s) => { const x = s.compras.find((k) => k.id === id); x.estado = estado; x.updatedAt = stamp(); });
  return done();
}

/** `recibidoNuevo`: { productoId: cantidad que llega ahora }. Genera las entradas de inventario. */
export function recibirCompra(id, recibidoNuevo, fecha = today()) {
  const c = state.compras.find((x) => x.id === id);
  if (!c) return fail('Compra no encontrada.');
  if (c.estado === 'Cancelada') return fail('La compra está cancelada.');
  let any = false;
  for (const l of c.lineas) {
    const n = Number(recibidoNuevo[l.productoId]) || 0;
    if (n < 0) return fail('Las cantidades no pueden ser negativas.');
    if (l.recibido + n > l.cantidad) return fail(`Estás recibiendo más de lo pedido en ${productLabel(l.productoId)}.`);
    if (n > 0) any = true;
  }
  if (!any) return fail('Indica cuántas unidades llegaron.');
  commit((s) => {
    const x = s.compras.find((k) => k.id === id);
    for (const l of x.lineas) {
      const n = Number(recibidoNuevo[l.productoId]) || 0;
      if (n > 0) {
        l.recibido += n;
        s.movimientos.push({ id: uid(), fecha, tipo: 'Entrada por compra', productoId: l.productoId, cantidad: n, costoUnit: l.costo, motivo: '', nota: '', ref: { tipo: 'compra', id: x.id, codigo: x.codigo }, createdAt: stamp() });
        // Actualiza el costo de adquisición del catálogo con el último costo real pagado.
        const p = s.productos.find((k) => k.id === l.productoId);
        if (p && l.costo > 0) p.costo = l.costo;
      }
    }
    x.estado = x.lineas.every((l) => l.recibido >= l.cantidad) ? 'Recibida completa' : 'Recibida parcialmente';
    x.updatedAt = stamp();
  });
  return done();
}

export function deleteCompra(id) {
  const c = state.compras.find((x) => x.id === id);
  if (!c) return fail('No encontrada.');
  if (compraRecibida(c)) return fail('Tiene mercancía recibida. Para corregirla usa un ajuste de inventario.');
  if (state.transacciones.some((t) => t.ref?.tipo === 'compra' && t.ref.id === id)) return fail('Tiene pagos registrados. Elimina primero esos pagos en Finanzas.');
  commit((s) => { s.compras = s.compras.filter((x) => x.id !== id); });
  return done();
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------
export const pedidoSubtotal = (o) => round2(o.lineas.reduce((a, l) => a + l.cantidad * l.precio, 0));
export const pedidoTotal = (o) => round2(pedidoSubtotal(o) - (Number(o.descuento) || 0) + (Number(o.envio) || 0));
export const pedidoCobrado = (o, s = state) => round2(s.transacciones.filter((t) => t.ref?.tipo === 'pedido' && t.ref.id === o.id).reduce((a, t) => a + (t.tipo === 'Ingreso' ? t.montoUSD : -t.montoUSD), 0));
export const PEDIDO_FLUJO = ['Pendiente de confirmación', 'Confirmado', 'Preparando pedido', 'Listo para despacho', 'En entrega', 'Entregado'];
export const PEDIDO_SIGUIENTE = {
  'Pendiente de confirmación': 'Confirmado',
  'Confirmado': 'Preparando pedido',
  'Pendiente de compra': 'Preparando pedido',
  'Preparando pedido': 'Listo para despacho',
  'Listo para despacho': 'En entrega',
  'En entrega': 'Entregado',
};
const DESCUENTAN = ['Preparando pedido', 'Listo para despacho', 'En entrega', 'Entregado'];
const NO_DESCUENTAN = ['Pendiente de confirmación', 'Confirmado', 'Pendiente de compra', 'Cancelado'];
export const PEDIDO_ACTIVO = (e) => !['Entregado', 'Cancelado'].includes(e);

export function savePedido(values, id = null) {
  if (!String(values.cliente || '').trim()) return fail('Escribe el nombre del cliente.');
  const existing = id ? state.pedidos.find((o) => o.id === id) : null;
  const locked = existing?.stockDescontado;
  const lineas = locked ? existing.lineas : cleanLines(values.lineas, 'precio');
  if (!lineas.length) return fail('Agrega al menos un producto con cantidad.');
  if (new Set(lineas.map((l) => l.productoId)).size !== lineas.length) return fail('Hay un producto repetido. Suma las cantidades en una sola línea.');
  const descuento = toNum(values.descuento) || 0;
  const envio = toNum(values.envio) || 0;
  if (descuento < 0 || envio < 0) return fail('Descuento y envío no pueden ser negativos.');
  let newId = id;
  commit((s) => {
    const base = {
      fecha: values.fecha || today(), cliente: String(values.cliente).trim(), telefono: values.telefono || '', canal: values.canal, metodoPago: values.metodoPago,
      direccion: values.direccion || '', descuento, envio, nota: values.nota || '', lineas,
    };
    if (id) {
      const i = s.pedidos.findIndex((o) => o.id === id);
      s.pedidos[i] = { ...s.pedidos[i], ...base, updatedAt: stamp() };
    } else {
      newId = uid();
      s.pedidos.push({ id: newId, codigo: nextCode('PED', s.pedidos), estado: 'Pendiente de confirmación', stockDescontado: false, ...base, createdAt: stamp(), updatedAt: stamp() });
    }
  });
  return done({ id: newId });
}

export function setEstadoPedido(id, estado) {
  const o = state.pedidos.find((x) => x.id === id);
  if (!o) return fail('Pedido no encontrado.');
  if (o.estado === estado) return done();
  if (DESCUENTAN.includes(estado) && !o.stockDescontado) {
    const faltan = o.lineas.filter((l) => stockOf(l.productoId) < l.cantidad)
      .map((l) => `${productById(l.productoId)?.nombre || 'Producto'}: hay ${stockOf(l.productoId)}, faltan ${l.cantidad - stockOf(l.productoId)}`);
    if (faltan.length) return fail(`No hay stock suficiente para preparar este pedido. ${faltan.join('; ')}. Márcalo como "Pendiente de compra" y registra la compra.`);
  }
  commit((s) => {
    const x = s.pedidos.find((k) => k.id === id);
    if (DESCUENTAN.includes(estado) && !x.stockDescontado) {
      for (const l of x.lineas) {
        const p = s.productos.find((k) => k.id === l.productoId);
        s.movimientos.push({ id: uid(), fecha: today(), tipo: 'Salida por venta', productoId: l.productoId, cantidad: l.cantidad, costoUnit: p?.costo ?? 0, motivo: '', nota: '', ref: { tipo: 'pedido', id: x.id, codigo: x.codigo }, createdAt: stamp() });
      }
      x.stockDescontado = true;
      x.fechaVenta = today();
    } else if (NO_DESCUENTAN.includes(estado) && x.stockDescontado) {
      for (const l of x.lineas) {
        const p = s.productos.find((k) => k.id === l.productoId);
        s.movimientos.push({ id: uid(), fecha: today(), tipo: 'Devolución recibida', productoId: l.productoId, cantidad: l.cantidad, costoUnit: p?.costo ?? 0, motivo: 'Devolución', nota: `Reverso de ${x.codigo} (${estado})`, ref: { tipo: 'pedido', id: x.id, codigo: x.codigo }, createdAt: stamp() });
      }
      x.stockDescontado = false;
      x.fechaVenta = '';
    }
    x.estado = estado;
    x.updatedAt = stamp();
  });
  return done();
}

export function deletePedido(id) {
  const o = state.pedidos.find((x) => x.id === id);
  if (!o) return fail('No encontrado.');
  if (o.stockDescontado) return fail('Ya descontó inventario. Cámbialo a "Cancelado" para devolver el stock.');
  if (state.transacciones.some((t) => t.ref?.tipo === 'pedido' && t.ref.id === id)) return fail('Tiene cobros registrados. Elimina primero esos cobros en Finanzas.');
  commit((s) => { s.pedidos = s.pedidos.filter((x) => x.id !== id); });
  return done();
}

// ---------------------------------------------------------------------------
// Resumen financiero
// ---------------------------------------------------------------------------
const inPeriod = (fecha, ym) => !ym || String(fecha).startsWith(ym);

export function resumenFinanzas(ym = '', s = state) {
  const tx = s.transacciones.filter((t) => inPeriod(t.fecha, ym));
  const sum = (arr) => round2(arr.reduce((a, t) => a + t.montoUSD, 0));
  // Ventas: se reconocen cuando el pedido sale del inventario (aunque aún no esté cobrado),
  // para que el costo de lo vendido y la venta caigan en el mismo período.
  const pedidoPorId = new Map(s.pedidos.map((o) => [o.id, o]));
  const ventasPedidos = round2(s.pedidos
    .filter((o) => o.stockDescontado && inPeriod(o.fechaVenta || o.fecha, ym))
    .reduce((a, o) => a + pedidoTotal(o), 0));
  const cobros = sum(tx.filter((t) => t.tipo === 'Ingreso'));
  const otrosIngresos = sum(tx.filter((t) => t.tipo === 'Ingreso' && t.ref?.tipo !== 'pedido'));
  // Un reembolso de un pedido cancelado no resta ventas: el pedido ya dejó de contarse.
  const devoluciones = sum(tx.filter((t) => t.tipo === 'Devolución de dinero' && (t.ref?.tipo !== 'pedido' || pedidoPorId.get(t.ref.id)?.stockDescontado)));
  const ingresos = round2(ventasPedidos + otrosIngresos);
  const ventasNetas = round2(ingresos - devoluciones);

  let costoVentas = 0;
  let mermas = 0;
  for (const m of s.movimientos) {
    if (!inPeriod(m.fecha, ym)) continue;
    const c = m.cantidad * (m.costoUnit || 0);
    if (m.tipo === 'Salida por venta') costoVentas += c;
    else if (m.tipo === 'Devolución recibida') costoVentas -= c;
    else if (m.tipo === 'Salida por pérdida' || m.tipo === 'Ajuste negativo') mermas += c;
  }
  costoVentas = round2(costoVentas);
  mermas = round2(mermas);
  const utilidadBruta = round2(ventasNetas - costoVentas);

  const gastosPorTipo = {};
  for (const t of tx) if (t.tipo === 'Egreso' && t.gasto !== 'Compra de productos') gastosPorTipo[t.gasto] = round2((gastosPorTipo[t.gasto] || 0) + t.montoUSD);
  const gastosOperativos = round2(Object.values(gastosPorTipo).reduce((a, b) => a + b, 0));
  const utilidadNeta = round2(utilidadBruta - mermas - gastosOperativos);

  const comprasProductos = sum(tx.filter((t) => t.tipo === 'Egreso' && t.gasto === 'Compra de productos'));
  const aportes = sum(tx.filter((t) => t.tipo === 'Aporte de capital'));
  const prestamos = sum(tx.filter((t) => t.tipo === 'Pago de préstamo'));
  const entradas = round2(tx.filter((t) => cashSign(t) > 0).reduce((a, t) => a + t.montoUSD, 0));
  const salidas = round2(tx.filter((t) => cashSign(t) < 0).reduce((a, t) => a + t.montoUSD, 0));

  // Saldos de caja (siempre históricos)
  const porMetodo = {};
  let saldoCaja = 0;
  for (const t of s.transacciones) {
    const v = cashSign(t) * t.montoUSD;
    saldoCaja += v;
    porMetodo[t.metodoPago] = round2((porMetodo[t.metodoPago] || 0) + v);
  }
  return { ingresos, ventasPedidos, otrosIngresos, cobros, devoluciones, ventasNetas, costoVentas, mermas, utilidadBruta, gastosPorTipo, gastosOperativos, utilidadNeta, comprasProductos, aportes, prestamos, entradas, salidas, flujoNeto: round2(entradas - salidas), saldoCaja: round2(saldoCaja), porMetodo };
}

export function porCobrar(s = state) {
  return s.pedidos
    .filter((o) => o.estado !== 'Cancelado')
    .map((o) => ({ o, saldo: round2(pedidoTotal(o) - pedidoCobrado(o, s)) }))
    .filter((x) => x.saldo > 0.009);
}
export function porPagar(s = state) {
  return s.compras
    .filter((c) => c.estado !== 'Cancelada')
    .map((c) => ({ c, saldo: round2(compraTotal(c) - compraPagado(c, s)) }))
    .filter((x) => x.saldo > 0.009);
}

export function inventarioValor(s = state) {
  const rows = enrichProducts(s);
  let costo = 0; let venta = 0; let unidades = 0;
  const porCategoria = {};
  for (const p of rows) {
    if (p.stock <= 0) continue;
    const c = p.stock * (p.costo || 0);
    costo += c; venta += p.stock * (p.precio || 0); unidades += p.stock;
    porCategoria[p.categoria || 'Sin categoría'] = (porCategoria[p.categoria || 'Sin categoría'] || 0) + c;
  }
  return { costo: round2(costo), venta: round2(venta), unidades, porCategoria };
}

// ---------------------------------------------------------------------------
// Datos: demo, borrado, respaldo e importación
// ---------------------------------------------------------------------------
export function setTasa(tasa) {
  const n = toNum(tasa);
  if (!(n > 0)) return fail('Escribe una tasa válida (Bs. por 1 USD).');
  commit((s) => { s.meta.tasa = n; s.meta.tasaFecha = today(); });
  return done();
}
export function setNegocio(nombre) {
  commit((s) => { s.meta.negocio = String(nombre || '').trim() || 'VALORA'; });
}
export function loadDemo() { replaceState(demoData(state.productos.length || state.compras.length ? emptyState() : state)); }
export function resetAll() { replaceState(emptyState()); }
export const exportJSON = () => JSON.stringify(state, null, 2);
export function importJSON(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return fail('El archivo no es un respaldo válido (JSON).'); }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.productos)) return fail('El archivo no parece un respaldo de VALORA.');
  replaceState(obj);
  return done();
}

/** Importa filas ya normalizadas desde el Excel. Devuelve cuántas se crearon/omitieron. */
export function importProductos(rows) {
  let creados = 0; let omitidos = 0;
  commit((s) => {
    const provByName = new Map(s.proveedores.map((p) => [norm(p.nombre), p.id]));
    const skus = new Set(s.productos.map((p) => norm(p.sku)));
    for (const r of rows) {
      if (!String(r.nombre || '').trim()) { omitidos++; continue; }
      const sku = String(r.sku || '').trim().toUpperCase();
      if (sku && skus.has(norm(sku))) { omitidos++; continue; }
      if (sku) skus.add(norm(sku));
      const id = uid();
      s.productos.push({
        id, sku, categoria: r.categoria || '', marca: r.marca || '', nombre: String(r.nombre).trim(), tipo: r.tipo || '', variante: r.variante || '', presentacion: r.presentacion || '',
        unidad: 'Unidad', proveedorId: provByName.get(norm(r.proveedor)) || '', fuente: r.fuente || '', costo: toNum(r.costo), precio: toNum(r.precio),
        estadoVerif: r.estadoVerif || 'Pendiente', estadoComercial: r.estadoComercial || 'En evaluación', fechaVerif: r.fechaVerif || '', obs: r.obs || '',
        stockMin: toNum(r.stockMin), createdAt: stamp(), updatedAt: stamp(),
      });
      const qty = toNum(r.stockActual);
      if (qty > 0) s.movimientos.push({ id: uid(), fecha: today(), tipo: 'Ajuste positivo', productoId: id, cantidad: qty, costoUnit: toNum(r.costo) ?? 0, motivo: 'Otro motivo', nota: 'Stock inicial (importado del Excel)', ref: null, createdAt: stamp() });
      creados++;
    }
  });
  return done({ creados, omitidos });
}

export function importProveedores(rows) {
  let creados = 0; let omitidos = 0;
  commit((s) => {
    const names = new Set(s.proveedores.map((p) => norm(p.nombre)));
    for (const r of rows) {
      const nombre = String(r.nombre || '').trim();
      if (!nombre || names.has(norm(nombre))) { omitidos++; continue; }
      names.add(norm(nombre));
      s.proveedores.push({
        id: uid(), codigo: nextCode('PRV', s.proveedores), nombre, razon: r.razon || '', tipo: r.tipo || '', contacto: r.contacto || '', telefono: String(r.telefono || ''), correo: r.correo || '',
        web: r.web || '', ubicacion: r.ubicacion || '', cobertura: r.cobertura || '', categorias: String(r.categorias || '').split(/[,;/]/).map((x) => x.trim()).filter(Boolean),
        monedaCompra: r.monedaCompra || 'USD', pedidoMin: toNum(r.pedidoMin) ?? '', tiempoRepo: r.tiempoRepo || '', condPago: r.condPago || '', politicaCambios: r.politicaCambios || '',
        fuenteInfo: r.fuenteInfo || '', estadoEval: r.estadoEval || 'Por evaluar', fechaEval: r.fechaEval || '', obs: r.obs || '', createdAt: stamp(), updatedAt: stamp(),
      });
      creados++;
    }
  });
  return done({ creados, omitidos });
}
