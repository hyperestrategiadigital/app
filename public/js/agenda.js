// Sincronização dos COMPROMISSOS com a Google Agenda (só compromissos — posts de cliente nunca vão para lá).
// A conexão usa um login Google separado do login do app, então você pode escolher a conta pessoal
// (a que está no iPhone). O acesso vale ~1 hora; depois o app pede para conectar de novo ao sincronizar.
import { firebaseConfig } from "./firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { dados, salvarComId, atualizar } from "./db.js";
import { addDias, dataDe, hojeISO } from "./ui.js";

const ESCOPO = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export const FUSO = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

const appAgenda = initializeApp(firebaseConfig, "agenda");
const authAgenda = getAuth(appAgenda);

let acesso = null; // { token, expira, email }
try { const s = JSON.parse(sessionStorage.getItem("hyper-agenda") || "null"); if (s?.expira > Date.now()) acesso = s; } catch {}

export const configAgenda = () => dados.config.find((c) => c.id === "agenda") || {};
export const agendaConectada = () => !!configAgenda().email;
export const acessoValido = () => !!acesso && acesso.expira > Date.now() + 60000;

/** Abre o login do Google pedindo permissão para criar eventos na agenda. */
export async function conectarAgenda() {
  const provedor = new GoogleAuthProvider();
  provedor.addScope(ESCOPO);
  const email = configAgenda().email;
  provedor.setCustomParameters(email ? { login_hint: email } : { prompt: "select_account" });
  const r = await signInWithPopup(authAgenda, provedor);
  const token = GoogleAuthProvider.credentialFromResult(r)?.accessToken;
  if (!token) throw new Error("O Google não devolveu a permissão da agenda.");
  acesso = { token, expira: Date.now() + 55 * 60 * 1000, email: r.user.email };
  try { sessionStorage.setItem("hyper-agenda", JSON.stringify(acesso)); } catch {}
  await salvarComId("config", "agenda", { email: r.user.email, conectadoEm: Date.now() });
  return r.user.email;
}

export async function desconectarAgenda() {
  acesso = null;
  try { sessionStorage.removeItem("hyper-agenda"); } catch {}
  await signOut(authAgenda).catch(() => {});
  await salvarComId("config", "agenda", { email: "", conectadoEm: null });
}

async function chamar(metodo, url, corpo) {
  if (!acessoValido()) await conectarAgenda();
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${acesso.token}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  if (r.status === 204 || (metodo === "DELETE" && (r.status === 410 || r.status === 404))) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `Erro ${r.status}`;
    if (r.status === 401) { acesso = null; throw new Error("A permissão da agenda expirou. Tente de novo para reconectar."); }
    if (r.status === 403 && /has not been used|is disabled|accessNotConfigured/i.test(msg))
      throw new Error("A API do Google Agenda não está ativada no projeto. Veja o passo a passo em Ajustes → Google Agenda.");
    throw new Error(msg);
  }
  return j;
}

/* ---------------- Montagem do evento ---------------- */
export const emailsParticipantes = (c) => {
  const equipe = configEquipe();
  const daEquipe = (c.participantes || []).map((nome) => equipe.find((p) => p.nome === nome)?.email).filter(Boolean);
  const extras = (c.convidados || "").split(/[,;\s]+/).filter((e) => /@/.test(e));
  return [...new Set([...daEquipe, ...extras].map((e) => e.trim().toLowerCase()))];
};

export const configEquipe = () => dados.config.find((c) => c.id === "equipe")?.pessoas || [];

const RRULE = { semanal: "RRULE:FREQ=WEEKLY", quinzenal: "RRULE:FREQ=WEEKLY;INTERVAL=2", mensal: "RRULE:FREQ=MONTHLY" };

