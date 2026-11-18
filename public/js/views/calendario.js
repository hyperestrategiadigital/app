// Calendário de conteúdo: cada post é uma tarefa do tipo Conteúdo. Mostra o mês com a cor e o nome
// do cliente em cada post, filtros, planejamento e exportação para aprovação do cliente.
import * as planejamento from "./planejamento.js";
import { el, hojeISO, addDias, fmtData, vazio, formulario } from "../ui.js";
import { dados, porId, opcoesClientes, nomeCliente } from "../db.js";
import { cabecalho, abas, seloCliente, abrirTarefa, corCliente } from "./componentes.js";
import { STATUS_CONTEUDO, rotuloStatusConteudo, TIPO_CONTEUDO } from "../constantes.js";
import { dataPost, exportarPDF, nomeMes } from "../exportacao.js";
import { abrirCompromisso, rotuloCompromisso, avisoPendentes } from "../compromissos.js";
import { compromissosEntre } from "../agenda.js";
import { abrirModal } from "../ui.js";
import { pode } from "../permissoes.js";

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

function chipCompromisso({ c }) {
  return el("button", {
    class: "chip-compromisso", title: `${c.tipo || "Compromisso"}${c.local ? " · " + c.local : ""}${c.googleEventId ? " · na Google Agenda" : ""}`,
    onClick: (e) => { e.stopPropagation(); abrirCompromisso(c); }
  }, el("span", { class: "chip-icone", "aria-hidden": "true" }, "◷"), rotuloCompromisso(c));
}

/** Clique num dia no modo "Tudo": escolhe entre post e compromisso. */
function escolherNoDia(data, clienteId) {
  const fechar = abrirModal("O que você quer criar?", el("div", { class: "escolha-dia" },
    el("button", { class: "destaque", onClick: () => { fechar(); novoPost({ data, clienteId }); } }, "▣ Post de conteúdo"),
    el("button", { onClick: () => { fechar(); abrirCompromisso({ data, clienteId }); } }, "◷ Compromisso (reunião, gravação…)")));
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
    t.qtdArtes ? el("span", { class: "chip-arte", title: "Tem criativo" }, "🖼 ") : null,
    t.titulo));
}

