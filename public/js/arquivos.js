// Criativos (imagens) anexados aos posts, guardados dentro do Firestore (sem Firebase Storage).
// Cada imagem é um documento em espacos/hyper/clientes/{clienteId}/artes, comprimida para caber no limite de 1 MB.
// Os arquivos da marca (logos, fontes, referências) ficam na pasta do Drive do cliente, não aqui.
import { listarSub, salvarSub, excluirSub, atualizar, porId } from "./db.js";
import { eu, marcasRestritas } from "./permissoes.js";

export const LIMITE_BYTES = 700 * 1024; // ~930 KB depois do base64

export const caminhoArtes = (clienteId) => ["clientes", clienteId || "sem-cliente", "artes"];

const cache = new Map(); // clienteId -> Promise<lista de artes>
export function listarArtesCliente(clienteId, { recarregar = false } = {}) {
  if (recarregar || !cache.has(clienteId)) {
    cache.set(clienteId, listarSub(caminhoArtes(clienteId), { marcas: marcasRestritas() ? eu.marcas : null }).catch((e) => { cache.delete(clienteId); throw e; }));
  }
  return cache.get(clienteId);
}
export async function listarArtesTarefa(clienteId, tarefaId) {
  return (await listarArtesCliente(clienteId)).filter((a) => a.tarefaId === tarefaId).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

async function contarArtes(clienteId, tarefaId) {
  const n = (await listarArtesTarefa(clienteId, tarefaId)).length;
  if (porId("tarefas", tarefaId)) await atualizar("tarefas", tarefaId, { qtdArtes: n });
}

/** origem: "final" (criativo pronto, ex.: exportado do Canva). "gerada" só nos antigos, da geração de imagem que saiu. */
export async function salvarArte(clienteId, tarefaId, dados, { origem = "final", nome = "" } = {}) {
  // marcaId do post: o cliente que vê só algumas marcas lê os criativos filtrados por ele
  await salvarSub(caminhoArtes(clienteId), { tarefaId, marcaId: porId("tarefas", tarefaId)?.marcaId || "", dados, origem, nome });
  cache.delete(clienteId);
  await contarArtes(clienteId, tarefaId);
}

export async function excluirArte(clienteId, tarefaId, id) {
  await excluirSub(caminhoArtes(clienteId), id);
  cache.delete(clienteId);
  await contarArtes(clienteId, tarefaId);
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
