// Janela "Criar copy": copia o pedido completo (ia.js) e abre a IA da pessoa (Claude ou ChatGPT);
// depois a pessoa cola a resposta e o app distribui pelos campos. É o único uso de IA na plataforma:
// o app não chama nenhuma IA, só monta o pedido.
import { el, avisar, abrirModal } from "../ui.js";
import { identidade } from "../db.js";
import { montarPedido, completudeMarca, lerResposta, IAS, iaPreferida, guardarIaPreferida, levarParaIA, tipoDoPedido } from "../ia.js";

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
 * Abre o assistente de copy do post.
 * ctx: { clienteId, marcaId, post }. O pedido segue o formato do post (`tipoDoPedido` em ia.js: legenda, roteiro,
 * lâminas, stories, anúncio, artigo, e-mail, WhatsApp, vídeo já gravado) ou é um texto livre numa tarefa que não é post.
 * aoUsar(resposta lida, textoBruto): chamado ao clicar em "Usar resposta".
 */
export function abrirAssistenteIA({ ctx, aoUsar = null, titulo = "Criar copy" }) {
  if (!ctx?.clienteId) { avisar("Escolha o cliente primeiro.", "erro"); return; }
  const tipo = tipoDoPedido(ctx.post);
  let ia = iaPreferida();
  const nomeMarca = identidade(ctx.clienteId, ctx.marcaId || undefined).nome || "";
  const resposta = el("textarea", { rows: 8, id: "ia-resposta", placeholder: "Cole aqui a resposta inteira da IA" });
  const verPedido = el("pre", { class: "pedido-ia" });
  const pedido = () => montarPedido(tipo, ctx);

  const botaoAbrir = el("button", { type: "button", class: "destaque", onClick: async () => {
    const copiou = await levarParaIA(pedido(), ia);
    avisar(copiou ? `Pedido copiado! No ${IAS[ia][0]}, cole com Ctrl+V (ou segure e "Colar" no celular).` : "Não consegui copiar sozinho: abra \"Ver o pedido\" e copie.", copiou ? "ok" : "erro");
    setTimeout(() => resposta.focus(), 300);
  } });
  const atualizarBotaoIA = () => { botaoAbrir.textContent = `1. Copiar pedido e abrir o ${IAS[ia][0]}`; };
  const escolhaIA = el("div", { class: "botoes-escolha mini", role: "radiogroup", "aria-label": "Qual IA" }, Object.entries(IAS).map(([v, [nome]]) => {
    const b = el("button", { type: "button", role: "radio", "aria-checked": String(v === ia), class: `escolha ${v === ia ? "ativo" : ""}`, onClick: () => {
      ia = v; guardarIaPreferida(v);
      escolhaIA.querySelectorAll("button").forEach((x) => { const sim = x === b; x.classList.toggle("ativo", sim); x.setAttribute("aria-checked", String(sim)); });
      atualizarBotaoIA();
    } }, nome);
    return b;
  }));
  atualizarBotaoIA();

  const semBriefing = ctx.post && !(tipo === "texto" ? ctx.post.notas : ctx.post.roteiro || (ctx.post.videoGravado && ctx.post.transcricao))
    ? el("p", { class: "faixa-alerta" }, "Sem briefing: a IA vai usar só o tema e a marca. Para um resultado melhor, preencha o briefing (ou use \"Montar briefing\").") : null;

  const fechar = abrirModal(`${titulo}${nomeMarca ? ` · ${nomeMarca}` : ""}`, el("div", { class: "assistente-ia" },
    medidorMarca(ctx.clienteId, ctx.marcaId),
    semBriefing,
    el("h3", {}, "1. Leve o pedido para a sua IA"),
    el("p", { class: "subtitulo" }, "O pedido já vai com o jeito Hyper de escrever, a identidade da marca, exemplos aprovados e o briefing deste conteúdo."),
    el("div", { class: "linha-ia" }, escolhaIA, botaoAbrir),
    el("details", { onToggle: (e) => { if (e.target.open) verPedido.textContent = pedido(); } }, el("summary", {}, "Ver o pedido"), verPedido),
    el("div", { class: "passo-ia" },
      el("h3", {}, "2. Cole a resposta aqui"),
      el("p", { class: "subtitulo" }, "Copie tudo o que a IA respondeu e cole abaixo. O app coloca cada parte no lugar certo."),
      resposta,
      aoUsar ? el("div", { class: "acoes" }, el("button", { type: "button", class: "confirmar", onClick: () => {
        if (!resposta.value.trim()) { avisar("Cole a resposta da IA primeiro.", "erro"); return; }
        aoUsar(lerResposta(resposta.value), resposta.value);
        fechar();
      } }, "Usar resposta")) : null)), { largo: true });
  return fechar;
}
