// Normaliza dados ao entrar (administrador): tipos e formatos que saíram das listas e posts com status e etapa
// desencontrados. Só grava o que precisa mudar.
import { dados, gravarEmLote, atualizar } from "./db.js";
import { hojeISO } from "./ui.js";
import { TIPO_CONTEUDO, TIPO_ANTIGO, FORMATO_ANTIGO, statusDaEtapa } from "./constantes.js";

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
