// Listas base (hoja "Listas" del Excel) y datos de ejemplo.
import { uid, today, addMonths, thisMonth } from './utils.js';

/** Listas del Excel. `locked: true` = las reglas automáticas dependen de esos valores. */
export const LIST_DEFS = [
  { key: 'categorias', label: 'Categorías', locked: false, values: ['Beauty', 'Skin', 'Hair', 'Body', 'Nails', 'Angelus'] },
  { key: 'estadosVerificacion', label: 'Estados de verificación', locked: true, values: ['Pendiente', 'En revisión', 'Verificado', 'Descartado'] },
  { key: 'estadosComerciales', label: 'Estados comerciales', locked: true, values: ['En evaluación', 'Aprobado para catálogo', 'Disponible en stock', 'Disponible por encargo', 'Agotado', 'Descontinuado'] },
  { key: 'tiposMovimiento', label: 'Tipos de movimiento', locked: true, values: ['Entrada por compra', 'Salida por venta', 'Ajuste positivo', 'Ajuste negativo', 'Devolución recibida', 'Salida por pérdida'] },
  { key: 'metodosPago', label: 'Métodos de pago', locked: false, values: ['Efectivo', 'Transferencia', 'Pago móvil', 'Tarjeta', 'Zelle', 'Binance'] },
  { key: 'estadosCompra', label: 'Estados de compra', locked: true, values: ['Planificada', 'Solicitada', 'Recibida parcialmente', 'Recibida completa', 'Cancelada'] },
  { key: 'estadosPedido', label: 'Estados de pedido', locked: true, values: ['Pendiente de confirmación', 'Confirmado', 'Pendiente de compra', 'Preparando pedido', 'Listo para despacho', 'En entrega', 'Entregado', 'Cancelado', 'Incidencia'] },
  { key: 'tiposTransaccion', label: 'Tipos de transacción', locked: true, values: ['Ingreso', 'Egreso', 'Aporte de capital', 'Devolución de dinero', 'Pago de préstamo', 'Otro'] },
  { key: 'estadosProveedor', label: 'Estados de proveedor', locked: true, values: ['Por evaluar', 'En evaluación', 'Aprobado', 'Suspendido', 'Descartado'] },
  { key: 'unidades', label: 'Unidades de medida', locked: false, values: ['Unidad', 'Pieza', 'Paquete', 'Set', 'Kit'] },
  { key: 'monedas', label: 'Monedas', locked: true, values: ['USD', 'VES'] },
  { key: 'tiposGasto', label: 'Tipos de gasto', locked: false, protect: ['Compra de productos'], values: ['Compra de productos', 'Embalaje', 'Transporte', 'Marketing', 'Comisiones', 'Servicios', 'Otros gastos'] },
  { key: 'motivosAjuste', label: 'Motivos de ajuste', locked: false, values: ['Corrección de conteo', 'Producto dañado', 'Pérdida', 'Devolución', 'Otro motivo'] },
  { key: 'canales', label: 'Canales de venta', locked: false, values: ['Instagram', 'TikTok', 'WhatsApp', 'Otro canal'] },
  { key: 'tiposProveedor', label: 'Tipos de proveedor', locked: false, values: ['Marca o fabricante', 'Distribuidor', 'Mayorista', 'Proveedor de embalaje', 'Servicio de entrega', 'Artesanal', 'Otro'] },
];

export function defaultLists() {
  return Object.fromEntries(LIST_DEFS.map((d) => [d.key, [...d.values]]));
}

export function emptyState() {
  return {
    version: 1,
    meta: { negocio: 'VALORA', tasa: 0, tasaFecha: '', demo: false },
    lists: defaultLists(),
    productos: [],
    proveedores: [],
    movimientos: [],
    compras: [],
    pedidos: [],
    transacciones: [],
  };
}

