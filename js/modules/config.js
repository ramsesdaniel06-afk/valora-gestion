// Configuración: negocio, tasa de cambio, listas, respaldo de datos y nube.
import { h, icon, money, today, fmtDate, downloadFile } from '../utils.js';
import { pageHead, btn, pill, confirmDialog, toast } from '../ui.js';
import {
  getState, setTasa, setNegocio, addListItem, removeListItem, listDef, loadDemo, resetAll, exportJSON, importJSON,
} from '../store.js';
import { LIST_DEFS } from '../seed.js';
import { pickExcelAndImport } from '../importer.js';
import * as cloud from '../cloud.js';

export const meta = { title: 'Configuración', tone: 'gray' };

function negocioPanel() {
  const st = getState();
  const nombre = h('input', { type: 'text', id: 'cfg-nombre', value: st.meta.negocio });
  const tasa = h('input', { type: 'number', id: 'cfg-tasa', step: 'any', min: '0', value: st.meta.tasa || '', placeholder: 'Ej. 38,50' });
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, 'Negocio y tasa de cambio')),
    h('form', {
      class: 'panel-body', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        setNegocio(nombre.value);
        if (tasa.value) { const res = setTasa(tasa.value); if (!res.ok) { toast(res.error, 'err'); return; } }
        toast('Configuración guardada');
      },
    },
    h('div', { class: 'form-grid' },
      h('div', { class: 'field' }, h('label', { for: 'cfg-nombre' }, 'Nombre del negocio'), nombre),
      h('div', { class: 'field' }, h('label', { for: 'cfg-tasa' }, 'Tasa del día (Bs. por 1 USD)'), tasa,
        h('div', { class: 'help' }, st.meta.tasaFecha ? `Actualizada el ${fmtDate(st.meta.tasaFecha)}. Se usa para convertir cobros y pagos en bolívares.` : 'Se usa para convertir cobros y pagos en bolívares.'))),
    h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn', type: 'submit' }, 'Guardar'))));
}

function listasPanel() {
  const st = getState();
  const cards = LIST_DEFS.map((def) => {
    const locked = listDef(def.key).locked;
    const input = h('input', { type: 'text', placeholder: 'Agregar valor…', 'aria-label': `Agregar a ${def.label}`, style: { flex: 1 } });
    const add = () => {
      const res = addListItem(def.key, input.value);
      if (!res.ok) toast(res.error, 'err');
    };
    return h('div', { style: { padding: '14px 0', borderBottom: '1px solid var(--line)' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
        h('strong', null, def.label), locked ? pill('Parte de las reglas automáticas', 'gray') : null),
      h('div', { class: 'chips', style: { marginBottom: locked ? 0 : '10px' } },
        (st.lists[def.key] || []).map((v) => {
          const removable = !locked && !def.protect?.includes(v);
          return h('span', { class: 'pill plain', 'data-tone': 'lilac', style: { paddingRight: removable ? '4px' : '10px' } }, v,
            removable ? h('button', {
              type: 'button', class: 'icon-btn', 'aria-label': `Quitar ${v}`, style: { width: '22px', height: '22px', borderRadius: '99px' },
              onclick: () => removeListItem(def.key, v),
            }, icon('x')) : null);
        })),
      locked ? null : h('form', { style: { display: 'flex', gap: '8px' }, onsubmit: (e) => { e.preventDefault(); add(); } }, input, h('button', { class: 'btn soft sm', type: 'submit' }, 'Agregar')));
  });
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, 'Listas desplegables')),
    h('details', { class: 'panel-body fold' },
      h('summary', null, 'Ver y editar las 15 listas'),
      h('p', { class: 'muted small' }, 'Son las mismas listas de la hoja "Listas" de tu Excel. Las que activan reglas automáticas (estados, tipos de movimiento) no se editan para no romper los cálculos. Si quitas un valor, los registros que ya lo usan lo conservan.'),
      cards));
}

function datosPanel() {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    const ok = await confirmDialog({ title: 'Restaurar respaldo', message: 'Se reemplazarán todos los datos actuales por los del respaldo.', confirmLabel: 'Restaurar', danger: true });
    if (ok) { const res = importJSON(await f.text()); toast(res.ok ? 'Respaldo restaurado' : res.error, res.ok ? 'ok' : 'err'); }
    fileInput.value = '';
  });
  const st = getState();
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, 'Tus datos')),
    h('div', { class: 'panel-body' },
      h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'Por defecto todo se guarda en este navegador. Descarga un respaldo con frecuencia o conecta la nube para tenerlo en todos tus dispositivos.'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        btn('Descargar respaldo', { ic: 'download', onClick: () => downloadFile(`valora-respaldo-${today()}.json`, exportJSON(), 'application/json') }),
        btn('Restaurar respaldo', { kind: 'soft', ic: 'upload', onClick: () => fileInput.click() }),
        btn('Importar Excel de VALORA', { kind: 'soft', ic: 'upload', onClick: pickExcelAndImport })),
      fileInput,
      h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '18px 0' } }),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        btn(st.meta.demo ? 'Recargar datos de ejemplo' : 'Cargar datos de ejemplo', {
          kind: 'soft',
          onClick: async () => {
            const hasData = st.productos.length || st.compras.length || st.pedidos.length;
            if (hasData && !(await confirmDialog({ title: 'Cargar datos de ejemplo', message: 'Esto reemplaza tus datos actuales por datos de muestra. Descarga un respaldo antes si los necesitas.', confirmLabel: 'Reemplazar', danger: true }))) return;
            loadDemo(); toast('Datos de ejemplo cargados');
          },
        }),
        btn('Borrar todos los datos', {
          kind: 'danger', ic: 'trash',
          onClick: async () => {
            if (!(await confirmDialog({ title: 'Borrar todos los datos', message: 'Se eliminarán productos, proveedores, compras, pedidos y finanzas de este navegador. No se puede deshacer.', confirmLabel: 'Borrar todo', danger: true }))) return;
            resetAll(); toast('Datos borrados');
          },
        }))));
}

