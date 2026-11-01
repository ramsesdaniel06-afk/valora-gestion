// Arranque: estructura de la app, navegación por hash y re-render cuando cambian los datos.
import { h, icon, int, toNum } from './utils.js';
import { toast, openForm } from './ui.js';
import { getState, subscribe, enrichProducts, setTasa, PEDIDO_ACTIVO } from './store.js';
import * as cloud from './cloud.js';
import * as dashboard from './modules/dashboard.js';
import * as catalogo from './modules/catalogo.js';
import * as proveedores from './modules/proveedores.js';
import * as inventario from './modules/inventario.js';
import * as compras from './modules/compras.js';
import * as pedidos from './modules/pedidos.js';
import * as finanzas from './modules/finanzas.js';
import * as config from './modules/config.js';

const ROUTES = [
  { path: 'panel', mod: dashboard, label: 'Panel', icon: 'home', tone: 'lilac', group: 'Resumen' },
  { path: 'pedidos', mod: pedidos, label: 'Pedidos', icon: 'bag', tone: 'peach', group: 'Vender', badge: () => getState().pedidos.filter((o) => PEDIDO_ACTIVO(o.estado)).length },
  { path: 'catalogo', mod: catalogo, label: 'Catálogo', icon: 'tag', tone: 'lilac', group: 'Productos' },
  { path: 'inventario', mod: inventario, label: 'Inventario', icon: 'box', tone: 'mint', group: 'Productos', badge: () => enrichProducts().filter((p) => p.alertaStock === 'REPONER').length },
  { path: 'proveedores', mod: proveedores, label: 'Proveedores', icon: 'truck', tone: 'rose', group: 'Comprar' },
  { path: 'compras', mod: compras, label: 'Compras', icon: 'cart', tone: 'sky', group: 'Comprar' },
  { path: 'finanzas', mod: finanzas, label: 'Finanzas', icon: 'coins', tone: 'butter', group: 'Dinero' },
  { path: 'configuracion', mod: config, label: 'Configuración', icon: 'gear', tone: 'gray', group: 'Sistema' },
];

const app = document.getElementById('app');
const pageHost = h('main', { class: 'page', id: 'contenido', tabindex: '-1' });
const nav = h('nav', { class: 'nav', 'aria-label': 'Principal' });
const scrim = h('div', { class: 'scrim hidden', onclick: () => toggleMenu(false) });
const titleEl = h('div', { class: 'brand-sub', style: { fontSize: '14px', fontWeight: 600, color: 'var(--ink)' } });
const rateChip = h('button', { class: 'rate-chip', type: 'button', title: 'Cambiar la tasa del día' });
const syncDot = h('span', { class: 'sync-dot off' });
const syncText = h('span', null);
const sidebar = h('aside', { class: 'sidebar', id: 'menu' },
  h('a', { class: 'brand', href: '#/panel' },
    h('div', { class: 'brand-mark' }, h('span', null, 'V')),
    h('div', null, h('div', { class: 'brand-name' }, 'VALORA'), h('div', { class: 'brand-sub' }, 'Sistema de gestión'))),
  nav,
  h('div', { class: 'sidebar-foot' }, syncDot, syncText));

const menuBtn = h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'Abrir menú', 'aria-controls': 'menu', onclick: () => toggleMenu(true) }, icon('menu'));
const topbar = h('div', { class: 'topbar' }, menuBtn, titleEl, h('span', { class: 'spacer' }), rateChip);

app.append(h('div', { class: 'app' }, sidebar, h('div', { class: 'main' }, topbar, pageHost)), scrim);

function toggleMenu(open) {
  sidebar.classList.toggle('open', open);
  scrim.classList.toggle('hidden', !open);
  menuBtn.setAttribute('aria-expanded', String(open));
}

function currentRoute() {
  const path = (location.hash.replace(/^#\/?/, '') || 'panel').split('?')[0];
  return ROUTES.find((r) => r.path === path) || ROUTES[0];
}

function drawNav(active) {
  let lastGroup = '';
  const items = [];
  for (const r of ROUTES) {
    if (r.group !== lastGroup) { items.push(h('div', { class: 'nav-group' }, r.group)); lastGroup = r.group; }
    const n = r.badge ? r.badge() : 0;
    items.push(h('a', { href: `#/${r.path}`, 'data-tone': r.tone, 'aria-current': r === active ? 'page' : null },
      h('span', { class: 'chip' }, icon(r.icon)), r.label, n ? h('span', { class: 'count' }, int(n)) : null));
  }
  nav.replaceChildren(...items);
}

function drawRate() {
  const t = getState().meta.tasa;
  rateChip.textContent = t ? `Tasa: Bs. ${t.toString().replace('.', ',')}` : 'Poner tasa del día';
}

let lastPath = '';
function renderPage({ keepScroll = true } = {}) {
  const route = currentRoute();
  const y = window.scrollY;
  const changed = lastPath !== route.path;
  lastPath = route.path;
  try {
    pageHost.replaceChildren(route.mod.render(() => renderPage()));
  } catch (e) {
    console.error(e);
    pageHost.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'empty' }, h('h3', null, 'Algo salió mal en esta pantalla'), h('p', null, e.message))));
  }
  drawNav(route);
  drawRate();
  titleEl.textContent = route.label;
  document.title = `${route.label} · ${getState().meta.negocio}`;
  if (changed || !keepScroll) { window.scrollTo(0, 0); pageHost.focus({ preventScroll: true }); } else window.scrollTo(0, y);
}

subscribe(() => renderPage());
window.addEventListener('hashchange', () => { toggleMenu(false); renderPage({ keepScroll: false }); });
window.addEventListener('valora:storage-error', () => toast('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). Descarga un respaldo desde Configuración.', 'err'));

rateChip.addEventListener('click', () => {
  openForm({
    title: 'Tasa del día', subtitle: 'Cuántos bolívares vale 1 dólar hoy.', tone: 'butter', size: 'narrow',
    fields: [{ name: 'tasa', label: 'Bs. por 1 USD', type: 'number', required: true }],
    values: { tasa: getState().meta.tasa || '' }, submitLabel: 'Guardar tasa', successMessage: 'Tasa actualizada',
    onSubmit: (v) => setTasa(toNum(v.tasa)),
  });
});

const paintSync = (s) => {
  syncDot.className = `sync-dot ${s.mode === 'on' ? '' : s.mode === 'busy' ? 'busy' : s.mode === 'err' ? 'err' : 'off'}`;
  syncText.textContent = s.message;
};
paintSync(cloud.getStatus());
cloud.onStatus(paintSync);

renderPage({ keepScroll: false });
