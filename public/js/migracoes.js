// Ajustes automáticos de dados antigos, rodados uma vez ao entrar.
import { dados, gravarEmLote, excluir, salvarComId, atualizar } from "./db.js";
import { hojeISO, addDias } from "./ui.js";
import { TIPO_CONTEUDO, TIPO_ANTIGO, FORMATO_ANTIGO, statusDaEtapa } from "./constantes.js";

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
    : /reels?|v[ií]deo|tiktok/.test(t) ? "Vídeo"
    : /whats/.test(t) ? "WhatsApp"
    : "Estático";
  // "(23/11)" no título é a data de publicação
  const m = titulo.match(/\((\d{1,2})\/(\d{1,2})\)/);
  let dataPublicacao = prazo;
  if (m && prazo) dataPublicacao = `${prazo.slice(0, 4)}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return { formato, rede: formato === "WhatsApp" ? "WhatsApp" : "Instagram", dataPublicacao, statusConteudo: "ideia" };
}

/**
 * Formatos antigos (Feed estático, Reels, TikTok, Sequência de stories…) → novos (Estático, Vídeo, Story…),
 * nos posts e nas chaves dos modelos de checklist.
 */
export async function migrarFormatos() {
  const posts = dados.tarefas.filter((t) => FORMATO_ANTIGO[t.formato]);
  for (let i = 0; i < posts.length; i += 400)
    await gravarEmLote("tarefas", posts.slice(i, i + 400).map(({ id, ...t }) => ({ id, ...t, formato: FORMATO_ANTIGO[t.formato] })));
  const modelos = dados.config.find((c) => c.id === "modelos");
  if (modelos?.modelos && Object.keys(modelos.modelos).some((k) => FORMATO_ANTIGO[k])) {
    const novos = {};
    for (const [k, passos] of Object.entries(modelos.modelos)) { const n = FORMATO_ANTIGO[k] || k; if (!novos[n]) novos[n] = passos; }
    await atualizar("config", "modelos", { modelos: novos });
  }
  return posts.length;
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
    await excluir("tarefas", t.id, { lixeira: false });
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

// Post tem um status só (a etapa). Acerta posts antigos em que status e etapa não combinam:
// concluído vira "publicado"; nos demais, o status passa a seguir a etapa.
export async function alinharStatusPosts() {
  const itens = [];
  for (const t of dados.tarefas) {
    if (t.tipo !== TIPO_CONTEUDO) continue;
    const etapa = t.status === "concluido" ? "publicado" : t.statusConteudo || "ideia";
    const status = statusDaEtapa(etapa);
    if (etapa !== t.statusConteudo || status !== (t.status || "a_fazer")) {
      const { id, ...resto } = t;
      itens.push({ id, ...resto, statusConteudo: etapa, status, concluidoEm: status === "concluido" ? t.concluidoEm || t.dataPublicacao || hojeISO() : null });
    }
  }
  if (itens.length) await gravarEmLote("tarefas", itens);
  return itens.length;
}

// Agenda automática: compromissos futuros que ficaram sem marcar (do tempo em que era preciso conectar a agenda)
// passam a ir para a Google Agenda. Os que alguém desmarcou de propósito (naoSincronizar) ficam como estão.
export async function marcarCompromissosParaAgenda() {
  const hoje = hojeISO();
  const itens = dados.compromissos.filter((c) => !c.sincronizar && !c.naoSincronizar && (c.data >= hoje || (c.repetir && (!c.repetirAte || c.repetirAte >= hoje))));
  if (itens.length) await gravarEmLote("compromissos", itens.map(({ id, ...c }) => ({ id, ...c, sincronizar: true })));
  return itens.length;
}

// Conserto: o "Organizar grupos" antigo podia juntar um grupo nele mesmo (cliente com o mesmo nome de uma marca dele),
// deixando o grupo inativo e sumido das listas. Reativa cliente inativo que tem marcas ativas ou que "virou marca" de si mesmo.
export async function reativarGruposSumidos() {
  const marcas = dados.marcas || [];
  const sumidos = dados.clientes.filter((c) => c.ativo === false &&
    (c.viraMarcaDe === c.id || marcas.some((m) => m.clienteId === c.id && m.ativo !== false)));
  for (const c of sumidos) await atualizar("clientes", c.id, { ativo: true, viraMarcaDe: "", marcaId: "" });
  return sumidos.length;
}