function nubePanel() {
  const c = cloud.getConfig();
  const url = h('input', { type: 'url', id: 'cl-url', value: c.url, placeholder: 'https://xxxx.supabase.co', autocomplete: 'off' });
  const key = h('input', { type: 'text', id: 'cl-key', value: c.key, placeholder: 'Clave "anon public"', autocomplete: 'off' });
  const email = h('input', { type: 'email', id: 'cl-email', value: c.email, autocomplete: 'username' });
  const pass = h('input', { type: 'password', id: 'cl-pass', autocomplete: 'current-password' });
  const statusEl = h('span', null);
  const dot = h('span', { class: 'sync-dot off' });
  const paint = (s) => { statusEl.textContent = s.message; dot.className = `sync-dot ${s.mode === 'on' ? '' : s.mode === 'busy' ? 'busy' : s.mode === 'err' ? 'err' : 'off'}`; };
  paint(cloud.getStatus());
  const off = cloud.onStatus(paint);
  // Evita fugas: al volver a pintar la página el nodo se desconecta; lo limpiamos en el siguiente aviso.
  const guard = cloud.onStatus(() => { if (!statusEl.isConnected) { off(); guard(); } });

  const run = (fn, okMsg) => async () => {
    try { await fn(); if (okMsg) toast(okMsg); } catch (e) { toast(e.message, 'err'); }
  };
  const login = (create) => run(async () => {
    await cloud.signIn({ url: url.value, key: key.value, email: email.value, password: pass.value, create });
    const remote = await cloud.pull();
    const local = getState();
    const hasLocal = local.productos.length || local.pedidos.length || local.compras.length;
    if (remote && hasLocal) {
      const useCloud = await confirmDialog({ title: 'Ya hay datos en la nube', message: 'Encontré datos guardados en tu cuenta y también tienes datos en este navegador. ¿Cuáles quieres conservar?', confirmLabel: 'Usar los de la nube' });
      if (useCloud) await cloud.useRemote(); else await cloud.push();
    } else if (remote) await cloud.useRemote();
    else await cloud.push();
  }, create ? 'Cuenta creada y conectada' : 'Conectado: se sincroniza solo');

  const signedIn = cloud.isSignedIn();
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, 'Nube (Supabase)'), h('span', { class: 'small muted' }, dot, statusEl)),
    h('div', { class: 'panel-body' },
      h('p', { class: 'muted small', style: { marginBottom: '12px' } }, 'Opcional. Guarda tus datos en tu propio proyecto de Supabase para usar el sistema desde el celular y la computadora. Sigue los pasos del README y pega aquí la URL y la clave pública.'),
      h('form', { onsubmit: (e) => e.preventDefault(), novalidate: true },
        h('div', { class: 'form-grid' },
          h('div', { class: 'field span2' }, h('label', { for: 'cl-url' }, 'URL del proyecto'), url),
          h('div', { class: 'field span2' }, h('label', { for: 'cl-key' }, 'Clave anon public'), key),
          h('div', { class: 'field' }, h('label', { for: 'cl-email' }, 'Correo'), email),
          h('div', { class: 'field' }, h('label', { for: 'cl-pass' }, 'Contraseña'), pass)),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } },
          btn(signedIn ? 'Reconectar' : 'Iniciar sesión', { ic: 'cloud', onClick: login(false) }),
          btn('Crear cuenta', { kind: 'soft', onClick: login(true) }),
          signedIn ? btn('Subir ahora', { kind: 'soft', onClick: run(() => cloud.push(), 'Datos subidos') }) : null,
          signedIn ? btn('Traer de la nube', { kind: 'soft', onClick: run(() => cloud.useRemote(), 'Datos de la nube cargados') }) : null,
          signedIn ? btn('Cerrar sesión', { kind: 'danger', onClick: () => { cloud.signOut(); toast('Sesión cerrada'); } }) : null))));
}

export function render() {
  return h('div', { 'data-tone': meta.tone },
    pageHead({ title: 'Configuración', subtitle: 'Tasa de cambio, listas, respaldo de datos y conexión a la nube.', tone: meta.tone }),
    h('div', { style: { display: 'grid', gap: '16px' } }, negocioPanel(), listasPanel(), datosPanel(), nubePanel()));
}
void money;
