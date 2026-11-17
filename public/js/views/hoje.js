// Tela inicial: o que está atrasado, o que vence hoje, a semana e os conteúdos próximos.
import { el, hojeISO, addDias, fmtData, fmtDiaSemana, fmtMoeda, vazio } from "../ui.js";
import { dados, nomeCliente } from "../db.js";
import { cartaoTarefa, atrasada, abrirTarefa, cabecalho, seloCliente } from "./componentes.js";
import { rotuloStatusConteudo } from "../constantes.js";

export function render() {
  const hoje = hojeISO();
  const fimSemana = addDias(hoje, 7);
  const abertas = dados.tarefas.filter((t) => t.status !== "concluido");
  const atrasadas = abertas.filter(atrasada).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const deHoje = abertas.filter((t) => t.prazo === hoje);
  const semana = abertas.filter((t) => t.prazo > hoje && t.prazo <= fimSemana).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const semPrazo = abertas.filter((t) => !t.prazo);
  const concluidasHoje = dados.tarefas.filter((t) => t.status === "concluido" && t.concluidoEm === hoje).length;

  const conteudos = dados.conteudos
    .filter((c) => c.data >= hoje && c.data <= fimSemana && c.status !== "publicado")
    .sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));

  const mes = hoje.slice(0, 7);
  const aReceber = dados.financeiro.filter((f) => f.tipo === "receita" && f.status !== "pago" && f.vencimento?.startsWith(mes));
  const vencidas = dados.financeiro.filter((f) => f.tipo === "receita" && f.status !== "pago" && f.vencimento && f.vencimento < hoje);

  const saudacao = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";
  const dataExtenso = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const grupoPorDia = (lista) => {
    const dias = {};
    lista.forEach((t) => (dias[t.prazo] ??= []).push(t));
    return Object.entries(dias).map(([d, ts]) =>
      el("div", { class: "grupo-dia" },
        el("h3", {}, `${fmtDiaSemana(d)} · ${fmtData(d, true)}`, el("span", { class: "contador" }, ts.length)),
        ts.map((t) => cartaoTarefa(t))));
  };

  return el("div", { class: "tela" },
    cabecalho(`${saudacao}!`, dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1),
      el("button", { class: "destaque", onClick: () => abrirTarefa({ prazo: hoje }) }, "+ Nova tarefa")),

    el("div", { class: "resumo" },
      cartaoNumero("Atrasadas", atrasadas.length, atrasadas.length ? "alerta" : ""),
      cartaoNumero("Para hoje", deHoje.length),
      cartaoNumero("Próximos 7 dias", semana.length),
      cartaoNumero("Concluídas hoje", concluidasHoje, "ok")),

    vencidas.length ? el("a", { class: "faixa-alerta", href: "#/financeiro" },
      `💰 ${vencidas.length} recebimento(s) vencido(s): ${fmtMoeda(vencidas.reduce((s, f) => s + (f.valor || 0), 0))}. Ver financeiro →`) : null,

    el("div", { class: "colunas-hoje" },
      el("section", { class: "bloco" },
        atrasadas.length ? [el("h2", { class: "titulo-alerta" }, `Atrasadas (${atrasadas.length})`), atrasadas.map((t) => cartaoTarefa(t))] : null,
        el("h2", {}, `Hoje (${deHoje.length})`),
        deHoje.length ? deHoje.map((t) => cartaoTarefa(t)) : vazio("Nada vencendo hoje. 🎉"),
        el("h2", {}, "Próximos 7 dias"),
        semana.length ? grupoPorDia(semana) : vazio("Semana livre por enquanto."),
        semPrazo.length ? [el("h2", {}, `Sem prazo (${semPrazo.length})`), semPrazo.map((t) => cartaoTarefa(t))] : null),

      el("aside", { class: "bloco lateral" },
        el("h2", {}, "Conteúdos da semana"),
        conteudos.length ? conteudos.map((c) =>
          el("a", { class: "item-conteudo", href: "#/calendario" },
            el("span", { class: "data-mini" }, fmtData(c.data, true)),
            el("div", {},
              el("strong", {}, c.titulo),
              el("div", { class: "cartao-meta" }, seloCliente(c.clienteId), el("span", { class: "etiqueta" }, c.formato),
                el("span", { class: `etiqueta st-${c.status}` }, rotuloStatusConteudo(c.status))))))
          : vazio("Nenhum conteúdo programado.", el("a", { href: "#/calendario", class: "link" }, "Abrir calendário →")),

        el("h2", {}, "A receber este mês"),
        aReceber.length ? [
          el("p", { class: "numero-grande" }, fmtMoeda(aReceber.reduce((s, f) => s + (f.valor || 0), 0))),
          aReceber.slice(0, 6).map((f) => el("div", { class: "linha-fin" },
            el("span", {}, f.clienteId ? nomeCliente(f.clienteId) : f.descricao),
            el("span", {}, `${fmtData(f.vencimento, true)} · ${fmtMoeda(f.valor)}`)))
        ] : vazio("Nada pendente este mês.", el("a", { href: "#/financeiro", class: "link" }, "Abrir financeiro →")))));
}

function cartaoNumero(rotulo, n, classe = "") {
  return el("div", { class: `numero ${classe}` }, el("strong", {}, n), el("span", {}, rotulo));
}
