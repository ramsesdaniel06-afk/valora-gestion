// Sincronización opcional con Supabase (Auth por correo/clave + una fila por usuario con todo el estado).
// Usa la API REST directamente: no hace falta ninguna librería.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { getState, replaceState, onPersist } from './store.js';
import { debounce } from './utils.js';

const CFG_KEY = 'valora.cloud';
const listeners = new Set();
let status = { mode: 'off', message: 'Solo en este dispositivo' };
let session = null;
let cfg = { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, email: '' };
let applyingRemote = false;

try {
  const saved = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
  if (saved) { cfg = { ...cfg, ...saved.cfg }; session = saved.session || null; }
} catch { /* sin configuración guardada */ }

const save = () => localStorage.setItem(CFG_KEY, JSON.stringify({ cfg, session }));
const set = (mode, message) => { status = { mode, message }; listeners.forEach((fn) => fn(status)); };

export const getStatus = () => status;
export const getConfig = () => ({ ...cfg });
export const isConfigured = () => Boolean(cfg.url && cfg.key);
export const isSignedIn = () => Boolean(session?.access_token);
export const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const base = () => cfg.url.replace(/\/+$/, '');
const headers = (auth = true) => ({ apikey: cfg.key, 'Content-Type': 'application/json', ...(auth && session ? { Authorization: `Bearer ${session.access_token}` } : {}) });

async function authRequest(path, body) {
  const res = await fetch(`${base()}/auth/v1/${path}`, { method: 'POST', headers: headers(false), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `Error ${res.status}`);
  return data;
}
const storeSession = (d) => {
  session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user_id: d.user?.id || session?.user_id, email: d.user?.email || session?.email };
  save();
};

async function ensureSession() {
  if (!session) throw new Error('Inicia sesión para sincronizar.');
  if (session.expires_at - 60 < Date.now() / 1000) {
    const d = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    storeSession(d);
  }
}

export async function signIn({ url, key, email, password, create = false }) {
  cfg = { url: url.trim(), key: key.trim(), email: email.trim() };
  if (!isConfigured()) throw new Error('Escribe la URL y la clave anon de tu proyecto Supabase.');
  save();
  set('busy', 'Conectando…');
  try {
    const d = create
      ? await authRequest('signup', { email: cfg.email, password })
      : await authRequest('token?grant_type=password', { email: cfg.email, password });
    if (!d.access_token) throw new Error('Cuenta creada. Confirma tu correo (si tu proyecto lo exige) y luego inicia sesión.');
    storeSession(d);
    set('on', `Conectado como ${cfg.email}`);
  } catch (e) { set('err', e.message); throw e; }
}

export function signOut() {
  session = null; save();
  set('off', 'Solo en este dispositivo');
}

/** Descarga el estado de la nube. Devuelve null si todavía no hay datos guardados. */
export async function pull() {
  await ensureSession();
  const res = await fetch(`${base()}/rest/v1/valora_state?select=data,updated_at&limit=1`, { headers: headers() });
  if (!res.ok) throw new Error(`No se pudo leer la nube (${res.status}). ¿Ejecutaste supabase/schema.sql?`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function push() {
  await ensureSession();
  set('busy', 'Guardando en la nube…');
  const res = await fetch(`${base()}/rest/v1/valora_state?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: session.user_id, data: getState(), updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`No se pudo guardar en la nube (${res.status}).`);
  set('on', `Sincronizado ${new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`);
}

export async function useRemote() {
  const row = await pull();
  if (!row) throw new Error('No hay datos en la nube todavía.');
  applyingRemote = true;
  replaceState(row.data);
  applyingRemote = false;
  set('on', 'Datos de la nube cargados');
}

const autoPush = debounce(async () => {
  if (!isSignedIn()) return;
  try { await push(); } catch (e) { set('err', e.message); }
}, 1500);

onPersist(() => { if (!applyingRemote && isSignedIn()) autoPush(); });

if (isSignedIn()) set('on', `Conectado como ${cfg.email}`);
else if (isConfigured()) set('off', 'Nube configurada, sin iniciar sesión');
