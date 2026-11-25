// Textos enviados às IAs: copy (Claude) e imagem (OpenAI). Usam a identidade da marca do post
// (ou do cliente, quando o post não é de uma marca específica).
import { identidade } from "./db.js";
import { fmtData } from "./ui.js";

import { montarPedido, lerResposta, pilaresDe } from "./ia.js";
export { pilaresDe };
const ehVertical = (f) => /story|reels|tiktok|vídeo|video/i.test(f || "");

/**
 * Pedido de copy (motor em ia.js: manual da Hyper + marca + exemplos aprovados + o post).
 * `soLegenda` é para escrever direto no campo: quem chama lê o bloco [LEGENDA] da resposta com `legendaDaResposta`.
 */
export function promptCopy(post, { soLegenda = false } = {}) {
  return montarPedido("copy", { clienteId: post.clienteId, marcaId: post.marcaId || "", post });
}
export const legendaDaResposta = (texto) => lerResposta(texto).LEGENDA || String(texto || "").trim();

/** Prompt de imagem: só a imagem, SEM texto escrito (o texto é aplicado depois no editor ou no Canva). */
export function promptImagem({ cliente = {}, descricao, formato, espacoTexto = "base", extra = "" }) {
  const paleta = (cliente.paleta || []).filter(Boolean);
  const partes = [
    descricao,
    cliente.estiloVisual ? `Estilo visual da marca: ${cliente.estiloVisual}.` : null,
    paleta.length ? `Use como cores predominantes: ${paleta.join(", ")}.` : null,
    cliente.publico ? `Público da marca: ${cliente.publico}.` : null,
    extra || null,
    `Formato ${ehVertical(formato) ? "vertical (stories/reels)" : "para feed do Instagram"}.`,
    espacoTexto !== "nenhum" ? `Deixe uma área limpa e sem elementos importantes na parte ${espacoTexto === "topo" ? "de cima" : espacoTexto === "centro" ? "central" : "de baixo"} da imagem, para aplicar texto depois.` : null,
    "Não escreva nenhum texto, letra, número, logotipo ou marca d'água na imagem.",
    "Fotografia/arte de alta qualidade, pronta para publicidade em redes sociais."
  ];
  return partes.filter(Boolean).join(" ");
}

