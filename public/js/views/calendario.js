// Calendário de conteúdo: cada post é uma tarefa do tipo Conteúdo. Mostra o mês com a cor e o nome
// do cliente em cada post, filtros, planejamento e exportação para aprovação do cliente.
import * as planejamento from "./planejamento.js";
import { gerarLinkAprovacao, seloResposta } from "../aprovacoes.js";
import { el, hojeISO, addDias, fmtData, vazio, formulario, dataDe, avisar } from "../ui.js";
import { dados, marcasDo, porId, opcoesClientes, nomeCliente, atualizar, registrarAtividade } from "../db.js";
import { cabecalho, abas, seloCliente, abrirTarefa, corCliente, corDoItem, nomeComMarca, mudarEtapa, proximaEtapa, visoesTarefas, seletorResponsavel, atrasada } from "./componentes.js";
import { STATUS_CONTEUDO, rotuloStatusConteudo, TIPO_CONTEUDO } from "../constantes.js";
import { dataPost, exportarPDF, nomeMes } from "../exportacao.js";
import { abrirCompromisso, rotuloCompromisso, avisoPendentes } from "../compromissos.js";
import { compromissosEntre } from "../agenda.js";
import { abrirModal } from "../ui.js";
import { pode, eu, ehAdmin, tarefaVisivel } from "../permissoes.js";

const ICONE_FORMATO = {
  "Feed estático": "▣", "Carrossel": "▤", "Reels": "▶", "Story": "◫", "Sequência de stories": "◫",
  "Vídeo (YouTube)": "▶", "TikTok": "▶", "Anúncio estático": "$", "Anúncio em vídeo": "$", "WhatsApp": "✉", "Blog": "¶",
  "Artigo": "¶", "E-mail marketing": "✉"
};

export { corCliente };

