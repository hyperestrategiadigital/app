// Ajustes automáticos de dados antigos, rodados uma vez ao entrar.
import { dados, gravarEmLote, excluir, salvarComId } from "./db.js";
import { hojeISO, addDias } from "./ui.js";
import { TIPO_CONTEUDO, TIPO_ANTIGO } from "./constantes.js";

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

// Tipos de tarefa antigos (13) → os 8 atuais. Só mexe nas tarefas que ainda têm tipo antigo.
export async function migrarTipos() {
  const antigas = dados.tarefas.filter((t) => TIPO_ANTIGO[t.tipo]);
  if (!antigas.length) return 0;
  await gravarEmLote("tarefas", antigas.map(({ id, ...t }) => ({ id, ...t, tipo: TIPO_ANTIGO[t.tipo] })));
  return antigas.length;
}