export function render({ params, estado, renderizar }) {
  // Modo planejar: #/calendario/<cliente>/<mês>/planejar
  if (params[2] === "planejar" && params[0] && pode("conteudo")) {
    estado.cliente = params[0];
    if (/^\d{4}-\d{2}$/.test(params[1] || "")) estado.mes = params[1];
    estado.plano ??= {};
    return planejamento.render({ params: [params[0], estado.mes], estado: estado.plano, renderizar });
  }
  // Atalho #/calendario/<cliente>/<mês> (ex.: rotina "Produzir semana")
  const chaveParams = params.join("/");
  if (params.length && estado.params !== chaveParams) {
    estado.params = chaveParams;
    if (params[0]) estado.cliente = params[0];
    if (/^\d{4}-\d{2}$/.test(params[1] || "")) estado.mes = params[1];
  }
  estado.mes ??= hojeISO().slice(0, 7);
  estado.modo ??= "mes";
  estado.camada ??= pode("conteudo") ? "tudo" : "compromissos";
  if (!pode("conteudo")) estado.camada = "compromissos"; // sem acesso a conteúdo: só compromissos
  const verPosts = estado.camada !== "compromissos";
  const verCompromissos = estado.camada !== "conteudo";
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
    estado.cliente && pode("conteudo") ? abas([["ver", "Calendário"], ["planejar", "Planejar mês"]], "ver",
      () => (location.hash = planejamento.linkPlano(estado.cliente, estado.mes))) : null,
    el("div", { class: "navegador-mes" },
      el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => mudarMes(-1) }, "‹"),
      el("strong", {}, nomeMes(estado.mes)),
      el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => mudarMes(1) }, "›"),
      el("button", { class: "secundario mini", onClick: () => { estado.mes = hojeISO().slice(0, 7); renderizar(); } }, "Hoje")),
    el("select", { onChange: set("cliente"), "aria-label": "Cliente" },
      opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === (estado.cliente || "") }, v ? r : "Todos os clientes"))),
    !pode("conteudo") ? null : el("select", { onChange: set("status"), "aria-label": "Etapa" },
      el("option", { value: "" }, "Todas as etapas"), STATUS_CONTEUDO.map(([v, r]) => el("option", { value: v, selected: v === estado.status }, r))),
    pode("conteudo") ? abas([["tudo", "Tudo"], ["conteudo", "Conteúdo"], ["compromissos", "Compromissos"]], estado.camada, (m) => { estado.camada = m; renderizar(); }) : null,
    abas([["mes", "Mês"], ["lista", "Lista"]], estado.modo, (m) => { estado.modo = m; renderizar(); }));

  const [ini, fimP] = [`${estado.mes}-01`, addDias(`${estado.mes}-01`, 41)];
  const compromissosDoPeriodo = compromissosEntre(addDias(ini, -7), fimP)
    .filter((x) => !estado.cliente || x.c.clienteId === estado.cliente);

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
        const doDia = verPosts ? filtrados.filter((t) => dataPost(t) === d).sort((a, b) => (a.hora || "").localeCompare(b.hora || "")) : [];
        const comps = verCompromissos ? compromissosDoPeriodo.filter((x) => x.data === d) : [];
        return el("div", {
          class: `cal-dia ${d.slice(0, 7) !== estado.mes ? "fora" : ""} ${d === hoje ? "hoje" : ""}`,
          onClick: () => estado.camada === "compromissos" ? abrirCompromisso({ data: d, clienteId: estado.cliente || "" })
            : estado.camada === "conteudo" ? novoPost({ data: d, clienteId: estado.cliente || "" }) : escolherNoDia(d, estado.cliente || ""),
          title: "Clique para criar neste dia"
        }, el("span", { class: "cal-num" }, Number(d.slice(8))), comps.map(chipCompromisso), doDia.map(chip));
      }));
  } else {
    const itens = [
      ...(verPosts ? doMes.map((t) => ({ chave: dataPost(t) + (t.hora || ""), t })) : []),
      ...(verCompromissos ? compromissosDoPeriodo.filter((x) => x.data.startsWith(estado.mes)).map((x) => ({ chave: x.data + (x.c.hora || ""), x })) : [])
    ].sort((a, b) => a.chave.localeCompare(b.chave));
    corpo = el("div", { class: "lista" }, itens.length ? itens.map(({ t, x }) => x
      ? el("div", { class: "linha-tabela linha-compromisso", onClick: () => abrirCompromisso(x.c) },
        el("span", { class: "data-mini" }, `${fmtData(x.data, true)}${x.c.hora ? " " + x.c.hora : ""}`),
        seloCliente(x.c.clienteId), el("strong", {}, x.c.titulo),
        el("span", { class: "etiqueta compromisso" }, x.c.tipo || "Compromisso"),
        x.c.googleEventId ? el("span", { class: "etiqueta ok" }, "Google Agenda ✓") : null)
      : el("div", { class: "linha-tabela", onClick: () => abrirTarefa(t) },
        el("span", { class: "data-mini" }, `${fmtData(dataPost(t), true)}${t.hora ? " " + t.hora : ""}`),
        seloCliente(t.clienteId), el("strong", {}, t.titulo),
        el("span", { class: "etiqueta" }, `${t.formato || "Post"} · ${t.rede || ""}`),
        el("span", { class: `etiqueta st-${t.statusConteudo || "ideia"}` }, rotuloStatusConteudo(t.statusConteudo || "ideia")),
        t.copy ? el("span", { class: "etiqueta ok" }, "copy ✓") : el("span", { class: "etiqueta" }, "sem copy")))
      : vazio("Nada neste mês."));
  }

  return el("div", { class: "tela" },
    cabecalho("Calendário",
      !pode("conteudo") ? "Seus compromissos e reuniões" : contagem.length ? contagem.map(([r, n]) => `${n} ${r.toLowerCase()}`).join(" · ") : "Clique em um dia para criar um post",
      pode("conteudo") ? el("button", { class: "secundario", onClick: () => acaoCliente((c, m) => (location.hash = planejamento.linkPlano(c, m)), "Planejar mês") }, "☷ Planejar mês") : null,
      pode("conteudo") ? el("button", { class: "secundario", onClick: () => acaoCliente(exportarPDF, "Exportar PDF") }, "⬇ PDF para o cliente") : null,
      el("button", { class: "secundario", onClick: () => abrirCompromisso({ clienteId: estado.cliente || "" }) }, "+ Compromisso"),
      pode("conteudo") ? el("button", { class: "destaque", onClick: () => novoPost({ clienteId: estado.cliente || "" }) }, "+ Novo post") : null),
    verCompromissos ? avisoPendentes() : null,
    filtros, verPosts ? legenda : null, corpo,
    el("p", { class: "nota" }, "Posts são tarefas do tipo Conteúdo e nunca vão para a sua agenda pessoal. Compromissos (◷) são reuniões, gravações e visitas: esses podem ir para a Google Agenda. Para exportar ou planejar, filtre um cliente ou escolha na hora."));
}
