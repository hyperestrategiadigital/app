// Criativos (imagens) anexados aos posts, guardados dentro do Firestore (sem Firebase Storage).
// Cada imagem é um documento em espacos/hyper/clientes/{clienteId}/artes, comprimida para caber no limite de 1 MB.
// Os arquivos da marca (logos, fontes, referências) ficam na pasta do Drive do cliente, não aqui.
import { listarSub, lerSub, salvarSub, excluirSub, atualizar, porId, dados } from "./db.js";
import { eu, marcasRestritas } from "./permissoes.js";

export const LIMITE_BYTES = 700 * 1024; // ~930 KB depois do base64

export const caminhoArtes = (clienteId) => ["clientes", clienteId || "sem-cliente", "artes"];

// O post guarda os ids dos criativos dele (`artes: [ids]`): abrir um post lê só esses documentos,
// sem baixar as imagens do cliente inteiro. Posts antigos sem `artes` caem na leitura da subcoleção
// (e `indexarArtes()` grava os ids neles na primeira vez que um administrador entra).
const cache = new Map(); // tarefaId -> Promise<lista de artes>
// Ordem dos criativos = a ordem de `artes` no post (a ordem em que foram anexados, ou a que a equipe arrumou):
// é a ordem do carrossel, do PDF e do link de aprovação. Posts antigos sem `artes`: do mais antigo para o mais novo.
const naOrdemAnexada = (a, b) => (a.criadoEm || 0) - (b.criadoEm || 0);

/** Todos os criativos de um cliente (só para mover entre clientes e para posts antigos sem `artes`). */
export const listarArtesCliente = (clienteId) => listarSub(caminhoArtes(clienteId), { marcas: marcasRestritas() ? eu.marcas : null });

export function listarArtesTarefa(clienteId, tarefaId, { recarregar = false } = {}) {
  if (recarregar || !cache.has(tarefaId)) {
    const post = porId("tarefas", tarefaId);
    const ler = Array.isArray(post?.artes)
      ? Promise.all(post.artes.map((id) => lerSub(caminhoArtes(clienteId), id).catch(() => null))).then((l) => l.filter(Boolean))
      : listarArtesCliente(clienteId).then((l) => l.filter((a) => a.tarefaId === tarefaId).sort(naOrdemAnexada));
    cache.set(tarefaId, ler.catch((e) => { cache.delete(tarefaId); throw e; }));
  }
  return cache.get(tarefaId);
}

/** Todos os criativos de cada post da lista, na ordem do post (link de aprovação): { tarefaId: [dataURL, …] }. */
export async function artesNaOrdem(posts) {
  const pares = await Promise.all(posts.filter((t) => t.qtdArtes > 0)
    .map(async (t) => [t.id, (await listarArtesTarefa(t.clienteId, t.id).catch(() => [])).map((a) => a.dados).filter(Boolean)]));
  return Object.fromEntries(pares.filter(([, l]) => l.length));
}

/** Muda a posição de um criativo no post (delta -1 = para a esquerda, +1 = para a direita). */
export async function moverArte(clienteId, tarefaId, id, delta) {
  const ids = (await listarArtesTarefa(clienteId, tarefaId)).map((a) => a.id);
  const i = ids.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  cache.delete(tarefaId);
  await gravarIds(tarefaId, ids);
}

/** Primeiro criativo de cada post da lista (a capa, para o PDF): { tarefaId: dataURL }. */
export async function artePrincipal(posts) {
  const pares = await Promise.all(posts.filter((t) => t.qtdArtes > 0)
    .map(async (t) => [t.id, (await listarArtesTarefa(t.clienteId, t.id).catch(() => []))[0]?.dados]));
  return Object.fromEntries(pares.filter(([, d]) => d));
}

/** Grava no post os ids e a quantidade de criativos. */
async function gravarIds(tarefaId, ids) {
  if (porId("tarefas", tarefaId)) await atualizar("tarefas", tarefaId, { artes: ids, qtdArtes: ids.length });
}