/** Abre um novo post no calendário (tarefa do tipo Conteúdo). */
export function novoPost({ data = hojeISO(), clienteId = "", marcaId = "" } = {}) {
  const prazo = addDias(data, -1) < hojeISO() ? hojeISO() : addDias(data, -1);
  return abrirTarefa({ tipo: TIPO_CONTEUDO, dataPublicacao: data, prazo, clienteId, marcaId, statusConteudo: "ideia" });
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

/** Clique num dia no modo "Tudo": escolhe entre post, tarefa e compromisso. */
function escolherNoDia(data, clienteId) {
  const fechar = abrirModal("O que você quer criar?", el("div", { class: "escolha-dia" },
    pode("conteudo") ? el("button", { class: "destaque", onClick: () => { fechar(); novoPost({ data, clienteId }); } }, "▣ Post de conteúdo") : null,
    el("button", { onClick: () => { fechar(); abrirTarefa({ prazo: data, clienteId }); } }, "✓ Tarefa (entrega no dia)"),
    el("button", { onClick: () => { fechar(); abrirCompromisso({ data, clienteId }); } }, "◷ Compromisso (reunião, gravação…)")));
}

/** Arrastar um post para outro dia: muda a publicação e leva o prazo de produção junto. */
async function moverPost(id, novoDia) {
  const t = porId("tarefas", id);
  if (!t || dataPost(t) === novoDia) return;
  const antes = { dataPublicacao: t.dataPublicacao || "", prazo: t.prazo || "" };
  const delta = Math.round((dataDe(novoDia) - dataDe(dataPost(t))) / 86400000);
  await atualizar("tarefas", id, { dataPublicacao: novoDia, prazo: t.prazo ? addDias(t.prazo, delta) : novoDia });
  registrarAtividade(id, { texto: `mudou a publicação para ${fmtData(novoDia, true)}` });
  avisar(`"${t.titulo}" foi para ${fmtData(novoDia, true)}.`, "ok", { desfazer: () => atualizar("tarefas", id, antes) });
}

/** Tarefa comum (não é post) no dia do prazo. */
function chipTarefa(t) {
  const feita = t.status === "concluido";
  return el("button", {
    class: `chip-tarefa ${feita ? "feita" : ""} ${atrasada(t) ? "atrasada" : ""}`, style: { "--selo": corDoItem(t) },
    title: `${t.tipo || "Tarefa"} · ${t.titulo}${t.responsavel ? " · " + t.responsavel : ""}${t.clienteId ? " · " + nomeCliente(t.clienteId) : ""}`,
    onClick: (e) => { e.stopPropagation(); abrirTarefa(t); }
  }, el("span", { class: "chip-icone", "aria-hidden": "true" }, feita ? "✓" : "○"), t.titulo);
}

function chip(t) {
  const cli = porId("clientes", t.clienteId);
  const prox = proximaEtapa(t);
  const botao = el("button", {
    class: `chip-conteudo st-${t.statusConteudo || "ideia"}`, style: { "--selo": corDoItem(t) }, draggable: "true",
    title: `${nomeComMarca(t)} · ${t.formato || "Post"} · ${t.titulo} · ${rotuloStatusConteudo(t.statusConteudo || "ideia")} (arraste para outro dia)`,
    onClick: (e) => { e.stopPropagation(); abrirTarefa(t); }
  },
  el("span", { class: "chip-cliente" }, cli ? nomeComMarca(t) : "Sem cliente"),
  el("span", { class: "chip-linha" },
    el("span", { class: "chip-icone", "aria-hidden": "true" }, ICONE_FORMATO[t.formato] || "•"),
    t.hora ? el("small", {}, t.hora) : null,
    t.qtdArtes ? el("span", { class: "chip-arte", title: "Tem criativo" }, "🖼 ") : null,
    dados.respostasCliente?.[t.id] ? el("span", { class: "chip-arte", title: dados.respostasCliente[t.id].status === "aprovado" ? "Cliente aprovou" : `Cliente pediu ajuste: ${dados.respostasCliente[t.id].comentario || ""}` }, dados.respostasCliente[t.id].status === "aprovado" ? "✓ " : "✎ ") : null,
    t.titulo),
  prox ? el("span", { class: "chip-avancar", role: "button", tabindex: "0", title: `Avançar para: ${rotuloStatusConteudo(prox)}`,
    onClick: (e) => { e.stopPropagation(); mudarEtapa(t, prox); } }, "›") : null);
  botao.addEventListener("dragstart", (e) => { e.stopPropagation(); e.dataTransfer.setData("text/post", t.id); });
  return botao;
}

export function render({ params, estado, renderizar }) {
  // Modo planejar: #/calendario/<cliente>/<mês>/planejar
  if (params[2] === "planejar" && params[0] && pode("conteudo")) {
    estado.cliente = params[0];
    if (/^\d{4}-\d{2}$/.test(params[1] || "")) estado.mes = params[1];
    estado.plano ??= {};
    return planejamento.render({ params: [params[0], estado.mes], estado: estado.plano, renderizar });
  }
  estado.visao = "calendario"; // lembra a visão para o item "Tarefas" do menu
  // Atalho #/calendario/<cliente>/<mês> (ex.: rotina "Produzir semana")
  const chaveParams = params.join("/");
  if (params.length && estado.params !== chaveParams) {
    estado.params = chaveParams;
    if (params[0]) estado.cliente = params[0];
    if (/^\d{4}-\d{2}$/.test(params[1] || "")) estado.mes = params[1];
  }
  estado.mes ??= hojeISO().slice(0, 7);
  // No celular a grade do mês fica apertada: começa na lista
  estado.modo ??= window.matchMedia("(max-width: 760px)").matches ? "lista" : "mes";
  estado.camada ??= "tudo";
  if (!pode("conteudo") && estado.camada === "conteudo") estado.camada = "tudo";
  if (estado.responsavel === undefined) estado.responsavel = ehAdmin() ? "" : eu.nome; // igual em Tarefas
  const verPosts = pode("conteudo") && ["tudo", "conteudo"].includes(estado.camada);
  const verTarefas = ["tudo", "tarefas"].includes(estado.camada);
  const verCompromissos = ["tudo", "compromissos"].includes(estado.camada);
  const doResponsavel = (t) => !estado.responsavel || (t.responsavel || "") === estado.responsavel;
  const [ano, mes] = estado.mes.split("-").map(Number);
  const posts = dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && dataPost(t));
  const marcas = estado.cliente ? marcasDo(estado.cliente) : [];
  if (!marcas.length) estado.marca = null;
  const filtrados = posts.filter((t) =>
    (!estado.cliente || t.clienteId === estado.cliente) && doResponsavel(t) &&
    (estado.marca == null || (t.marcaId || "") === estado.marca) &&
    (!estado.status || (t.statusConteudo || "ideia") === estado.status));

  const mudarMes = (n) => { const d = new Date(ano, mes - 1 + n, 1); estado.mes = hojeISO(d).slice(0, 7); renderizar(); };
  const set = (k) => (e) => { estado[k] = e.target.value; renderizar(); };

  const doMes = filtrados.filter((t) => dataPost(t).startsWith(estado.mes));
  const tarefasCal = verTarefas ? dados.tarefas.filter((t) => t.tipo !== TIPO_CONTEUDO && t.prazo && tarefaVisivel(t) &&
    (!estado.cliente || t.clienteId === estado.cliente) && doResponsavel(t)) : [];
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
    el("select", { onChange: (e) => { estado.cliente = e.target.value; estado.marca = null; renderizar(); }, "aria-label": "Cliente" },
      opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === (estado.cliente || "") }, v ? r : "Todos os clientes"))),
    marcas.length ? el("select", { "aria-label": "Marca", onChange: (e) => { estado.marca = e.target.value === "*" ? null : e.target.value; renderizar(); } },
      [["*", "Todas as marcas"], ...marcas.map((m) => [m.id, m.nome]), ["", "Institucional do grupo"]]
        .map(([v, r]) => el("option", { value: v, selected: v === (estado.marca ?? "*") }, r))) : null,
    seletorResponsavel(estado, renderizar),
    !verPosts ? null : el("select", { onChange: set("status"), "aria-label": "Etapa" },
      el("option", { value: "" }, "Todas as etapas"), STATUS_CONTEUDO.map(([v, r]) => el("option", { value: v, selected: v === estado.status }, r))),
    abas([["tudo", "Tudo"], ...(pode("conteudo") ? [["conteudo", "Posts"]] : []), ["tarefas", "Tarefas"], ["compromissos", "Compromissos"]], estado.camada, (m) => { estado.camada = m; renderizar(); }),
    abas([["mes", "Grade"], ["lista", "Lista do mês"]], estado.modo, (m) => { estado.modo = m; renderizar(); }));

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
        const tarefasDia = tarefasCal.filter((t) => t.prazo === d);
        return el("div", {
          class: `cal-dia ${d.slice(0, 7) !== estado.mes ? "fora" : ""} ${d === hoje ? "hoje" : ""}`,
          onDragover: (e) => { if (e.dataTransfer.types.includes("text/post")) { e.preventDefault(); e.currentTarget.classList.add("alvo"); } },
          onDragleave: (e) => e.currentTarget.classList.remove("alvo"),
          onDrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove("alvo"); const id = e.dataTransfer.getData("text/post"); if (id) moverPost(id, d); },
          onClick: () => estado.camada === "compromissos" ? abrirCompromisso({ data: d, clienteId: estado.cliente || "" })
            : estado.camada === "conteudo" ? novoPost({ data: d, clienteId: estado.cliente || "", marcaId: estado.marca || "" })
            : estado.camada === "tarefas" ? abrirTarefa({ prazo: d, clienteId: estado.cliente || "" }) : escolherNoDia(d, estado.cliente || ""),
          title: "Clique para criar neste dia"
        }, el("span", { class: "cal-num" }, Number(d.slice(8))), comps.map(chipCompromisso), doDia.map(chip), tarefasDia.map(chipTarefa));
      }));
  } else {
    const itens = [
      ...(verPosts ? doMes.map((t) => ({ chave: dataPost(t) + (t.hora || ""), t })) : []),
      ...(verCompromissos ? compromissosDoPeriodo.filter((x) => x.data.startsWith(estado.mes)).map((x) => ({ chave: x.data + (x.c.hora || ""), x })) : []),
      ...tarefasCal.filter((t) => t.prazo.startsWith(estado.mes)).map((t) => ({ chave: t.prazo + "~", tarefa: t }))
    ].sort((a, b) => a.chave.localeCompare(b.chave));
    corpo = el("div", { class: "lista" }, itens.length ? itens.map(({ t, x, tarefa }) => tarefa
      ? el("div", { class: `linha-tabela ${tarefa.status === "concluido" ? "feita" : ""}`, onClick: () => abrirTarefa(tarefa) },
        el("span", { class: "data-mini" }, fmtData(tarefa.prazo, true)),
        seloCliente(tarefa.clienteId, tarefa), el("strong", {}, tarefa.titulo),
        el("span", { class: "etiqueta" }, tarefa.tipo || "Tarefa"),
        tarefa.responsavel ? el("span", { class: "etiqueta" }, tarefa.responsavel) : null,
        el("span", { class: `etiqueta ${tarefa.status === "concluido" ? "ok" : atrasada(tarefa) ? "alerta" : ""}` },
          tarefa.status === "concluido" ? "Concluída" : atrasada(tarefa) ? "Atrasada" : tarefa.status === "andamento" ? "Em andamento" : "A fazer"))
      : x
      ? el("div", { class: "linha-tabela linha-compromisso", onClick: () => abrirCompromisso(x.c) },
        el("span", { class: "data-mini" }, `${fmtData(x.data, true)}${x.c.hora ? " " + x.c.hora : ""}`),
        seloCliente(x.c.clienteId), el("strong", {}, x.c.titulo),
        el("span", { class: "etiqueta compromisso" }, x.c.tipo || "Compromisso"),
        x.c.googleEventId ? el("span", { class: "etiqueta ok" }, "Google Agenda ✓") : null)
      : el("div", { class: "linha-tabela", onClick: () => abrirTarefa(t) },
        el("span", { class: "data-mini" }, `${fmtData(dataPost(t), true)}${t.hora ? " " + t.hora : ""}`),
        seloCliente(t.clienteId, t), el("strong", {}, t.titulo),
        el("span", { class: "etiqueta" }, `${t.formato || "Post"} · ${t.rede || ""}`),
        el("select", { class: `seletor-etapa st-${t.statusConteudo || "ideia"}`, "aria-label": "Etapa", onClick: (e) => e.stopPropagation(),
          onChange: (e) => mudarEtapa(t, e.target.value) },
          STATUS_CONTEUDO.map(([v, r]) => el("option", { value: v, selected: v === (t.statusConteudo || "ideia") }, r))),
        seloResposta(t),
        t.copy ? el("span", { class: "etiqueta ok" }, "copy ✓") : el("span", { class: "etiqueta" }, "sem copy")))
      : vazio("Nada neste mês."));
  }

  return el("div", { class: "tela" },
    cabecalho("Tarefas",
      contagem.length && verPosts ? contagem.map(([r, n]) => `${n} ${r.toLowerCase()}`).join(" · ") : "Clique em um dia para criar",
      pode("conteudo") ? el("button", { class: "secundario", onClick: () => acaoCliente((c, m) => (location.hash = planejamento.linkPlano(c, m)), "Planejar mês") }, "☷ Planejar mês") : null,
      pode("conteudo") ? el("button", { class: "secundario", onClick: () => acaoCliente((c, m) => gerarLinkAprovacao(c, m, estado.cliente === c ? estado.marca ?? undefined : undefined), "Link de aprovação") }, "🔗 Link de aprovação") : null,
      pode("conteudo") ? el("button", { class: "secundario", onClick: () => acaoCliente((c, m) => exportarPDF(c, m, estado.cliente === c ? estado.marca ?? undefined : undefined), "Exportar PDF") }, "⬇ PDF") : null,
      el("button", { class: "secundario", onClick: () => abrirCompromisso({ clienteId: estado.cliente || "" }) }, "+ Compromisso"),
      el("button", { class: pode("conteudo") ? "secundario" : "destaque", onClick: () => abrirTarefa({ clienteId: estado.cliente || "", prazo: hojeISO() }) }, "+ Tarefa"),
      pode("conteudo") ? el("button", { class: "destaque", onClick: () => novoPost({ clienteId: estado.cliente || "", marcaId: estado.marca || "" }) }, "+ Novo post") : null),
    visoesTarefas(estado, renderizar),
    verCompromissos ? avisoPendentes() : null,
    filtros, verPosts ? legenda : null, corpo,
    el("p", { class: "nota" }, "Posts aparecem no dia da publicação e as outras tarefas (○) no dia do prazo. Compromissos (◷) são reuniões, gravações e visitas: só eles vão para a Google Agenda. Para exportar ou planejar, filtre um cliente ou escolha na hora."));
}