const stamp = () => new Date().toISOString();
const dayAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Datos de ejemplo para explorar el sistema. Se pueden borrar desde Configuración. */
export function demoData(base) {
  const s = JSON.parse(JSON.stringify(base));
  const t = stamp();
  s.meta.tasa = 38.5;
  s.meta.tasaFecha = today();
  s.meta.demo = true;

  const prov = (codigo, nombre, tipo, cats, extra = {}) => ({
    id: uid(), codigo, nombre, razon: extra.razon || '', tipo, contacto: extra.contacto || '', telefono: extra.telefono || '',
    correo: extra.correo || '', web: extra.web || '', ubicacion: extra.ubicacion || '', cobertura: extra.cobertura || '',
    categorias: cats, monedaCompra: 'USD', pedidoMin: extra.pedidoMin ?? '', tiempoRepo: extra.tiempoRepo || '',
    condPago: extra.condPago || '', politicaCambios: extra.politicaCambios || '', fuenteInfo: extra.fuenteInfo || 'Instagram',
    estadoEval: extra.estadoEval || 'Aprobado', fechaEval: dayAgo(40), obs: extra.obs || '', createdAt: t, updatedAt: t,
  });
  const p1 = prov('PRV-0001', 'Angelus Direct', 'Marca o fabricante', ['Angelus', 'Nails'], { contacto: 'Equipo mayorista', web: 'angeluspaint.com', ubicacion: 'California, EE. UU.', cobertura: 'Envío internacional', pedidoMin: 150, tiempoRepo: '10 a 14 días', condPago: 'Pago anticipado', politicaCambios: 'Solo por defecto de fábrica' });
  const p2 = prov('PRV-0002', 'Distribuidora Glow', 'Distribuidor', ['Skin', 'Beauty', 'Body'], { contacto: 'Mariana R.', telefono: '+58 414 000 0000', ubicacion: 'Valencia, Carabobo', cobertura: 'Carabobo y Caracas', pedidoMin: 60, tiempoRepo: '3 días', condPago: 'Pago al recibir', politicaCambios: 'Cambios en 7 días' });
  const p3 = prov('PRV-0003', 'Hair Lab Mayorista', 'Mayorista', ['Hair'], { contacto: 'Luis P.', ubicacion: 'Caracas', cobertura: 'Nacional', pedidoMin: 100, tiempoRepo: '5 días', condPago: '50% anticipo', estadoEval: 'En evaluación' });
  s.proveedores.push(p1, p2, p3);

  const prod = (sku, categoria, marca, nombre, tipo, variante, presentacion, prov, costo, precio, verif, comercial, min) => ({
    id: uid(), sku, categoria, marca, nombre, tipo, variante, presentacion, unidad: 'Unidad', proveedorId: prov.id,
    fuente: 'Web oficial', costo, precio, estadoVerif: verif, estadoComercial: comercial, fechaVerif: dayAgo(12),
    obs: '', stockMin: min, createdAt: t, updatedAt: t,
  });
  const A = [
    prod('ANG-0001', 'Angelus', 'Angelus', 'Pintura acrílica para uñas', 'Esmalte', 'Blanco puro', '29,5 ml', p1, 4.2, 9.5, 'Verificado', 'Disponible en stock', 6),
    prod('ANG-0002', 'Angelus', 'Angelus', 'Pintura acrílica para uñas', 'Esmalte', 'Rosa pastel', '29,5 ml', p1, 4.2, 9.5, 'Verificado', 'Disponible en stock', 6),
    prod('NAI-0001', 'Nails', 'Valora', 'Lima profesional 180/240', 'Accesorio', '', 'Pack x5', p2, 1.8, 4.5, 'Verificado', 'Disponible en stock', 10),
    prod('SKI-0001', 'Skin', 'Cerave', 'Limpiador hidratante', 'Limpieza facial', 'Piel normal a seca', '236 ml', p2, 9.8, 18, 'Verificado', 'Disponible en stock', 4),
    prod('SKI-0002', 'Skin', 'La Roche-Posay', 'Protector solar FPS 50', 'Protector solar', 'Toque seco', '50 ml', p2, 14.5, 26, 'En revisión', 'Aprobado para catálogo', 3),
    prod('HAI-0001', 'Hair', 'Olaplex', 'Tratamiento reparador N°3', 'Tratamiento', '', '100 ml', p3, 18, 32, 'Pendiente', 'En evaluación', 2),
    prod('BOD-0001', 'Body', 'Valora', 'Crema corporal de vainilla', 'Crema corporal', 'Vainilla', '250 ml', p2, 5.5, 12, 'Verificado', 'Disponible por encargo', ''),
    prod('BEA-0001', 'Beauty', 'Essence', 'Máscara de pestañas', 'Maquillaje', 'Negro', '12 ml', p2, 3.2, 3, 'Verificado', 'Descontinuado', 0),
  ];
  s.productos.push(...A);

  const mov = (fecha, tipo, producto, cantidad, costoUnit, extra = {}) => ({
    id: uid(), fecha, tipo, productoId: producto.id, cantidad, costoUnit, motivo: extra.motivo || '', nota: extra.nota || '',
    ref: extra.ref || null, createdAt: t,
  });

  // Compras
  const compra = (codigo, fecha, prov, lineas, estado, extra = {}) => ({
    id: uid(), codigo, fecha, proveedorId: prov.id, estado, metodoPago: extra.metodoPago || 'Zelle', nota: extra.nota || '',
    lineas: lineas.map(([p, cantidad, costo, recibido]) => ({ productoId: p.id, cantidad, costo, recibido })),
    createdAt: t, updatedAt: t,
  });
  const c1 = compra('CMP-0001', dayAgo(34), p1, [[A[0], 12, 4.2, 12], [A[1], 12, 4.2, 12]], 'Recibida completa');
  const c2 = compra('CMP-0002', dayAgo(25), p2, [[A[2], 30, 1.8, 30], [A[3], 10, 9.8, 10], [A[4], 6, 14.5, 6], [A[6], 8, 5.5, 8]], 'Recibida completa', { metodoPago: 'Transferencia' });
  const c3 = compra('CMP-0003', dayAgo(3), p3, [[A[5], 6, 18, 0]], 'Solicitada', { metodoPago: 'Zelle' });
  s.compras.push(c1, c2, c3);

  c1.lineas.forEach((l) => s.movimientos.push(mov(c1.fecha, 'Entrada por compra', A.find((x) => x.id === l.productoId), l.recibido, l.costo, { ref: { tipo: 'compra', id: c1.id, codigo: c1.codigo } })));
  c2.lineas.forEach((l) => s.movimientos.push(mov(c2.fecha, 'Entrada por compra', A.find((x) => x.id === l.productoId), l.recibido, l.costo, { ref: { tipo: 'compra', id: c2.id, codigo: c2.codigo } })));

  // Transacciones
  const tx = (fecha, tipo, monto, concepto, extra = {}) => ({
    id: uid(), fecha, tipo, gasto: extra.gasto || '', metodoPago: extra.metodoPago || 'Zelle', moneda: extra.moneda || 'USD',
    monto, tasa: extra.moneda === 'VES' ? s.meta.tasa : 1, montoUSD: extra.moneda === 'VES' ? Math.round((monto / s.meta.tasa) * 100) / 100 : monto,
    concepto, sentido: extra.sentido || '', ref: extra.ref || null, createdAt: t,
  });
  s.transacciones.push(
    tx(dayAgo(40), 'Aporte de capital', 600, 'Capital inicial del negocio', { metodoPago: 'Transferencia' }),
    tx(dayAgo(34), 'Egreso', 100.8, 'Pago compra CMP-0001', { gasto: 'Compra de productos', ref: { tipo: 'compra', id: c1.id, codigo: c1.codigo } }),
    tx(dayAgo(25), 'Egreso', 54 + 98 + 87 + 44, 'Pago compra CMP-0002', { gasto: 'Compra de productos', metodoPago: 'Transferencia', ref: { tipo: 'compra', id: c2.id, codigo: c2.codigo } }),
    tx(dayAgo(22), 'Egreso', 18, 'Bolsas y cajas de empaque', { gasto: 'Embalaje', metodoPago: 'Efectivo' }),
    tx(dayAgo(15), 'Egreso', 12, 'Publicidad en Instagram', { gasto: 'Marketing' }),
    tx(dayAgo(9), 'Egreso', 20, 'Delivery de pedidos', { gasto: 'Transporte', metodoPago: 'Efectivo' }),
  );

  // Pedidos
  const pedido = (codigo, fecha, cliente, canal, lineas, estado, extra = {}) => ({
    id: uid(), codigo, fecha, cliente, telefono: extra.telefono || '', canal, estado, metodoPago: extra.metodoPago || 'Pago móvil',
    direccion: extra.direccion || '', descuento: extra.descuento || 0, envio: extra.envio || 0, nota: extra.nota || '',
    lineas: lineas.map(([p, cantidad, precio]) => ({ productoId: p.id, cantidad, precio })),
    stockDescontado: !!extra.stockDescontado, fechaVenta: extra.stockDescontado ? fecha : '', createdAt: t, updatedAt: t,
  });
  const o1 = pedido('PED-0001', dayAgo(18), 'Andrea Gómez', 'Instagram', [[A[0], 2, 9.5], [A[2], 1, 4.5]], 'Entregado', { stockDescontado: true, envio: 2, metodoPago: 'Zelle' });
  const o2 = pedido('PED-0002', dayAgo(10), 'Valentina Ruiz', 'WhatsApp', [[A[3], 1, 18], [A[6], 1, 12]], 'Entregado', { stockDescontado: true, envio: 3, metodoPago: 'Pago móvil' });
  const o3 = pedido('PED-0003', dayAgo(4), 'Carla Méndez', 'TikTok', [[A[1], 3, 9.5], [A[4], 1, 26]], 'En entrega', { stockDescontado: true, envio: 2, metodoPago: 'Zelle' });
  const o4 = pedido('PED-0004', dayAgo(1), 'Daniela Pérez', 'Instagram', [[A[3], 2, 18]], 'Confirmado', { metodoPago: 'Transferencia' });
  s.pedidos.push(o1, o2, o3, o4);
  [o1, o2, o3].forEach((o) => o.lineas.forEach((l) => {
    const p = A.find((x) => x.id === l.productoId);
    s.movimientos.push(mov(o.fecha, 'Salida por venta', p, l.cantidad, p.costo, { ref: { tipo: 'pedido', id: o.id, codigo: o.codigo } }));
  }));
  const tot = (o) => o.lineas.reduce((a, l) => a + l.cantidad * l.precio, 0) - o.descuento + o.envio;
  s.transacciones.push(
    tx(dayAgo(18), 'Ingreso', tot(o1), 'Cobro pedido PED-0001', { ref: { tipo: 'pedido', id: o1.id, codigo: o1.codigo } }),
    tx(dayAgo(10), 'Ingreso', Math.round(tot(o2) * s.meta.tasa * 100) / 100, 'Cobro pedido PED-0002', { moneda: 'VES', metodoPago: 'Pago móvil', ref: { tipo: 'pedido', id: o2.id, codigo: o2.codigo } }),
    tx(dayAgo(4), 'Ingreso', 30, 'Anticipo pedido PED-0003', { ref: { tipo: 'pedido', id: o3.id, codigo: o3.codigo } }),
  );

  s.movimientos.push(mov(dayAgo(7), 'Ajuste negativo', A[2], 1, A[2].costo, { motivo: 'Producto dañado', nota: 'Empaque roto' }));
  s.movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  void addMonths; void thisMonth;
  return s;
}
