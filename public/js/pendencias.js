// Pendências: tudo o que espera por alguém da equipe, num lugar só (card "Pendências" do Hoje e número no menu).
// - respostas de clientes pelo link de aprovação (quem é do conteúdo): ver e decidir;
// - pedidos de acesso de usuários novos ou de mais acesso (administradores): liberar em Usuários;
// - compromissos esperando a Google Agenda.
import { el, abrirModal } from "./ui.js";
import { dados } from "./db.js";
import { pode, ehAdmin } from "./permissoes.js";
import { respostasPendentes, listaRespostas } from "./aprovacoes.js";
import { avisoPendentes } from "./compromissos.js";
import { hojeISO } from "./ui.js";

const pedidosDeAcesso = () => (ehAdmin() ? dados.membros.filter((m) => m.status === "pendente" || m.pedido) : []);
const agendaEsperando = () => dados.compromissos.filter((c) => c.sincronizar && !c.googleEventId && (c.data || "") >= hojeISO());

/** Quantas pendências a pessoa tem agora (o número do card e do menu). */
export function contarPendencias() {
  return (pode("conteudo") ? respostasPendentes().length : 0) + pedidosDeAcesso().length + (agendaEsperando().length ? 1 : 0);
}

/** Resumo curto para o card (ex.: "3 respostas de cliente · 1 pedido de acesso"). */
export function resumoPendencias() {
  const r = pode("conteudo") ? respostasPendentes().length : 0;
  const p = pedidosDeAcesso().length;
  const a = agendaEsperando().length;
  return [r ? `${r} resposta(s) de cliente` : "", p ? `${p} pedido(s) de acesso` : "", a ? `${a} compromisso(s) na agenda` : ""].filter(Boolean).join(" · ");
}

/** Janela com todas as pendências, em seções. */
export function abrirPendencias(abrirPost, aoMudar = () => {}) {
  const corpo = el("div", { class: "pendencias" });
  const montar = () => {
    const pedidos = pedidosDeAcesso();
    const secoes = [
      pode("conteudo") ? el("section", { class: "secao-pendencias" },
        el("h3", {}, `Respostas dos clientes (${respostasPendentes().length})`),
        el("p", { class: "subtitulo" }, "O que os clientes responderam pelo link de aprovação. Veja os pedidos e decida se usa a legenda sugerida."),
        listaRespostas(abrirPost, () => { montar(); aoMudar(); })) : null,
      ehAdmin() ? el("section", { class: "secao-pendencias" },
        el("h3", {}, `Pedidos de acesso (${pedidos.length})`),
        pedidos.length ? el("ul", { class: "lista-pedidos" }, pedidos.map((m) => el("li", {},
          el("strong", {}, m.nome || m.email), ` · ${m.status === "pendente" ? "quer entrar no Hyper Studio" : "pediu mais acesso"}`)))
          : el("p", { class: "subtitulo" }, "Ninguém esperando liberação."),
        pedidos.length ? el("a", { class: "botao-link mini", href: "#/usuarios", onClick: () => fechar() }, "Liberar em Usuários e equipe →") : null) : null,
      agendaEsperando().length ? el("section", { class: "secao-pendencias" }, el("h3", {}, "Google Agenda"), avisoPendentes()) : null
    ].filter(Boolean);
    corpo.replaceChildren(...(contarPendencias() ? secoes : [el("p", {}, "Tudo em dia. Nenhuma pendência. ✓"), ...secoes]));
  };
  montar();
  const fechar = abrirModal("Pendências", corpo, { largo: true, aoFechar: aoMudar });
  return fechar;
}
