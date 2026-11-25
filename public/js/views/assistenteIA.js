// Janela "Criar com IA": escolhe o que criar, copia o pedido completo (ia.js) e abre a IA da pessoa (Claude ou ChatGPT);
// depois a pessoa cola a resposta e o app distribui pelos campos. Quem é da equipe com Conteúdo e tem a chave da
// OpenAI também pode escrever aqui dentro.
import { el, avisar, abrirModal } from "../ui.js";
import { identidade } from "../db.js";
import { REDES } from "../constantes.js";
import { ehCliente, pode } from "../permissoes.js";
import { temChave, gerarTexto } from "../openai.js";
import { montarPedido, completudeMarca, lerResposta, IAS, iaPreferida, guardarIaPreferida, levarParaIA } from "../ia.js";

export const ROTULOS_TIPO = {
  copy: "Legenda (copy)", roteiro: "Roteiro do vídeo", carrossel: "Lâminas do carrossel", stories: "Sequência de stories",
  adaptar: "Adaptar para outra rede", anuncio: "Anúncio (tráfego pago)", imagem: "Imagem (ChatGPT)", comentarios: "Responder comentários",
  ideias: "Ideias de posts", planejamento: "Planejamento do mês"
};

/** Tipo mais provável para o formato do post. */
export const tipoDoFormato = (formato) => ({ "Vídeo": "roteiro", "Carrossel": "carrossel", "Story": "stories" })[formato] || "copy";

/** Barra "Ficha da marca 70%" com o que falta. */
export function medidorMarca(clienteId, marcaId = "", { compacto = false } = {}) {
  if (!clienteId) return null;
  const { pct, faltando } = completudeMarca(clienteId, marcaId);
  const nivel = pct >= 80 ? "bom" : pct >= 50 ? "medio" : "baixo";
  return el("div", { class: `medidor-marca ${nivel}`, title: faltando.length ? `Falta: ${faltando.join(", ")}` : "Ficha completa" },
    el("div", { class: "medidor-topo" }, el("strong", {}, `Ficha da marca para a IA: ${pct}%`),
      compacto || !faltando.length ? null : el("span", { class: "subtitulo" }, `Falta: ${faltando.join(", ")}`)),
    el("div", { class: "medidor-barra", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 }, el("span", { style: { width: `${pct}%` } })));
}

/**
 * Abre o assistente.
 * ctx: { clienteId, marcaId, post }, tipos: lista de tipos oferecidos (o primeiro vem marcado),
 * aoUsar(resposta lida, textoBruto, tipo): chamado ao clicar em "Usar resposta".
 */
