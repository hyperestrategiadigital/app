// Ajustes automáticos de dados antigos, rodados uma vez ao entrar.
import { dados, gravarEmLote, excluir, salvarComId } from "./db.js";
import { hojeISO, addDias } from "./ui.js";
import { TIPO_CONTEUDO } from "./constantes.js";

const FORMATO_ANTIGO = { "Estático": "Feed estático", "Vídeo": "Reels", "Anúncio": "Anúncio estático" };

// Antes, posts ficavam na coleção "conteudos". Agora cada post é uma tarefa do tipo Conteúdo.
export async function migrarConteudos() {
  if (!dados.conteudos.length) return 0;
  const itens = dados.conteudos.map((c) => ({
    id: `cont-${c.id}`,
    titulo: c.titulo, clienteId: c.clienteId || "", tipo: TIPO_CONTEUDO,
    formato: FORMATO_ANTIGO[c.formato] || c.formato || "Feed estático", rede: c.rede || "Instagram",
    dataPublicacao: c.data, hora: c.hora || "", statusConteudo: c.status || "ideia",
    objetivo: c.objetivo || "", roteiro: c.roteiro || "", copy: c.copy || "",
    linkCanva: c.linkCanva || "", linkDrive: c.linkDrive || "",
    status: c.status === "publicado" ? "concluido" : "a_fazer", prazo: c.data,
    concluidoEm: c.status === "publicado" ? c.data : null, checklist: [], notas: "", criadoEm: c.criadoEm || Date.now()
  }));
  await gravarEmLote("tarefas", itens);
  for (const c of [...dados.conteudos]) await excluir("conteudos", c.id);
  return itens.length;
}

// Tarefas de conteúdo sem formato (vindas da planilha) recebem formato e data de publicação deduzidos do título.
export async function completarPostsSemFormato() {
  const faltando = dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && !t.formato);
  if (!faltando.length) return 0;
  const itens = faltando.map(({ id, ...t }) => ({
    id, ...t, ...deduzirPost(t.titulo, t.prazo), statusConteudo: t.status === "concluido" ? "publicado" : "ideia"
  }));
  await gravarEmLote("tarefas", itens);
  return itens.length;
}

export function deduzirPost(titulo = "", prazo = "") {
  const t = titulo.toLowerCase();
  const formato = /carrossel/.test(t) ? "Carrossel"
    : /stor(y|ies)/.test(t) ? "Story"
    : /reels?|v[ií]deo/.test(t) ? "Reels"
    : /whats/.test(t) ? "WhatsApp"
    : "Feed estático";
  // "(23/11)" no título é a data de publicação
  const m = titulo.match(/\((\d{1,2})\/(\d{1,2})\)/);
  let dataPublicacao = prazo;
  if (m && prazo) dataPublicacao = `${prazo.slice(0, 4)}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return { formato, rede: formato === "WhatsApp" ? "WhatsApp" : "Instagram", dataPublicacao, statusConteudo: "ideia" };
}

// Reuniões abertas criadas como tarefa viram compromissos (aparecem no calendário e vão para a Google Agenda).
export async function migrarReunioes() {
  const reunioes = dados.tarefas.filter((t) => t.tipo === "Reunião" && t.status !== "concluido" && (t.prazo || "") >= addDias(hojeISO(), -1));
  for (const t of reunioes) {
    await salvarComId("compromissos", `reu-${t.id}`, {
      titulo: t.titulo, clienteId: t.clienteId || "", data: t.prazo, diaInteiro: true, hora: "", duracao: 60,
      tipo: "Reunião", descricao: t.notas || "", local: "", participantes: [], convidados: "", repetir: "",
      sincronizar: true, criadoEm: Date.now()
    });
    await excluir("tarefas", t.id);
  }
  return reunioes.length;
}
