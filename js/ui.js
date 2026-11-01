// Componentes de interfaz reutilizables: avisos, modales, formularios, tablas y gráficos.
import { h, svg, icon, norm, toCSV, downloadFile, money, int } from './utils.js';

// ---------------------------------------------------------------------------
// Píldoras de estado
// ---------------------------------------------------------------------------
const TONES = {
  mint: ['OK', 'Verificado', 'STOCK OK', 'Aprobado', 'Entregado', 'Recibida completa', 'Disponible en stock', 'Aprobado para catálogo', 'Ingreso', 'Aporte de capital'],
  sky: ['Confirmado', 'Solicitada', 'En entrega', 'Listo para despacho', 'Preparando pedido', 'POR ENCARGO', 'Disponible por encargo', 'En revisión', 'Recibida parcialmente'],
  butter: ['Pendiente', 'Pendiente de confirmación', 'Pendiente de compra', 'Planificada', 'Por evaluar', 'En evaluación', 'DEFINIR MÍNIMO', 'COMPLETAR COSTOS'],
  rose: ['REVISAR', 'REPONER', 'REVISAR PRECIO', 'SKU DUPLICADO', 'FICHA INCOMPLETA', 'Descartado', 'Cancelado', 'Cancelada', 'Incidencia', 'Agotado', 'Suspendido', 'Egreso', 'Devolución de dinero'],
  gray: ['Descontinuado', 'NO REPONER'],
};
export function toneOf(text) {
  for (const [tone, arr] of Object.entries(TONES)) if (arr.includes(text)) return tone;
  return 'lilac';
}
export function pill(text, tone) {
  if (!text) return h('span', { class: 'muted' }, '—');
  return h('span', { class: 'pill', 'data-tone': tone || toneOf(text) }, text);
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
let toastHost;
export function toast(message, type = 'ok') {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h('div', { class: `toast ${type}` }, message);
  toastHost.append(el);
  setTimeout(() => el.remove(), type === 'err' ? 6500 : 3200);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal({ title, subtitle, tone = 'lilac', size = '', body, footer = [], onClose }) {
  const previous = document.activeElement;
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onclick: () => close() }, icon('x'));
  const modal = h('div', { class: `modal ${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, 'data-tone': tone },
    h('div', { class: 'modal-head' }, h('div', null, h('h2', null, title), subtitle ? h('p', null, subtitle) : null), closeBtn),
    h('div', { class: 'modal-body' }, body),
    footer.length ? h('div', { class: 'modal-foot' }, footer) : null);
  const overlay = h('div', { class: 'overlay' }, modal);
  let down = false;
  overlay.addEventListener('mousedown', (e) => { down = e.target === overlay; });
  overlay.addEventListener('click', (e) => { if (down && e.target === overlay) close(); });

  const onKey = (e) => {
    if (e.key === 'Escape' && overlays[overlays.length - 1] === overlay) { e.stopPropagation(); close(); }
    if (e.key === 'Tab' && overlays[overlays.length - 1] === overlay) {
      const els = [...modal.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!els.length) return;
      const first = els[0]; const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  overlays.push(overlay);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  const firstField = modal.querySelector('.modal-body input:not([readonly]):not([type="hidden"]), .modal-body select, .modal-body textarea');
  (firstField || closeBtn).focus({ preventScroll: true });

  function close() {
    document.removeEventListener('keydown', onKey, true);
    overlays.splice(overlays.indexOf(overlay), 1);
    overlay.remove();
    if (!overlays.length) document.body.style.overflow = '';
    if (previous && previous.focus && document.contains(previous)) previous.focus({ preventScroll: true });
    onClose?.();
  }
  return { close, el: modal, overlay };
}
const overlays = [];

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (v) => { if (!answered) { answered = true; resolve(v); } };
    const m = openModal({
      title, size: 'narrow', tone: danger ? 'rose' : 'lilac',
      body: h('p', null, message),
      footer: [
        h('button', { class: 'btn soft', type: 'button', onclick: () => { finish(false); m.close(); } }, 'Cancelar'),
        h('button', { class: `btn ${danger ? 'danger' : ''}`, type: 'button', onclick: () => { finish(true); m.close(); } }, confirmLabel),
      ],
      onClose: () => finish(false),
    });
  });
}

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------
const optVal = (o) => (typeof o === 'object' ? o.value : o);
const optLabel = (o) => (typeof o === 'object' ? o.label : o);

/**
 * Formulario en modal.
 * fields: [{ name, label, type, options, required, help, span2, show(vals), compute(vals), build(vals) }]
 * onSubmit(vals) debe devolver { ok, error? }.
 */
export function openForm({ title, subtitle, tone, size = '', fields, values = {}, submitLabel = 'Guardar', successMessage, onSubmit, extraFooter = [] }) {
  const controls = {};
  const wrappers = [];
  const grid = h('div', { class: 'form-grid' });

  const read = () => {
    const out = {};
    for (const f of fields) if (f.name && controls[f.name]) out[f.name] = controls[f.name].get();
    return out;
  };
  const refresh = () => {
    const vals = read();
    for (const w of wrappers) {
      if (w.f.show) w.el.classList.toggle('hidden', !w.f.show(vals));
      if (w.f.compute) w.out.textContent = w.f.compute(vals);
      // Campos que se rellenan solos hasta que la persona los edita (p. ej. el SKU según la categoría).
      if (w.f.autofill && !w.dirty && controls[w.f.name]?.set) controls[w.f.name].set(w.f.autofill(vals) ?? '');
    }
  };

  for (const f of fields) {
    if (f.type === 'section') {
      const el = h('h3', { class: 'form-section' }, f.label);
      wrappers.push({ f, el });
      grid.append(el);
      continue;
    }
    const id = `f-${f.name}-${Math.random().toString(36).slice(2, 7)}`;
    let input; let ctl; let out;
    const init = values[f.name] ?? f.default ?? '';
    switch (f.type) {
      case 'select': {
        input = h('select', { id, name: f.name }, f.noBlank ? null : h('option', { value: '' }, f.placeholder || 'Selecciona…'),
          (f.options || []).map((o) => h('option', { value: optVal(o) }, optLabel(o))));
        input.value = init;
        if (input.value !== String(init)) input.value = '';
        ctl = { get: () => input.value, set: (v) => { input.value = v; } };
        break;
      }
      case 'textarea':
        input = h('textarea', { id, name: f.name, placeholder: f.placeholder }); input.value = init;
        ctl = { get: () => input.value };
        break;
      case 'multi': {
        const sel = new Set(Array.isArray(init) ? init : []);
        input = h('div', { class: 'chips', role: 'group', 'aria-labelledby': id },
          (f.options || []).map((o) => {
            const cb = h('input', { type: 'checkbox', value: optVal(o), checked: sel.has(optVal(o)) });
            return h('label', null, cb, optLabel(o));
          }));
        ctl = { get: () => [...input.querySelectorAll('input:checked')].map((x) => x.value) };
        break;
      }
      case 'computed':
        out = h('div', { class: 'computed', id });
        input = out;
        ctl = null;
        break;
      case 'custom': {
        const built = f.build(values);
        input = built.node;
        ctl = { get: built.get };
        built.onChange?.(refresh);
        break;
      }
      default: {
        const attrs = { id, name: f.name, type: f.type || 'text', placeholder: f.placeholder, autocomplete: 'off' };
        if (f.type === 'number') { attrs.step = f.step || 'any'; attrs.min = f.min ?? '0'; attrs.inputmode = 'decimal'; }
        input = h('input', attrs);
        input.value = init ?? '';
        if (f.readOnly) input.readOnly = true;
        ctl = { get: () => input.value, set: (v) => { input.value = v; } };
      }
    }
    if (ctl) controls[f.name] = ctl;
    const label = f.type === 'multi' || f.type === 'custom'
      ? h('span', { class: 'label', id }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null)
      : h('label', { for: id }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null);
    const err = h('div', { class: 'err hidden', role: 'alert' });
    const el = h('div', { class: `field ${f.span2 ? 'span2' : ''}` }, label, input, f.help ? h('div', { class: 'help' }, f.help) : null, err);
    const w = { f, el, out, err, dirty: !f.autofillStart && init !== '' && init !== null && init !== undefined };
    wrappers.push(w);
    grid.append(el);
    input.addEventListener?.('input', () => { w.dirty = true; });
    input.addEventListener?.('input', refresh);
    input.addEventListener?.('change', refresh);
  }

  const errBox = h('div', { class: 'notice hidden', role: 'alert', 'data-tone': 'rose', style: { marginTop: '14px' } });
  const formId = `form-${Math.random().toString(36).slice(2, 8)}`;
  // Botón invisible dentro del formulario para que Enter envíe; el visible está en el pie del modal y apunta al formulario con el atributo `form`.
  const form = h('form', { id: formId, novalidate: true }, grid, errBox, h('button', { type: 'submit', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' }, 'Guardar'));
  const submit = h('button', { class: 'btn', type: 'submit', form: formId }, submitLabel);
  const cancel = h('button', { class: 'btn soft', type: 'button', onclick: () => m.close() }, 'Cancelar');

  const m = openModal({ title, subtitle, tone, size, body: form, footer: [...extraFooter, cancel, submit] });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const vals = read();
    let bad = false;
    for (const w of wrappers) {
      if (!w.err) continue;
      w.el.classList.remove('invalid'); w.err.classList.add('hidden');
      const visible = !w.el.classList.contains('hidden');
      const v = vals[w.f.name];
      const empty = v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length);
      if (visible && w.f.required && empty) {
        w.el.classList.add('invalid'); w.err.textContent = 'Este campo es obligatorio.'; w.err.classList.remove('hidden');
        if (!bad) { (w.el.querySelector('input,select,textarea') || w.el).focus?.(); }
        bad = true;
      }
    }
    if (bad) return;
    submit.disabled = true;
    const res = (await onSubmit(vals)) || { ok: true };
    submit.disabled = false;
    if (res.ok === false) {
      errBox.textContent = res.error || 'No se pudo guardar.';
      errBox.classList.remove('hidden');
      errBox.scrollIntoView({ block: 'nearest' });
      return;
    }
    m.close();
    if (successMessage) toast(typeof successMessage === 'function' ? successMessage(res) : successMessage);
  });

  refresh();
  return m;
}

/**
 * Editor de líneas de producto (compras y pedidos).
 * priceKey: 'costo' | 'precio'. Devuelve { node, get, onChange }.
 */
export function lineEditor({ products, lines = [], priceKey, priceLabel, defaultPrice, stockOf, readOnly = false }) {
  const rows = [];
  const tbody = h('tbody');
  const totalEl = h('strong', { class: 'num' }, money(0));
  let changeCb = () => {};

  const productOptions = [...products].sort((a, b) => a.sku.localeCompare(b.sku));
  const recalc = () => {
    let total = 0;
    for (const r of rows) {
      const q = Number(r.qty.value) || 0; const p = Number(r.price.value) || 0;
      r.sub.textContent = money(q * p);
      total += q * p;
      if (stockOf && r.stock) {
        const s = r.select.value ? stockOf(r.select.value) : null;
        r.stock.textContent = s === null ? '' : `Stock: ${int(s)}`;
      }
    }
    totalEl.textContent = money(total);
    changeCb();
  };

  function addRow(line = {}) {
    const select = h('select', { 'aria-label': 'Producto', disabled: readOnly },
      h('option', { value: '' }, 'Elige un producto…'),
      productOptions.map((p) => h('option', { value: p.id }, `${p.sku} · ${p.nombre}${p.variante ? ' · ' + p.variante : ''}`)));
    select.value = line.productoId || '';
    const qty = h('input', { type: 'number', class: 'qty', min: '1', step: '1', inputmode: 'numeric', 'aria-label': 'Cantidad', value: line.cantidad ?? '', readOnly });
    const price = h('input', { type: 'number', class: 'money', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': priceLabel, value: line[priceKey] ?? '', readOnly });
    const sub = h('span', { class: 'sub-total num' }, money(0));
    const stock = stockOf ? h('div', { class: 'help' }) : null;
    const del = readOnly ? null : h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar línea', onclick: () => { rows.splice(rows.indexOf(r), 1); tr.remove(); recalc(); } }, icon('x'));
    const tr = h('tr', null, h('td', null, select, stock), h('td', null, qty), h('td', null, price), h('td', { class: 'right' }, sub), h('td', null, del));
    const r = { select, qty, price, sub, stock, tr };
    rows.push(r);
    tbody.append(tr);
    select.addEventListener('change', () => {
      const p = products.find((x) => x.id === select.value);
      if (p && !price.value) price.value = defaultPrice(p) ?? '';
      if (p && !qty.value) qty.value = 1;
      recalc();
    });
    qty.addEventListener('input', recalc);
    price.addEventListener('input', recalc);
  }

  (lines.length ? lines : [{}]).forEach(addRow);
  const node = h('div', null,
    h('div', { class: 'table-wrap' }, h('table', { class: 'lines' },
      h('thead', null, h('tr', null, h('th', null, 'Producto'), h('th', null, 'Cantidad'), h('th', null, priceLabel), h('th', { class: 'right' }, 'Subtotal'), h('th', null, h('span', { class: 'sr-only' }, 'Quitar')))),
      tbody)),
    readOnly ? null : h('button', { type: 'button', class: 'btn tint sm', style: { marginTop: '8px' }, onclick: () => { addRow({}); } }, icon('plus'), 'Agregar producto'),
    h('div', { class: 'totals' }, h('div', { class: 'total' }, h('span', null, 'Total de productos'), totalEl)));
  recalc();
  return {
    node,
    get: () => rows.map((r) => ({ productoId: r.select.value, cantidad: r.qty.value, [priceKey]: r.price.value })),
    onChange: (cb) => { changeCb = cb; },
  };
}

// ---------------------------------------------------------------------------
// Tabla de datos con búsqueda, filtros, orden y paginación
// ---------------------------------------------------------------------------
const tableStates = {};

export function dataTable({ id, columns, rows, searchText, filters = [], pageSize = 25, onRowClick, empty, extraTools = [], exportCfg, defaultSort }) {
  const st = (tableStates[id] ||= { q: '', page: 1, sort: defaultSort || null, filters: {} });
  const root = h('div', { class: 'panel' });
  const host = h('div');

  const tools = h('div', { class: 'toolbar' });
  if (searchText) {
    const input = h('input', { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar', value: st.q });
    input.addEventListener('input', () => { st.q = input.value; st.page = 1; draw(); });
    tools.append(h('div', { class: 'search' }, icon('search'), input));
  }
  for (const f of filters) {
    const opts = typeof f.options === 'function' ? f.options() : f.options;
    const sel = h('select', { 'aria-label': f.label }, h('option', { value: '' }, `${f.label}: todos`), opts.map((o) => h('option', { value: optVal(o) }, optLabel(o))));
    sel.value = st.filters[f.key] || '';
    sel.addEventListener('change', () => { st.filters[f.key] = sel.value; st.page = 1; draw(); });
    tools.append(sel);
  }
  tools.append(h('span', { class: 'grow' }), ...extraTools);
  if (exportCfg) {
    tools.append(h('button', {
      class: 'btn soft sm', type: 'button',
      onclick: () => downloadFile(exportCfg.filename, toCSV(exportCfg.headers, filtered().map(exportCfg.map)), 'text/csv;charset=utf-8'),
    }, icon('download'), 'Exportar CSV'));
  }
  root.append(tools, host);

  function filtered() {
    let out = rows;
    if (st.q && searchText) { const q = norm(st.q); out = out.filter((r) => norm(searchText(r)).includes(q)); }
    for (const f of filters) { const v = st.filters[f.key]; if (v) out = out.filter((r) => f.test(r, v)); }
    if (st.sort) {
      const col = columns.find((c) => c.key === st.sort.key);
      if (col?.sort) {
        const dir = st.sort.dir === 'desc' ? -1 : 1;
        out = [...out].sort((a, b) => {
          const x = col.sort(a); const y = col.sort(b);
          if (x === y) return 0;
          if (x === null || x === undefined || x === '') return 1;
          if (y === null || y === undefined || y === '') return -1;
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * dir;
        });
      }
    }
    return out;
  }

  function draw() {
    const data = filtered();
    const pages = Math.max(1, Math.ceil(data.length / pageSize));
    if (st.page > pages) st.page = pages;
    const slice = data.slice((st.page - 1) * pageSize, st.page * pageSize);

    const head = h('tr', null, columns.map((c) => {
      const active = st.sort?.key === c.key;
      const th = h('th', { class: `${c.align === 'right' ? 'right' : ''} ${c.sort ? 'sortable' : ''}`, scope: 'col', 'aria-sort': active ? (st.sort.dir === 'desc' ? 'descending' : 'ascending') : null }, c.label, active ? (st.sort.dir === 'desc' ? ' ↓' : ' ↑') : '');
      if (c.sort) {
        th.tabIndex = 0;
        const toggle = () => { st.sort = { key: c.key, dir: active && st.sort.dir === 'asc' ? 'desc' : 'asc' }; draw(); };
        th.addEventListener('click', toggle);
        th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      }
      return th;
    }));

    const body = slice.map((r) => {
      const tr = h('tr', { class: onRowClick ? 'clickable' : '' }, columns.map((c) => h('td', { class: c.align === 'right' ? 'right' : '' }, c.render(r))));
      if (onRowClick) {
        tr.tabIndex = 0;
        tr.addEventListener('click', (e) => { if (!e.target.closest('button, a, input, select')) onRowClick(r); });
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === tr) onRowClick(r); });
      }
      return tr;
    });

    host.replaceChildren(
      data.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, head), h('tbody', null, body)))
        : h('div', { class: 'empty' }, rows.length ? h('div', null, h('h3', null, 'Sin resultados'), h('p', null, 'Prueba con otra búsqueda o quita algún filtro.')) : empty),
      data.length > pageSize || data.length
        ? h('div', { class: 'pager' },
          h('span', null, `${data.length} ${data.length === 1 ? 'registro' : 'registros'}`),
          pages > 1 ? h('div', { class: 'btns' },
            h('button', { class: 'btn soft sm', type: 'button', disabled: st.page <= 1, onclick: () => { st.page--; draw(); } }, 'Anterior'),
            h('span', { style: { alignSelf: 'center' } }, `Página ${st.page} de ${pages}`),
            h('button', { class: 'btn soft sm', type: 'button', disabled: st.page >= pages, onclick: () => { st.page++; draw(); } }, 'Siguiente')) : null)
        : null);
  }
  draw();
  return root;
}

// ---------------------------------------------------------------------------
// Piezas comunes de página
// ---------------------------------------------------------------------------
export function pageHead({ title, subtitle, tone, actions = [] }) {
  return h('header', { class: 'page-head', 'data-tone': tone }, h('div', null, h('h1', null, title), subtitle ? h('p', null, subtitle) : null), h('div', { class: 'actions' }, actions));
}
export function kpi({ label, value, note, tone }) {
  return h('div', { class: 'kpi', 'data-tone': tone }, h('div', { class: 'k-label' }, label), h('div', { class: 'k-value' }, value), note ? h('div', { class: 'k-note' }, note) : null);
}
export function btn(label, { onClick, kind = '', ic, type = 'button', title } = {}) {
  return h('button', { class: `btn ${kind}`, type, title, onclick: onClick }, ic ? icon(ic) : null, label);
}
export function emptyState({ title, text, actions = [] }) {
  return h('div', { class: 'empty' }, h('h3', null, title), h('p', null, text), actions.length ? h('div', { class: 'btn-row' }, actions) : null);
}
export function kv(pairs) {
  return h('dl', { class: 'kv' }, pairs.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v === null || v === undefined || v === '' ? '—' : v))));
}

// ---------------------------------------------------------------------------
// Gráficos SVG
// ---------------------------------------------------------------------------
export const CHART_COLORS = ['#cbbaf5', '#a6e1c5', '#a8d5f4', '#ffc6a3', '#f9b3ca', '#f8e085'];

export function pairedBars(data, { labelA = 'Cobros', labelB = 'Egresos' } = {}) {
  const W = 560; const H = 230; const pad = { l: 46, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step || 1;
  const iw = W - pad.l - pad.r; const ih = H - pad.t - pad.b;
  const y = (v) => pad.t + ih - (v / top) * ih;
  const gw = iw / data.length;
  const bw = Math.min(26, gw / 3);
  const g = svg('svg', { class: 'chart fluid', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${labelA} y ${labelB} por mes` });
  for (let v = 0; v <= top + 0.001; v += step) {
    g.append(svg('line', { class: 'grid-line', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }));
    g.append(svg('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(Math.round(v))));
  }
  data.forEach((d, i) => {
    const cx = pad.l + gw * i + gw / 2;
    const bar = (v, x, cls, name) => {
      const hh = Math.max(0, (v / top) * ih);
      const r = svg('rect', { class: cls, x, y: pad.t + ih - hh, width: bw, height: hh, rx: 5 });
      r.append(svg('title', null, `${d.label} · ${name}: ${money(v)}`));
      return r;
    };
    g.append(bar(d.a, cx - bw - 2, 'bar-in', labelA), bar(d.b, cx + 2, 'bar-out', labelB));
    g.append(svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, d.label));
  });
  return g;
}
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function donut(items, { size = 150, centerLabel = '', centerValue = '' } = {}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = 54; const c = 2 * Math.PI * r;
  const g = svg('svg', { class: 'chart', viewBox: '0 0 150 150', width: size, height: size, role: 'img', 'aria-label': 'Distribución' });
  g.append(svg('circle', { cx: 75, cy: 75, r, fill: 'none', stroke: '#f1edf9', 'stroke-width': 22 }));
  let offset = 0;
  items.forEach((it, i) => {
    if (!total) return;
    const len = (it.value / total) * c;
    const arc = svg('circle', { cx: 75, cy: 75, r, fill: 'none', stroke: it.color || CHART_COLORS[i % CHART_COLORS.length], 'stroke-width': 22, 'stroke-dasharray': `${len} ${c - len}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 75 75)' });
    arc.append(svg('title', null, `${it.label}: ${money(it.value)}`));
    g.append(arc);
    offset += len;
  });
  g.append(svg('text', { x: 75, y: 72, 'text-anchor': 'middle', style: 'font-size:15px;font-weight:700;fill:#2d2845' }, centerValue));
  g.append(svg('text', { x: 75, y: 90, 'text-anchor': 'middle', style: 'font-size:11px' }, centerLabel));
  return g;
}

export function legend(items) {
  return h('div', { class: 'legend' }, items.map((it, i) => h('span', null, h('i', { style: { background: it.color || CHART_COLORS[i % CHART_COLORS.length] } }), `${it.label} · ${money(it.value)}`)));
}

export function hbars(items, { tone = 'rose', format = money } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return h('div', { 'data-tone': tone }, items.map((it) => h('div', { class: 'hbar' },
    h('span', null, it.label),
    h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${Math.max(2, (it.value / max) * 100)}%` } })),
    h('span', { class: 'num strong' }, format(it.value)))));
}
