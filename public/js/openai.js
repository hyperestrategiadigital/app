// Geração de imagem com a API da OpenAI, direto do navegador.
// A chave fica salva só na conta do usuário no Firestore (users/{uid}/config/openai), protegida pelas regras.
import { dados, salvarComId } from "./db.js";

export const MODELO_PADRAO = "gpt-image-1";

export const configOpenAI = () => dados.config.find((c) => c.id === "openai") || {};
export const temChave = () => !!configOpenAI().chave;

export function salvarConfigOpenAI({ chave, modelo }) {
  return salvarComId("config", "openai", { chave: chave.trim(), modelo: (modelo || MODELO_PADRAO).trim(), atualizadoEm: Date.now() });
}

/** Tamanho aceito pela API mais próximo da proporção do formato. */
export function tamanhoAPI([w, h]) {
  if (Math.abs(w - h) < 50) return "1024x1024";
  return h > w ? "1024x1536" : "1536x1024";
}

async function tratarResposta(r) {
  let corpo = null;
  try { corpo = await r.json(); } catch {}
  if (!r.ok) {
    const msg = corpo?.error?.message || `Erro ${r.status}`;
    if (r.status === 401) throw new Error("Chave da OpenAI inválida. Confira em Ajustes.");
    if (r.status === 429) throw new Error("Limite ou saldo da OpenAI atingido: " + msg);
    if (/organization must be verified/i.test(msg)) throw new Error("A OpenAI exige verificar sua organização para usar este modelo de imagem (platform.openai.com → Settings → Organization → Verify). " + msg);
    throw new Error(msg);
  }
  const item = corpo?.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new Error("A OpenAI não devolveu imagem.");
}

/**
 * Gera uma imagem. Se `referencias` (dataURLs) vierem, usa o endpoint de edição, que aceita imagens de referência.
 * qualidade: low | medium | high
 */
export async function gerarImagem({ prompt, tamanho = "1024x1536", qualidade = "medium", referencias = [] }) {
  const { chave, modelo = MODELO_PADRAO } = configOpenAI();
  if (!chave) throw new Error("Cadastre sua chave da OpenAI em Ajustes.");
  const cabecalhos = { Authorization: `Bearer ${chave}` };

  if (referencias.length) {
    const form = new FormData();
    form.append("model", modelo);
    form.append("prompt", prompt);
    form.append("size", tamanho);
    form.append("quality", qualidade);
    for (const [i, ref] of referencias.slice(0, 4).entries()) {
      const blob = await (await fetch(ref)).blob();
      form.append("image[]", blob, `referencia-${i + 1}.${blob.type.includes("png") ? "png" : "jpg"}`);
    }
    return tratarResposta(await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: cabecalhos, body: form }));
  }
  return tratarResposta(await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { ...cabecalhos, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, prompt, size: tamanho, quality: qualidade, n: 1 })
  }));
}