/** origem: "final" (criativo pronto, ex.: exportado do Canva). "gerada" só nos antigos, da geração de imagem que saiu. */
export async function salvarArte(clienteId, tarefaId, dados, { origem = "final", nome = "" } = {}) {
  const antes = (await listarArtesTarefa(clienteId, tarefaId).catch(() => [])).map((a) => a.id);
  // marcaId do post: o cliente que vê só algumas marcas lê os criativos filtrados por ele
  const id = await salvarSub(caminhoArtes(clienteId), { tarefaId, marcaId: porId("tarefas", tarefaId)?.marcaId || "", dados, origem, nome });
  cache.delete(tarefaId);
  await gravarIds(tarefaId, [...antes, id]);
}

export async function excluirArte(clienteId, tarefaId, id) {
  const antes = (await listarArtesTarefa(clienteId, tarefaId).catch(() => [])).map((a) => a.id);
  await excluirSub(caminhoArtes(clienteId), id);
  cache.delete(tarefaId);
  await gravarIds(tarefaId, antes.filter((x) => x !== id));
}

/**
 * Posts antigos com criativos e sem `artes` (admin, ao entrar): lê a subcoleção do cliente uma vez e grava os ids.
 * Depois disso nenhum post precisa mais da leitura do cliente inteiro.
 */
export async function indexarArtes() {
  const semIds = dados.tarefas.filter((t) => t.qtdArtes > 0 && !Array.isArray(t.artes));
  for (const clienteId of new Set(semIds.map((t) => t.clienteId || ""))) {
    const artes = await listarSub(caminhoArtes(clienteId)).catch(() => null);
    if (!artes) continue;
    for (const t of semIds.filter((x) => (x.clienteId || "") === clienteId)) {
      await gravarIds(t.id, artes.filter((a) => a.tarefaId === t.id).sort(naOrdemAnexada).map((a) => a.id)).catch(() => {});
    }
  }
}

/** Dias que os criativos de um post publicado ficam guardados depois da data de publicação (o texto do post fica). */
export const DIAS_CRIATIVOS = 7;

/**
 * Faxina dos criativos (admin, uma vez por dia neste navegador): apaga as imagens dos posts publicados há mais de
 * DIAS_CRIATIVOS dias. O post (texto, copy, etapa) continua; a arte final segue no Canva/Drive.
 */
export async function limparCriativosPublicados(hoje = new Date()) {
  const dia = hoje.toISOString().slice(0, 10);
  try { if (localStorage.getItem("hyper-faxina-criativos") === dia) return 0; } catch {}
  const limite = new Date(hoje.getTime() - DIAS_CRIATIVOS * 86400000).toISOString().slice(0, 10);
  const posts = dados.tarefas.filter((t) => t.qtdArtes > 0 && t.statusConteudo === "publicado" && (t.dataPublicacao || t.prazo || "") && (t.dataPublicacao || t.prazo) < limite);
  let apagados = 0;
  for (const t of posts) {
    const artes = await listarArtesTarefa(t.clienteId, t.id, { recarregar: true }).catch(() => []);
    for (const a of artes) { await excluirSub(caminhoArtes(t.clienteId), a.id).catch(() => {}); apagados++; }
    cache.delete(t.id);
    await gravarIds(t.id, []).catch(() => {});
  }
  try { localStorage.setItem("hyper-faxina-criativos", dia); } catch {}
  return apagados;
}

export const lerComoDataURL = (arquivo) => new Promise((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => erro(r.error);
  r.readAsDataURL(arquivo);
});

export const carregarImagem = (src) => new Promise((ok, erro) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => erro(new Error("Não consegui abrir a imagem."));
  img.src = src;
});

/** Reduz a imagem (JPEG) até caber no banco. */
export async function comprimirImagem(origem, { maxLado = 1600, qualidade = 0.85, png = false } = {}) {
  const src = typeof origem === "string" ? origem : await lerComoDataURL(origem);
  const img = await carregarImagem(src);
  let lado = maxLado;
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * escala);
    c.height = Math.round(img.naturalHeight * escala);
    const ctx = c.getContext("2d");
    // PNG mantém o fundo transparente (logos); JPEG vai com fundo branco (fotos e criativos)
    if (!png) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const url = png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", qualidade);
    if ((url.length * 3) / 4 <= LIMITE_BYTES) return url;
    lado = Math.round(lado * 0.8);
    qualidade = Math.max(0.6, qualidade - 0.05);
  }
  throw new Error("Não consegui reduzir a imagem o suficiente.");
}
