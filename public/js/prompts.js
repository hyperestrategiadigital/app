// Textos enviados às IAs: copy (Claude) e imagem (OpenAI). Tudo usa o que está na ficha do cliente.
import { porId } from "./db.js";
import { fmtData } from "./ui.js";

const ehVertical = (f) => /story|reels|tiktok|vídeo|video/i.test(f || "");

export function promptCopy(post) {
  const c = porId("clientes", post.clienteId) || {};
  const linhas = [
    `Você é copywriter da Hyper, agência de tráfego pago e social media. Escreva a copy de um conteúdo para o cliente ${c.nome || "(sem cliente)"}.`,
    "",
    "## Sobre o cliente",
    c.tomDeVoz ? `- Tom de voz: ${c.tomDeVoz}` : "- Tom de voz: não informado (use um tom próximo e profissional)",
    c.publico ? `- Público-alvo: ${c.publico}` : null,
    c.persona ? `- Persona: ${c.persona}` : null,
    c.instagram ? `- Instagram: ${c.instagram}` : null,
    c.observacoes ? `- Observações: ${c.observacoes}` : null,
    "",
    "## Sobre a peça",
    `- Tema: ${post.titulo || "(sem tema)"}`,
    `- Formato: ${post.formato || "-"} · Rede: ${post.rede || "-"}`,
    post.dataPublicacao ? `- Publicação: ${fmtData(post.dataPublicacao)}${post.hora ? ` às ${post.hora}` : ""}` : null,
    post.objetivo ? `- Objetivo: ${post.objetivo}` : null,
    post.roteiro ? `- Briefing / roteiro:\n${post.roteiro}` : null,
    "",
    "## O que entregar",
    post.formato === "Carrossel" ? "- Texto de cada lâmina (capa forte + 5 a 8 lâminas + lâmina final com CTA)" : null,
    ehVertical(post.formato) ? "- Gancho dos 3 primeiros segundos e roteiro curto" : null,
    post.formato === "WhatsApp" ? "- Mensagem curta para lista de transmissão, com CTA claro" : null,
    "- Texto curto para aplicar na arte (título de até 8 palavras + linha de apoio)",
    "- Legenda pronta para publicar, com chamada para ação",
    /Instagram|TikTok/.test(post.rede || "") ? "- 5 a 10 hashtags relevantes" : null,
    "- 3 opções de primeira linha (gancho) para eu escolher",
    "",
    "Escreva em português do Brasil."
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

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
    `Crie no Canva uma arte para o cliente ${cliente.nome || "(sem cliente)"} usando a imagem que anexei nesta mensagem como fundo.`,
    "",
    "## Peça",
    `- Formato: ${formato || post.formato || "Feed estático"} (${tamanho ? `${tamanho[0]}×${tamanho[1]} px` : "1080×1350 px"})`,
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
