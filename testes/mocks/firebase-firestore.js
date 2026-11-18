// Só para os testes de tela: substitui o SDK do Firebase (CDN) por uma versão em memória.
// Firestore falso com caminhos completos e persistência em localStorage (compartilhada entre abas).
const CHAVE = "fake-fs-store";
const store = window.__store = JSON.parse(localStorage.getItem(CHAVE) || "{}");
const salvar = () => localStorage.setItem(CHAVE, JSON.stringify(store));
const subs = []; let n = 0;
export const getFirestore = (app, id = "(default)") => ({ id, db: true });
export const collection = (base, ...p) => ({ path: [base.path, ...p].filter(Boolean).join("/") , tipo: "col" });
export const doc = (base, ...rest) => {
  if (base.tipo === "col") return { col: base.path, id: rest[0] || "auto" + Date.now().toString(36) + (++n), tipo: "doc" };
  const seg = [base.path, ...rest].filter(Boolean).join("/").split("/");
  return { col: seg.slice(0, -1).join("/"), id: seg[seg.length - 1], tipo: "doc" };
};
const passa = (d, filtros = []) => filtros.every(([campo, op, v]) => op === "in" ? v.includes(d[campo] ?? null) : op === "==" ? d[campo] === v : true);
const snapCol = (path, filtros) => { const docs = Object.entries(store[path] || {}).filter(([, d]) => passa(d, filtros)).map(([id, d]) => ({ id, data: () => d })); return { empty: !docs.length, docs }; };
export const where = (campo, op, v) => [campo, op, v];
export const query = (c, ...filtros) => ({ ...c, filtros });
const snapDoc = (r) => ({ id: r.id, exists: () => !!(store[r.col] || {})[r.id], data: () => (store[r.col] || {})[r.id] });
function emit(col) { subs.forEach((s) => { if (s.ref.tipo === "col" ? s.ref.path === col : s.ref.col === col) s.f(s.ref.tipo === "col" ? snapCol(col, s.ref.filtros) : snapDoc(s.ref)); }); }
export const onSnapshot = (ref, f, fe) => { const s = { ref, f }; subs.push(s); setTimeout(() => f(ref.tipo === "col" ? snapCol(ref.path, ref.filtros) : snapDoc(ref))); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; };
export const getDoc = async (r) => snapDoc(r);
export const getDocs = async (c) => snapCol(c.path, c.filtros);
export const setDoc = async (d, v, o) => { const c = (store[d.col] ??= {}); c[d.id] = o?.merge ? { ...(c[d.id] || {}), ...v } : v; salvar(); emit(d.col); };
export const updateDoc = async (d, v) => { const c = (store[d.col] ??= {}); c[d.id] = { ...(c[d.id] || {}), ...v }; salvar(); emit(d.col); };
export const deleteDoc = async (d) => { delete (store[d.col] || {})[d.id]; salvar(); emit(d.col); };
export const addDoc = async (c, v) => { const d = doc(c); await setDoc(d, v); return d; };
export const writeBatch = () => { const ops = []; return { set: (d, v) => ops.push([d, v]), delete: (d) => ops.push([d, null]), commit: async () => { const cs = new Set(); ops.forEach(([d, v]) => { if (v === null) delete (store[d.col] || {})[d.id]; else (store[d.col] ??= {})[d.id] = v; cs.add(d.col); }); salvar(); cs.forEach(emit); } }; };
export const initializeFirestore = (app, o, id) => getFirestore(app, id);
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
