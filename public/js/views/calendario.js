// Calendário de conteúdo: cada post é uma tarefa do tipo Conteúdo. Mostra o mês com a cor e o nome
// do cliente em cada post, filtros, planejamento e exportação para aprovação do cliente.
import { el, hojeISO, addDias, fmtData, vazio, formulario } from "../ui.js";
import { dados, porId, opcoesClientes, nomeCliente } from "../db.js";
import { cabecalho, abas, seloCliente, abrirTarefa, corCliente } from "./componentes.js";
import { STATUS_CONTEUDO, rotuloStatusConteudo, TIPO_CONTEUDO } from "../constantes.js";
import { dataPost, exportarExcel, exportarPDF, nomeMes } from "../exportacao.js";

const ICONE_FORMATO = {
  "Feed estático": "▣", "Carrossel": "▤", "Reels": "▶", "Story": "◫", "Sequência de stories": "◫",
  "Vídeo (YouTube)": "▶", "TikTok": "▶", "Anúncio estático": "$", "Anúncio em vídeo": "$", "WhatsApp": "✉", "Blog": "¶"
};

export { corCliente };

/** Abre um novo post no calendário (tarefa do tipo Conteúdo). */
export function novoPost({ data = hojeISO(), clienteId = "" } = {}) {
  const prazo = addDias(data, -1) < hojeISO() ? hojeISO() : addDias(data, -1);
  return abrirTarefa({ tipo: TIPO_CONTEUDO, dataPublicacao: data, prazo, clienteId, statusConteudo: "ideia" });
}

/** Pergunta cliente e mês quando a ação precisa de um só cliente. */
export async function escolherClienteEMes(titulo, { clienteId = "", mes = hojeISO().slice(0, 7), rotulo = "Continuar" } = {}) {
  const r = await formulario(titulo, [
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientes(false), obrigatorio: true, largura: "metade" },
    { nome: "mes", rotulo: "Mês", tipo: "month", obrigatorio: true, largura: "metade" }
  ], { clienteId, mes }, { rotuloSalvar: rotulo });
  return r && r.clienteId ? r : null;
}

function chip(t) {
  const cli = porId("clientes", t.clienteId);
  return el("button", {
    class: `chip-conteudo st-${t.statusConteudo || "ideia"}`, style: { "--selo": corCliente(cli) },
    title: `${nomeCliente(t.clienteId)} · ${t.formato || "Post"} · ${t.titulo} · ${rotuloStatusConteudo(t.statusConteudo || "ideia")}`,
    onClick: (e) => { e.stopPropagation(); abrirTarefa(t); }
  },
  el("span", { class: "chip-cliente" }, cli ? cli.nome : "Sem cliente"),
  el("span", { class: "chip-linha" },
    el("span", { class: "chip-icone", "aria-hidden": "true" }, ICONE_FORMATO[t.formato] || "•"),
    t.hora ? el("small", {}, t.hora) : null,
    t.titulo));
}

