// Produção da semana: os posts planejados entram na tarefa "Produzir semana" do cliente (rotina de produção),
// como uma checklist, e não aparecem soltos nas listas de tarefas. Ficam soltos só os posts extras
// (criados à mão, marcados como "extra") e as sugestões dos clientes. No calendário todos os posts aparecem.
// Vídeo precisa de roteiro antes: o roteiro dos vídeos da semana S entra no "Produzir semana" de S-7
// (produzido duas semanas antes da publicação), e a produção do vídeo entra no da própria semana.
import { dados } from "./db.js";
import { addDias } from "./ui.js";
import { TIPO_CONTEUDO, FORMATO_VIDEO } from "./constantes.js";

let cache = { ref: null, tamanho: -1, lista: [] };
/** Tarefas "Produzir semana" (têm semanaInicio). */
function producoes() {
  if (cache.ref !== dados.tarefas || cache.tamanho !== dados.tarefas.length)
    cache = { ref: dados.tarefas, tamanho: dados.tarefas.length, lista: dados.tarefas.filter((t) => t.semanaInicio) };
  return cache.lista;
}

const dataDoPost = (t) => t.dataPublicacao || t.prazo || "";
/** Post que fica solto nas tarefas, fora da produção da semana. */
export const ehAvulso = (t) => !!(t.extra || t.sugeridoPeloCliente);
const cobre = (producao, t) => {
  const d = dataDoPost(t);
  return !!d && (!producao.clienteId || producao.clienteId === t.clienteId) && d >= producao.semanaInicio && d <= addDias(producao.semanaInicio, 6);
};

/** A tarefa "Produzir semana" que inclui este post, ou null. */
export function producaoDoPost(t) {
  if (t?.tipo !== TIPO_CONTEUDO || ehAvulso(t)) return null;
  return producoes().find((p) => cobre(p, t)) || null;
}
/** Post que está dentro de um "Produzir semana" (não aparece solto nas listas de tarefas). */
export const dentroDaProducao = (t) => !!producaoDoPost(t);

/** Posts da semana de uma tarefa "Produzir semana", por data. */
export function postsDaProducao(producao) {
  return dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && !ehAvulso(t) && cobre(producao, t))
    .sort((a, b) => (dataDoPost(a) + (a.hora || "")).localeCompare(dataDoPost(b) + (b.hora || "")));
}

/** Vídeos da semana SEGUINTE à da produção: o roteiro deles é feito agora (campo `roteiroPronto` no post). */
export function roteirosDaProducao(producao) {
  const seguinte = { ...producao, semanaInicio: addDias(producao.semanaInicio, 7) };
  return dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && t.formato === FORMATO_VIDEO && !t.videoGravado && !ehAvulso(t) && cobre(seguinte, t))
    .sort((a, b) => dataDoPost(a).localeCompare(dataDoPost(b)));
}

/** Posts da produção que publicam em até 2 dias e ainda não foram produzidos. */
export const postsAtrasando = (producao, hoje) => postsDaProducao(producao)
  .filter((t) => !t.produzido && t.statusConteudo !== "publicado" && dataDoPost(t) <= addDias(hoje, 2));