export function abrirAssistenteIA({ ctx, tipos = ["copy"], aoUsar = null, titulo = "Criar com IA" }) {
  if (!ctx?.clienteId) { avisar("Escolha o cliente primeiro.", "erro"); return; }
  let tipo = tipos[0];
  let ia = iaPreferida();
  const extra = { ...(ctx.extra || {}) };
  const nomeMarca = identidade(ctx.clienteId, ctx.marcaId || undefined).nome || "";
  const resposta = el("textarea", { rows: 8, id: "ia-resposta", placeholder: "Cole aqui a resposta inteira da IA" });
  const verPedido = el("pre", { class: "pedido-ia" });
  const camposExtra = el("div", { class: "campos-extra-ia" });
  const passo2 = el("div", { class: "passo-ia" });

  const desenharExtra = () => {
    const campo = (nome, rotulo, entrada) => { entrada.id = `ia-${nome}`; entrada.addEventListener("input", (e) => { extra[nome] = e.target.value; }); entrada.addEventListener("change", (e) => { extra[nome] = e.target.value; }); return el("label", { class: "campo" }, el("span", {}, rotulo), entrada); };
    const itens = {
      adaptar: [campo("redeNova", "Para qual rede?", el("select", {}, REDES.filter((r) => r !== ctx.post?.rede).map((r) => el("option", { value: r, selected: r === extra.redeNova }, r))))],
      comentarios: [campo("comentarios", "Cole os comentários (um por linha)", el("textarea", { rows: 4 }, extra.comentarios || ""))],
      imagem: [campo("descricao", "O que a imagem deve mostrar?", el("input", { type: "text", value: extra.descricao || ctx.post?.titulo || "", placeholder: "Ex.: aluna sorrindo na bike, aula cheia ao fundo" })),
        campo("texto", "Texto escrito na imagem (deixe vazio para pôr no Canva)", el("input", { type: "text", value: extra.texto || "" }))]
    }[tipo] || [];
    if (tipo === "adaptar") { extra.redeNova ||= REDES.find((r) => r !== ctx.post?.rede) || ""; extra.original ||= [ctx.post?.copy, ctx.post?.textoArte].filter(Boolean).join("\n\n"); }
    if (tipo === "imagem") extra.descricao ??= ctx.post?.titulo || "";
    camposExtra.replaceChildren(...itens);
    passo2.hidden = tipo === "imagem";
  };
  const pedido = () => montarPedido(tipo, { ...ctx, extra });

  const escolhaTipo = tipos.length > 1 ? el("div", { class: "botoes-escolha", role: "radiogroup", "aria-label": "O que criar" }, tipos.map((t) => {
    const b = el("button", { type: "button", role: "radio", "aria-checked": String(t === tipo), class: `escolha ${t === tipo ? "ativo" : ""}`, onClick: () => {
      tipo = t;
      escolhaTipo.querySelectorAll("button").forEach((x) => { const sim = x === b; x.classList.toggle("ativo", sim); x.setAttribute("aria-checked", String(sim)); });
      atualizarBotaoIA(); desenharExtra();
    } }, ROTULOS_TIPO[t] || t);
    return b;
  })) : null;

  const botaoAbrir = el("button", { type: "button", class: "destaque", onClick: async () => {
    const copiou = await levarParaIA(pedido(), tipo === "imagem" ? "chatgpt" : ia);
    avisar(copiou ? `Pedido copiado! Na ${tipo === "imagem" ? "ChatGPT" : IAS[ia][0]}, cole com Ctrl+V (ou segure e "Colar" no celular).` : "Não consegui copiar sozinho: abra \"Ver o pedido\" e copie.", copiou ? "ok" : "erro");
    if (!passo2.hidden) setTimeout(() => resposta.focus(), 300);
  } });
  const atualizarBotaoIA = () => { botaoAbrir.textContent = tipo === "imagem" ? "1. Copiar pedido e abrir o ChatGPT" : `1. Copiar pedido e abrir o ${IAS[ia][0]}`; escolhaIA.hidden = tipo === "imagem"; };
  const escolhaIA = el("div", { class: "botoes-escolha mini", role: "radiogroup", "aria-label": "Qual IA" }, Object.entries(IAS).map(([v, [nome]]) => {
    const b = el("button", { type: "button", role: "radio", "aria-checked": String(v === ia), class: `escolha ${v === ia ? "ativo" : ""}`, onClick: () => {
      ia = v; guardarIaPreferida(v);
      escolhaIA.querySelectorAll("button").forEach((x) => { const sim = x === b; x.classList.toggle("ativo", sim); x.setAttribute("aria-checked", String(sim)); });
      atualizarBotaoIA();
    } }, nome);
    return b;
  }));
  const aqui = !ehCliente() && pode("conteudo") && temChave() && tipo !== "imagem";
  const botaoAqui = aqui ? el("button", { type: "button", class: "secundario", onClick: async () => {
    botaoAqui.disabled = true; const r = botaoAqui.textContent; botaoAqui.textContent = "Escrevendo…";
    try { resposta.value = await gerarTexto({ sistema: "Siga exatamente o pedido e o formato de resposta pedido.", pedido: pedido() }); avisar("Pronto. Confira e clique em Usar resposta."); }
    catch (e) { avisar(e.message, "erro"); }
    botaoAqui.disabled = false; botaoAqui.textContent = r;
  } }, "Escrever aqui (OpenAI)") : null;

  const semBriefing = ctx.post && !ctx.post.roteiro && !["ideias", "planejamento", "comentarios"].includes(tipo)
    ? el("p", { class: "faixa-alerta" }, "Sem briefing: a IA vai usar só o tema e a marca. Para um resultado melhor, preencha o briefing (ou use \"Montar briefing\").") : null;

  passo2.append(
    el("h3", {}, "2. Cole a resposta aqui"),
    el("p", { class: "subtitulo" }, "Copie tudo o que a IA respondeu e cole abaixo. O app coloca cada parte no lugar certo."),
    resposta,
    aoUsar ? el("div", { class: "acoes" }, el("button", { type: "button", class: "confirmar", onClick: () => {
      if (!resposta.value.trim()) { avisar("Cole a resposta da IA primeiro.", "erro"); return; }
      aoUsar(lerResposta(resposta.value), resposta.value, tipo);
      fechar();
    } }, "Usar resposta")) : null);

  const fechar = abrirModal(`${titulo}${nomeMarca ? ` · ${nomeMarca}` : ""}`, el("div", { class: "assistente-ia" },
    medidorMarca(ctx.clienteId, ctx.marcaId),
    escolhaTipo ? el("h3", {}, "O que você quer criar?") : null, escolhaTipo,
    camposExtra,
    semBriefing,
    el("h3", {}, "1. Leve o pedido para a sua IA"),
    el("p", { class: "subtitulo" }, "O pedido já vai com o jeito Hyper de escrever, a identidade da marca, exemplos aprovados e os detalhes deste conteúdo."),
    el("div", { class: "linha-ia" }, escolhaIA, botaoAbrir, botaoAqui),
    el("details", { onToggle: (e) => { if (e.target.open) verPedido.textContent = pedido(); } }, el("summary", {}, "Ver o pedido"), verPedido),
    el("p", { class: "nota imagem-nota", hidden: true }, "A imagem fica no ChatGPT: baixe e anexe nos Criativos do post."),
    passo2), { largo: true });
  // nota da imagem acompanha o tipo
  const notaImagem = document.querySelector(".assistente-ia .imagem-nota");
  const antigo = desenharExtra;
  const desenhar = () => { antigo(); if (notaImagem) notaImagem.hidden = tipo !== "imagem"; };
  escolhaTipo?.querySelectorAll("button").forEach((b) => b.addEventListener("click", desenhar));
  atualizarBotaoIA();
  desenhar();
  return fechar;
}
