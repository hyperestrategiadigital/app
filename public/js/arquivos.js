// Arquivos guardados dentro do Firestore (sem Firebase Storage): imagens comprimidas e fontes pequenas.
// Cada arquivo é um documento com o conteúdo em base64 (limite do Firestore: 1 MB por documento).
import { listarSub, salvarSub, excluirSub } from "./db.js";

export const LIMITE_BYTES = 700 * 1024; // ~930 KB depois do base64

export const caminhoArquivos = (clienteId) => ["clientes", clienteId, "arquivos"];
export const caminhoArtes = (clienteId) => ["clientes", clienteId, "artes"];

const cache = new Map(); // clienteId -> Promise<lista de arquivos>

export function listarArquivos(clienteId, { recarregar = false } = {}) {
  if (recarregar || !cache.has(clienteId)) cache.set(clienteId, listarSub(caminhoArquivos(clienteId)).catch((e) => { cache.delete(clienteId); throw e; }));
  return cache.get(clienteId);
}

export async function salvarArquivo(clienteId, valores) {
  const tamanho = Math.round((valores.dados.length * 3) / 4);
  if (tamanho > LIMITE_BYTES) throw new Error(`Arquivo grande demais (${Math.round(tamanho / 1024)} KB). O limite é ${LIMITE_BYTES / 1024} KB.`);
  const id = await salvarSub(caminhoArquivos(clienteId), valores);
  cache.delete(clienteId);
  return id;
}

export async function excluirArquivo(clienteId, id) {
  await excluirSub(caminhoArquivos(clienteId), id);
  cache.delete(clienteId);
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

/** Reduz a imagem para caber no banco. PNG mantém transparência (logos); o resto vira JPEG. */
export async function comprimirImagem(origem, { maxLado = 1600, qualidade = 0.82, manterPNG = false } = {}) {
  const src = typeof origem === "string" ? origem : await lerComoDataURL(origem);
  const img = await carregarImagem(src);
  let lado = maxLado;
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * escala);
    c.height = Math.round(img.naturalHeight * escala);
    const ctx = c.getContext("2d");
    if (!manterPNG) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const url = manterPNG ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", qualidade);
    if ((url.length * 3) / 4 <= LIMITE_BYTES) return url;
    lado = Math.round(lado * 0.75);
    qualidade = Math.max(0.6, qualidade - 0.06);
  }
  throw new Error("Não consegui reduzir a imagem o suficiente.");
}

/** Registra as fontes do cliente no navegador para usar no editor. Retorna os nomes de família. */
const fontesCarregadas = new Set();
export async function carregarFontesCliente(clienteId) {
  const arquivos = await listarArquivos(clienteId);
  const familias = [];
  for (const f of arquivos.filter((a) => a.tipo === "fonte")) {
    const familia = `cliente-${f.id}`;
    familias.push({ familia, nome: f.nome });
    if (fontesCarregadas.has(familia)) continue;
    try {
      const face = new FontFace(familia, `url(${f.dados})`);
      document.fonts.add(await face.load());
      fontesCarregadas.add(familia);
    } catch (e) { console.warn("Fonte não carregou:", f.nome, e); }
  }
  return familias;
}