export function render({ estado, renderizar }) {
  estado.mes ??= hojeISO().slice(0, 7);
  estado.modo ??= "mes";
  const [ano, mes] = estado.mes.split("-").map(Number);
  const posts = dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && dataPost(t));
  const filtrados = posts.filter((t) =>
    (!estado.cliente || t.clienteId === estado.cliente) &&
    (!estado.status || (t.statusConteudo || "ideia") === estado.status));

  const mudarMes = (n) => { const d = new Date(ano, mes - 1 + n, 1); estado.mes = hojeISO(d).slice(0, 7); renderizar(); };
  const set = (k) => (e) => { estado[k] = e.target.value; renderizar(); };

  const doMes = filtrados.filter((t) => dataPost(t).startsWith(estado.mes));
  const contagem = STATUS_CONTEUDO.map(([s, r]) => [r, doMes.filter((t) => (t.statusConteudo || "ideia") === s).length]).filter(([, n]) => n);

  // Legenda: clientes com posts no mês (clique filtra)
  const doMesTodos = posts.filter((t) => dataPost(t).startsWith(estado.mes));
  const clientesNoMes = [...new Set(doMesTodos.map((t) => t.clienteId))]
    .map((id) => ({ id, c: porId("clientes", id), n: doMesTodos.filter((t) => t.clienteId === id).length }))
    .sort((a, b) => b.n - a.n);
  const legenda = clientesNoMes.length ? el("div", { class: "legenda-clientes" }, clientesNoMes.map(({ id, c, n }) =>
    el("button", {
      class: `legenda-item ${estado.cliente === id ? "ativo" : ""}`, style: { "--selo": corCliente(c) },
      onClick: () => { estado.cliente = estado.cliente === id ? "" : id; renderizar(); }
    }, el("span", { class: "bolinha" }), c?.nome || "Sem cliente", el("small", {}, n)))) : null;

  const acaoCliente = async (fn, titulo) => {
    const r = estado.cliente ? { clienteId: estado.cliente, mes: estado.mes } : await escolherClienteEMes(titulo, { mes: estado.mes });
    if (r) fn(r.clienteId, r.mes);
  };

  const filtros = el("div", { class: "filtros" },
    el("div", { class: "navegador-mes" },
      el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => mudarMes(-1) }, "‹"),
      el("strong", {}, nomeMes(estado.mes)),
      el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => mudarMes(1) }, "›"),
      el("button", { class: "secundario mini", onClick: () => { estado.mes = hojeISO().slice(0, 7); renderizar(); } }, "Hoje")),
    el("select", { onChange: set("cliente"), "aria-label": "Cliente" },
      opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === (estado.cliente || "") }, v ? r : "Todos os clientes"))),
    el("select", { onChange: set("status"), "aria-label": "Etapa" },
      el("option", { value: "" }, "Todas as etapas"), STATUS_CONTEUDO.map(([v, r]) => el("option", { value: v, selected: v === estado.status }, r))),
    abas([["mes", "Mês"], ["lista", "Lista"]], estado.modo, (m) => { estado.modo = m; renderizar(); }));

  let corpo;
  if (estado.modo === "mes") {
    const primeiro = new Date(ano, mes - 1, 1);
    const inicio = addDias(hojeISO(primeiro), -((primeiro.getDay() + 6) % 7)); // começa na segunda
    const hoje = hojeISO();
    const dias = Array.from({ length: 42 }, (_, i) => addDias(inicio, i));
    const semanas = dias[35].slice(0, 7) === estado.mes ? 6 : 5;
    corpo = el("div", { class: "calendario" },
      ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => el("div", { class: "cal-cabeca" }, d)),
      dias.slice(0, semanas * 7).map((d) => {
        const doDia = filtrados.filter((t) => dataPost(t) === d).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
        return el("div", {
          class: `cal-dia ${d.slice(0, 7) !== estado.mes ? "fora" : ""} ${d === hoje ? "hoje" : ""}`,
          onClick: () => novoPost({ data: d, clienteId: estado.cliente || "" }), title: "Clique para criar um post neste dia"
        }, el("span", { class: "cal-num" }, Number(d.slice(8))), doDia.map(chip));
      }));
  } else {
    const ordenados = [...doMes].sort((a, b) => (dataPost(a) + (a.hora || "")).localeCompare(dataPost(b) + (b.hora || "")));
    corpo = el("div", { class: "lista" }, ordenados.length ? ordenados.map((t) =>
      el("div", { class: "linha-tabela", onClick: () => abrirTarefa(t) },
        el("span", { class: "data-mini" }, `${fmtData(dataPost(t), true)}${t.hora ? " " + t.hora : ""}`),
        seloCliente(t.clienteId), el("strong", {}, t.titulo),
        el("span", { class: "etiqueta" }, `${t.formato || "Post"} · ${t.rede || ""}`),
        el("span", { class: `etiqueta st-${t.statusConteudo || "ideia"}` }, rotuloStatusConteudo(t.statusConteudo || "ideia")),
        t.copy ? el("span", { class: "etiqueta ok" }, "copy ✓") : el("span", { class: "etiqueta" }, "sem copy")))
      : vazio("Nenhum post neste mês."));
  }

  return el("div", { class: "tela" },
    cabecalho("Calendário de conteúdo",
      contagem.length ? contagem.map(([r, n]) => `${n} ${r.toLowerCase()}`).join(" · ") : "Clique em um dia para criar um post",
      el("button", { class: "secundario", onClick: () => acaoCliente((c, m) => (location.hash = `#/planejamento/${c}/${m}`), "Planejar mês") }, "☷ Planejar mês"),
      el("button", { class: "secundario", onClick: () => acaoCliente(exportarExcel, "Exportar planilha") }, "⬇ Excel"),
      el("button", { class: "secundario", onClick: () => acaoCliente(exportarPDF, "Exportar PDF") }, "⬇ PDF"),
      el("button", { class: "destaque", onClick: () => novoPost({ clienteId: estado.cliente || "" }) }, "+ Novo post")),
    filtros, legenda, corpo,
    el("p", { class: "nota" }, "Cada post é uma tarefa do tipo Conteúdo: o que você muda aqui muda na lista de tarefas, e vice-versa. Para exportar ou planejar, filtre um cliente ou escolha na hora."));
}
