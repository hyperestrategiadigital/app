// Google Agenda dos COMPROMISSOS (só compromissos — posts de cliente nunca vão para lá).
// Quem cria os eventos é o script de automações da conta da Hyper (docs/email/Codigo.gs), a cada 5 minutos:
// ele usa a agenda "Hyper · Compromissos" da conta da Hyper e manda o convite para o e-mail de cada participante.
// Assim ninguém precisa conectar nada nem ativar API no Google Cloud: cada pessoa recebe o evento na própria
// agenda (Gmail, iPhone…), no e-mail que escolheu em Minha conta.
import { dados, espacoInfo } from "./db.js";
import { eu } from "./permissoes.js";
import { addDias, dataDe, hojeISO } from "./ui.js";

export const FUSO = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

/** Situação da sincronização, gravada pelo script em config/agendaHyper { ultimo, conta, calendario, erro }. */
export const configAgenda = () => dados.config.find((c) => c.id === "agendaHyper") || {};
/** A agenda automática está rodando (o script sincronizou nas últimas 24 horas). */
export const agendaConectada = () => (configAgenda().ultimo || 0) > Date.now() - 24 * 3600 * 1000;

/** Testa a agenda agora e explica o que deu errado (Ajustes). */
export async function testarAgenda() {
  const url = espacoInfo.emailUrl || dados.config.find((c) => c.id === "email")?.url;
  if (!url) throw new Error("Ligue as automações (E-mails e automações) primeiro.");
  let r;
  try { r = await (await fetch(url, { method: "POST", body: JSON.stringify({ tipo: "agenda-agora" }) })).json(); }
  catch { throw new Error("O script não respondeu. Confira se a URL está certa e se a implantação está como \"Qualquer pessoa\"."); }
  if (r.ok) return r;
  const erro = String(r.erro || "");
  if (erro === "tipo") throw new Error("O script ainda está na versão antiga. Cole os dois arquivos novos (appsscript.json e Código.gs) e implante uma Nova versão.");
  if (/Calendar is not defined|Calendar não está definido/i.test(erro)) throw new Error("Falta o serviço de agenda no script: troque também o appsscript.json pelo novo e implante uma Nova versão.");
  if (/permission|autoriza|authoriz/i.test(erro)) throw new Error("O script precisa ser autorizado de novo: no Apps Script, rode a função sincronizarAgenda uma vez (botão Executar) e aceite as permissões.");
  throw new Error("Erro do script: " + erro.slice(0, 300));
}

let ultimoPedido = 0;
let pedidoAgendado = null;
/**
 * Pede ao script para sincronizar agora (sem esperar os 5 minutos). Não precisa de login nem de segredo.
 * Chamado sozinho ao salvar ou excluir um compromisso. Pedidos muito seguidos viram um só, logo em seguida.
 */
export async function sincronizar() {
  // A URL do script fica no documento do espaço; administradores também a têm em config/email
  const url = espacoInfo.emailUrl || dados.config.find((c) => c.id === "email")?.url;
  if (!url) return false;
  const espera = 25000 - (Date.now() - ultimoPedido);
  if (espera > 0) {
    clearTimeout(pedidoAgendado);
    pedidoAgendado = setTimeout(sincronizar, espera);
    return true;
  }
  ultimoPedido = Date.now();
  try {
    const r = await fetch(url, { method: "POST", body: JSON.stringify({ tipo: "agenda-agora" }) });
    return (await r.json().catch(() => ({}))).ok === true;
  } catch { return false; }
}

/* ---------------- Montagem do evento ---------------- */
export const emailsParticipantes = (c) => {
  const equipe = configEquipe();
  const daEquipe = (c.participantes || []).map((nome) => equipe.find((p) => p.nome === nome)?.email).filter(Boolean);
  const extras = (c.convidados || "").split(/[,;\s]+/).filter((e) => /@/.test(e));
  return [...new Set([...daEquipe, ...extras].map((e) => e.trim().toLowerCase()))];
};

/** Equipe = pessoas com conta no espaço (membros) + pessoas sem conta cadastradas em Ajustes. */
export const configEquipe = () => {
  const lista = [
    ...dados.membros.filter((m) => m.status !== "pendente").map((m) => ({ nome: m.nome || m.email, email: m.emailAgenda || m.email || "" })),
    ...(dados.config.find((c) => c.id === "equipe")?.pessoas || [])
  ];
  const vistos = new Set();
  return lista.filter((p) => { const k = (p.email || p.nome).toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
};

/** Quem pode ser responsável por tarefas: a equipe, sem a conta da Hyper (dona do espaço, só administra). */
export function responsaveis() {
  const dona = dados.membros.find((m) => m.id === espacoInfo.dono);
  const nomeDona = dona ? (dona.nome || dona.email) : "";
  const nomes = configEquipe().map((p) => p.nome).filter((n) => n && n !== nomeDona);
  if (!nomes.length) nomes.push("Matheus");
  return nomes;
}
/** Responsável de tarefa nova: quem está usando (se for da equipe) ou a primeira pessoa da equipe. */
export const responsavelPadrao = () => (responsaveis().includes(eu.nome) ? eu.nome : responsaveis()[0]);

const RRULE = { semanal: "RRULE:FREQ=WEEKLY", quinzenal: "RRULE:FREQ=WEEKLY;INTERVAL=2", mensal: "RRULE:FREQ=MONTHLY" };

function fimDe(c) {
  if (c.horaFim) return c.horaFim;
  const [h, m] = (c.hora || "09:00").split(":").map(Number);
  const total = h * 60 + m + (Number(c.duracao) || 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