function fimDe(c) {
  if (c.horaFim) return c.horaFim;
  const [h, m] = (c.hora || "09:00").split(":").map(Number);
  const total = h * 60 + m + (Number(c.duracao) || 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function eventoGoogle(c) {
  const dono = (configAgenda().email || "").toLowerCase();
  const cliente = dados.clientes.find((x) => x.id === c.clienteId);
  const descricao = [c.descricao, cliente ? `Cliente: ${cliente.nome}` : "", "Criado pelo app da Hyper"].filter(Boolean).join("\n\n");
  const ev = {
    summary: c.titulo,
    description: descricao,
    location: c.local || "",
    attendees: emailsParticipantes(c).filter((e) => e !== dono).map((email) => ({ email })),
    extendedProperties: { private: { hyperId: c.id } },
    recurrence: c.repetir && RRULE[c.repetir] ? [RRULE[c.repetir]] : []
  };
  if (c.diaInteiro || !c.hora) {
    ev.start = { date: c.data };
    ev.end = { date: addDias(c.data, 1) };
  } else {
    ev.start = { dateTime: `${c.data}T${c.hora}:00`, timeZone: FUSO };
    ev.end = { dateTime: `${c.data}T${fimDe(c)}:00`, timeZone: FUSO };
  }
  return ev;
}

/** Cria ou atualiza o evento na Google Agenda e guarda o id no compromisso. */
export async function sincronizar(c) {
  const corpo = eventoGoogle(c);
  const convites = corpo.attendees.length ? "?sendUpdates=all" : "";
  let ev;
  if (c.googleEventId) {
    try { ev = await chamar("PATCH", `${API}/${encodeURIComponent(c.googleEventId)}${convites}`, corpo); }
    catch (e) { if (/not found|deleted/i.test(e.message)) ev = await chamar("POST", `${API}${convites}`, corpo); else throw e; }
  } else ev = await chamar("POST", `${API}${convites}`, corpo);
  await atualizar("compromissos", c.id, { googleEventId: ev.id, googleLink: ev.htmlLink || "", sincronizadoEm: Date.now(), erroSync: "" });
  return ev;
}

export async function removerDaAgenda(c) {
  if (!c.googleEventId) return;
  await chamar("DELETE", `${API}/${encodeURIComponent(c.googleEventId)}${(c.participantes || []).length ? "?sendUpdates=all" : ""}`);
}

/** Link "Adicionar à Google Agenda" (funciona sem conectar nada). */
export function linkGoogleAgenda(c) {
  const sem = (s) => s.replace(/[-:]/g, "");
  const datas = c.diaInteiro || !c.hora
    ? `${sem(c.data)}/${sem(addDias(c.data, 1))}`
    : `${sem(c.data)}T${sem(c.hora)}00/${sem(c.data)}T${sem(fimDe(c))}00`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: c.titulo || "", dates: datas, details: c.descricao || "", location: c.local || "", ctz: FUSO });
  if (c.repetir && RRULE[c.repetir]) p.set("recur", RRULE[c.repetir]);
  const convidados = emailsParticipantes(c);
  if (convidados.length) p.set("add", convidados.join(","));
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Datas em que o compromisso acontece entre inicio e fim (inclui repetições). */
export function ocorrenciasCompromisso(c, inicio, fim) {
  if (!c.data) return [];
  if (!c.repetir) return c.data >= inicio && c.data <= fim ? [c.data] : [];
  const out = [];
  const base = dataDe(c.data);
  for (let d = c.data < inicio ? inicio : c.data; d <= fim; d = addDias(d, 1)) {
    const x = dataDe(d);
    const semanas = Math.round((x - base) / 86400000 / 7);
    if (c.repetir === "mensal" ? x.getDate() === base.getDate()
      : x.getDay() === base.getDay() && (c.repetir === "semanal" || semanas % 2 === 0)) out.push(d);
  }
  if (c.repetirAte) return out.filter((d) => d <= c.repetirAte);
  return out;
}

export const compromissosEntre = (inicio, fim) =>
  dados.compromissos.flatMap((c) => ocorrenciasCompromisso(c, inicio, fim).map((data) => ({ c, data })))
    .sort((a, b) => (a.data + (a.c.hora || "")).localeCompare(b.data + (b.c.hora || "")));

export const compromissosHoje = () => compromissosEntre(hojeISO(), hojeISO());