/** Pedido para o Claude (com o conector do Canva) montar a arte com a imagem gerada e devolver o link de edição. */
export function promptCanva({ post = {}, cliente = {}, formato, tamanho, texto = {} }) {
  const paleta = (cliente.paleta || []).filter(Boolean);
  const linhas = [
    `Crie no Canva uma arte para ${cliente.marcaId ? `a marca ${cliente.nome} (cliente ${cliente.clienteNome})` : `o cliente ${cliente.nome || "(sem cliente)"}`} usando a imagem que anexei nesta mensagem como fundo.`,
    "",
    "## Peça",
    `- Formato: ${formato || post.formato || "Estático"} (${tamanho ? `${tamanho[0]}×${tamanho[1]} px` : "1080×1350 px"})`,
    post.titulo ? `- Tema do post: ${post.titulo}` : null,
    post.dataPublicacao ? `- Publicação: ${fmtData(post.dataPublicacao)}${post.hora ? ` às ${post.hora}` : ""}` : null,
    post.objetivo ? `- Objetivo: ${post.objetivo}` : null,
    "",
    "## Texto da arte (sugestão, pode ajustar o tamanho e a quebra)",
    texto.titulo ? `- Título: ${texto.titulo}` : "- Título: crie um título curto a partir do tema",
    texto.apoio ? `- Linha de apoio: ${texto.apoio}` : null,
    texto.cta ? `- Botão/CTA: ${texto.cta}` : null,
    texto.observacoes ? `- Observações de layout: ${texto.observacoes}` : null,
    "",
    "## Marca",
    cliente.linkDrive ? `- Pasta da marca no Drive (logos, fontes, referências): ${cliente.linkDrive} — use o logo dessa pasta.` : "- Sem pasta do Drive cadastrada: não use logo.",
    paleta.length ? `- Paleta: ${paleta.join(", ")}` : null,
    cliente.fontes ? `- Fontes: ${cliente.fontes}` : null,
    cliente.identidadeVisual ? `- Diagramação: ${cliente.identidadeVisual}` : null,
    cliente.tomDeVoz ? `- Tom de voz: ${cliente.tomDeVoz}` : null,
    "",
    post.copy ? `## Copy/legenda do post (referência)\n${post.copy}\n` : null,
    "Deixe a arte editável (textos como camadas de texto, não imagem). No final, me mande o link de edição do design no Canva para eu finalizar."
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

/** Contexto da marca para os pedidos do Studio (identidade completa, sem dados internos). */
function contextoMarca(c) {
  const paleta = (c.paleta || []).filter(Boolean);
  return [
    c.marcaId && c.clienteNome ? `Marca: ${c.nome} (do grupo ${c.clienteNome})` : `Marca: ${c.nome || "(sem nome)"}`,
    c.descricao ? `- O que é: ${c.descricao}` : null,
    c.tomDeVoz ? `- Tom de voz: ${c.tomDeVoz}` : null,
    c.publico ? `- Público-alvo: ${c.publico}` : null,
    c.persona ? `- Persona: ${c.persona}` : null,
    c.pilares ? `- Pilares de conteúdo: ${pilaresDe(c).join(", ")}` : null,
    c.estiloVisual ? `- Estilo de imagem: ${c.estiloVisual}` : null,
    c.identidadeVisual ? `- Diagramação: ${c.identidadeVisual}` : null,
    paleta.length ? `- Cores: ${paleta.join(", ")}` : null,
    c.fontes ? `- Fontes: ${c.fontes}` : null,
    c.instagram ? `- Instagram: ${c.instagram}` : null,
    c.diretrizes ? `\n## Diretrizes de conteúdo (siga à risca)\n${c.diretrizes}` : null
  ].filter(Boolean).join("\n");
}

/** Studio fotográfico: roteiro de fotos na direção da marca. */
export function promptFotos(c, { assunto = "", formato = "", local = "", quantidade = 8 } = {}) {
  return [
    `Você é diretor de fotografia da Hyper Estratégia Digital. Monte um roteiro de fotos para a marca abaixo, que a própria equipe da marca vai fotografar com o celular.`,
    "",
    "## Sobre a marca",
    contextoMarca(c),
    "",
    "## Sessão",
    `- O que fotografar: ${assunto || "fotos do dia a dia da marca para as redes sociais"}`,
    formato ? `- Onde vai usar: ${formato} (${ehVertical(formato) ? "vertical 9:16" : "feed 4:5"})` : null,
    local ? `- Local / ambiente: ${local}` : null,
    "",
    "## O que eu quero",
    `1. Uma lista de ${quantidade} fotos (plano, enquadramento, o que aparece, pose/ação, luz), numeradas, cada uma em uma ou duas linhas.`,
    "2. Como deixar as fotos com a cara da marca (cores no cenário e na roupa, objetos, clima).",
    "3. O que evitar.",
    "4. Dicas rápidas de celular (luz, limpeza da lente, modo retrato, espaço livre para texto).",
    "Escreva em português do Brasil, simples e direto, para alguém que não é fotógrafo."
  ].filter((l) => l !== null).join("\n");
}

/** Studio: ideias de conteúdo na linha editorial da marca. */
export function promptIdeias(c, { quantidade = 10, foco = "", mes = "", jaPlanejados = [] } = {}) {
  return [
    `Você é estrategista de conteúdo da Hyper Estratégia Digital. Sugira ${quantidade} ideias de posts para a marca abaixo.`,
    "",
    "## Sobre a marca",
    contextoMarca(c),
    "",
    "## Pedido",
    foco ? `- Foco / objetivo: ${foco}` : null,
    mes ? `- Mês: ${mes} (considere datas comemorativas relevantes para este público)` : null,
    jaPlanejados.length ? `- Já planejados (não repita): ${jaPlanejados.slice(0, 30).join("; ")}` : null,
    "",
    "Para cada ideia, uma linha no formato: Formato | Tema | Gancho (primeira frase) | Por que funciona.",
    "Use só estes formatos: Estático, Carrossel, Vídeo, Story. Varie os formatos e siga as diretrizes da marca."
  ].filter((l) => l !== null).join("\n");
}
