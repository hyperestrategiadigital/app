// Calendário de conteúdo: cada post é uma tarefa do tipo Conteúdo. Mostra o mês com a cor e o nome
// do cliente em cada post, filtros, planejamento e exportação para aprovação do cliente.
import * as planejamento from "./planejamento.js";
import { gerarLinkAprovacao, seloResposta } from "../aprovacoes.js";
import { el, hojeISO, addDias, fmtData, vazio, formulario, dataDe, avisar, normalizar } from "../ui.js";
import { dados, marcasDo, porId, opcoesClientes, nomeCliente, atualizar, registrarAtividade, identidade } from "../db.js";
import { pilaresDe } from "../ia.js";
import { datasEntre } from "../datas.js";
import { cabecalho, abas, seloCliente, abrirTarefa, corCliente, corDoItem, nomeComMarca, mudarEtapa, proximaEtapa, visoesTarefas, seletorResponsavel, atrasada } from "./componentes.js";
import { STATUS_CONTEUDO, rotuloStatusConteudo, TIPO_CONTEUDO, FORMATOS, comAtual } from "../constantes.js";
import { dataPost, exportarPDF, nomeMes } from "../exportacao.js";
import { abrirCompromisso, rotuloCompromisso, avisoPendentes } from "../compromissos.js";
import { compromissosEntre } from "../agenda.js";
import { abrirModal } from "../ui.js";
import { pode, eu, ehAdmin, tarefaVisivel } from "../permissoes.js";

const ICONE_FORMATO = {
  "Estático": "▣", "Carrossel": "▤", "Vídeo": "▶", "Story": "◫", "WhatsApp": "✉", "Blog": "¶",
  "Artigo": "¶", "E-mail marketing": "✉"
};

export { corCliente };

/** Abre um novo post no calendário (tarefa do tipo Conteúdo). */
export function novoPost({ data = hojeISO(), clienteId = "", marcaId = "" } = {}) {
  // Sem prazo: o formulário calcula pela antecedência do formato e acompanha se você trocar a data ou o formato
  return abrirTarefa({ tipo: TIPO_CONTEUDO, dataPublicacao: data, clienteId, marcaId, statusConteudo: "ideia" });
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

/** Clique num dia no modo "Tudo" (e o "+" do celular): escolhe entre post, tarefa e compromisso. */
export function escolherNoDia(data, clienteId) {
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

/** Menu suspenso simples: um botão que abre uma lista de ações. */
export function menuSuspenso(rotulo, itens, classe = "secundario") {
  const lista = el("div", { class: "menu-suspenso-lista", role: "menu", hidden: true });
  const fechar = () => { lista.hidden = true; document.removeEventListener("click", foraClique, true); };
  const foraClique = (e) => { if (!caixa.contains(e.target)) fechar(); };
  for (const [texto, acao] of itens.filter(Boolean)) {
    lista.append(el("button", { type: "button", role: "menuitem", onClick: () => { fechar(); acao(); } }, texto));
  }
  const caixa = el("div", { class: "menu-suspenso" },
    el("button", { type: "button", class: classe, "aria-haspopup": "menu", onClick: () => {
      if (lista.hidden) { lista.hidden = false; document.addEventListener("click", foraClique, true); } else fechar();
    } }, rotulo, el("span", { class: "seta", "aria-hidden": "true" }, " ▾")), lista);
  return caixa;
}

/** Busca por texto nas tarefas/posts (título, checklist, observações). */
/** Filtro "Formato do post": com um formato escolhido, só os posts desse formato aparecem. */
export const bateFormato = (t, formato) => !formato || (t.tipo === TIPO_CONTEUDO && t.formato === formato);
export const bateBusca = (t, busca) => !busca || normalizar(`${t.titulo || ""} ${(t.checklist || []).map((i) => i.texto).join(" ")} ${t.notas || ""}`).includes(busca);

/**
 * Topo único de Tarefas (as quatro visões): título, "Ações do mês" e "+ Novo"; visões + mês; filtros iguais em todas.
 * Nada muda de lugar ao trocar de visão. `navegador` aparece só no calendário.
 */
export function topoTarefas(estado, renderizar, { calendario = false } = {}) {
  estado.mes ??= hojeISO().slice(0, 7);
  estado.camada ??= "tudo";
  if (!pode("conteudo") && estado.camada === "conteudo") estado.camada = "tudo";
  if (estado.responsavel === undefined) estado.responsavel = ehAdmin() ? "" : eu.nome; // quem não é admin começa vendo as próprias
  const marcas = estado.cliente ? marcasDo(estado.cliente) : [];
  if (!marcas.length) estado.marca = null;
  const [ano, mes] = estado.mes.split("-").map(Number);
  const mudarMes = (n) => { const d = new Date(ano, mes - 1 + n, 1); estado.mes = hojeISO(d).slice(0, 7); renderizar(); };
  const acaoCliente = async (fn, titulo) => {
    const r = estado.cliente ? { clienteId: estado.cliente, mes: estado.mes } : await escolherClienteEMes(titulo, { mes: estado.mes });
    if (r) fn(r.clienteId, r.mes);
  };
  const marcaDe = (c) => (estado.cliente === c ? estado.marca ?? undefined : undefined);

  // Subtítulo estável: atrasadas com os filtros de cliente e responsável
  const atrasadas = dados.tarefas.filter((t) => tarefaVisivel(t) && atrasada(t) &&
    (!estado.cliente || t.clienteId === estado.cliente) && (!estado.responsavel || (t.responsavel || "") === estado.responsavel)).length;

  const novo = menuSuspenso("+ Novo", [
    pode("conteudo") ? ["▣ Post", () => novoPost({ clienteId: estado.cliente || "", marcaId: estado.marca || "" })] : null,
    ["✓ Tarefa", () => abrirTarefa({ clienteId: estado.cliente || "", prazo: hojeISO() })],
    ["◷ Compromisso", () => abrirCompromisso({ clienteId: estado.cliente || "" })]
  ], "destaque");
  const acoesMes = pode("conteudo") ? menuSuspenso("Ações do mês", [
    ["☷ Planejar mês", () => acaoCliente((c, m) => (location.hash = planejamento.linkPlano(c, m)), "Planejar mês")],
    ["🔗 Link de aprovação", () => acaoCliente((c, m) => gerarLinkAprovacao(c, m, marcaDe(c)), "Link de aprovação")],
    ["⬇ PDF do mês", () => acaoCliente((c, m) => exportarPDF(c, m, marcaDe(c)), "Exportar PDF")]
  ]) : null;

  const navegador = el("div", { class: "navegador-mes", hidden: !calendario },
    el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => mudarMes(-1) }, "‹"),
    el("strong", {}, nomeMes(estado.mes)),
    el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => mudarMes(1) }, "›"),
    el("button", { class: "secundario mini", onClick: () => { estado.mes = hojeISO().slice(0, 7); renderizar(); } }, "Hoje"));

  // Barra limpa: Buscar + "Filtros" (painel com cliente, marca, responsável, o que mostrar e formato do post)
  const nFiltros = [estado.cliente, estado.marca != null ? 1 : "", estado.responsavel, estado.camada !== "tudo" ? 1 : "", estado.formato].filter(Boolean).length;
  const grupo = (rotulo, ...controles) => el("div", { class: "grupo-filtro" }, el("span", { class: "rotulo-filtro" }, rotulo), ...controles);
  const painel = estado.filtrosAbertos ? el("div", { class: "painel-filtros", role: "region", "aria-label": "Filtros" },
    grupo("Mostrar", abas([["tudo", "Tudo"], ...(pode("conteudo") ? [["conteudo", "Posts"]] : []), ["tarefas", "Tarefas"], ["compromissos", "Compromissos"]], estado.camada,
      (m) => { estado.camada = m; if (!["tudo", "conteudo"].includes(m)) estado.formato = ""; renderizar(); })),
    grupo("Cliente", el("select", { "aria-label": "Cliente", onChange: (e) => { estado.cliente = e.target.value; estado.marca = null; renderizar(); } },
      opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === (estado.cliente || "") }, v ? r : "Todos os clientes"))),
      marcas.length ? el("select", { "aria-label": "Marca", onChange: (e) => { estado.marca = e.target.value === "*" ? null : e.target.value; renderizar(); } },
        [["*", "Todas as marcas"], ...marcas.map((m) => [m.id, m.nome]), ["", "Institucional do grupo"]]
          .map(([v, r]) => el("option", { value: v, selected: v === (estado.marca ?? "*") }, r))) : null),
    grupo("Responsável", seletorResponsavel(estado, renderizar)),
    pode("conteudo") && ["tudo", "conteudo"].includes(estado.camada) ? grupo("Formato do post",
      el("select", { "aria-label": "Formato", onChange: (e) => { estado.formato = e.target.value; renderizar(); } },
        [["", "Todos os formatos"], ...comAtual(FORMATOS, estado.formato).map((x) => [x, x])].map(([v, r]) => el("option", { value: v, selected: v === (estado.formato || "") }, r)))) : null,
    nFiltros ? el("button", { class: "link", onClick: () => { Object.assign(estado, { cliente: "", marca: null, responsavel: "", camada: "tudo", formato: "" }); renderizar(); } }, "Limpar filtros") : null) : null;
  const filtros = el("div", { class: "filtros filtros-tarefas" },
    el("input", { id: "busca-tarefas", type: "search", placeholder: "Buscar…", value: estado.busca || "",
      onInput: (e) => { estado.busca = e.target.value; clearTimeout(estado.tBusca); estado.tBusca = setTimeout(() => { renderizar(); document.getElementById("busca-tarefas")?.focus(); }, 300); } }),
    el("button", { class: `secundario mini botao-filtros ${nFiltros ? "com-filtro" : ""}`, "aria-expanded": String(!!estado.filtrosAbertos),
      onClick: () => { estado.filtrosAbertos = !estado.filtrosAbertos; renderizar(); } }, `Filtros${nFiltros ? ` (${nFiltros})` : ""} ▾`),
    // Uma etiqueta para cada filtro ligado, com ✕ para tirar (nada fica filtrado sem aparecer)
    ...[
      estado.camada !== "tudo" ? [{ conteudo: "Só posts", tarefas: "Só tarefas", compromissos: "Só compromissos" }[estado.camada], () => { estado.camada = "tudo"; }] : null,
      estado.cliente ? [porId("clientes", estado.cliente)?.nome || "Cliente", () => { estado.cliente = ""; estado.marca = null; }] : null,
      estado.marca != null ? [estado.marca ? porId("marcas", estado.marca)?.nome || "Marca" : "Institucional do grupo", () => { estado.marca = null; }] : null,
      estado.responsavel ? [`Responsável: ${estado.responsavel === eu.nome ? "eu" : estado.responsavel}`, () => { estado.responsavel = ""; }] : null,
      estado.formato ? [`Formato: ${estado.formato}`, () => { estado.formato = ""; }] : null
    ].filter(Boolean).map(([texto, tirar]) => el("button", { type: "button", class: "filtro-ativo", "aria-label": `Tirar filtro ${texto}`,
      onClick: () => { tirar(); renderizar(); } }, texto, el("span", { "aria-hidden": "true" }, " ✕"))));

  return [
    cabecalho("Tarefas", atrasadas ? `${atrasadas} atrasada(s)` : "Tudo em dia", acoesMes, novo),
    el("div", { class: "barra-visoes" }, visoesTarefas(estado, renderizar), navegador),
    filtros, painel
  ];
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
  const topo = topoTarefas(estado, renderizar, { calendario: true });
  // No celular a grade do mês fica apertada: vira lista do mês
  estado.modo = window.matchMedia("(max-width: 760px)").matches ? "lista" : "mes";
  const verPosts = pode("conteudo") && ["tudo", "conteudo"].includes(estado.camada);
  const verTarefas = ["tudo", "tarefas"].includes(estado.camada) && !estado.formato;
  const verCompromissos = ["tudo", "compromissos"].includes(estado.camada) && !estado.formato;
  const busca = normalizar(estado.busca);
  const doResponsavel = (t) => !estado.responsavel || (t.responsavel || "") === estado.responsavel;
  const daMarca = (t) => estado.marca == null || (t.marcaId || "") === estado.marca;
  const [ano, mes] = estado.mes.split("-").map(Number);
  const posts = dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && dataPost(t));
  const filtrados = posts.filter((t) =>
    (!estado.cliente || t.clienteId === estado.cliente) && doResponsavel(t) && daMarca(t) && bateFormato(t, estado.formato) && bateBusca(t, busca));

  const doMes = filtrados.filter((t) => dataPost(t).startsWith(estado.mes));
  const tarefasCal = verTarefas ? dados.tarefas.filter((t) => t.tipo !== TIPO_CONTEUDO && t.prazo && tarefaVisivel(t) &&
    (!estado.cliente || t.clienteId === estado.cliente) && doResponsavel(t) && daMarca(t) && bateBusca(t, busca)) : [];

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

  // Pilares do mês (com um cliente filtrado): quantos posts de cada pilar, para ver se o mês está equilibrado
  const pilares = estado.cliente ? pilaresDe(identidade(estado.cliente, estado.marca ?? undefined)) : [];
  const usados = [...new Set([...pilares, ...doMes.map((t) => t.pilar).filter(Boolean)])];
  const semPilar = doMes.filter((t) => !t.pilar).length;
  const resumoPilares = usados.length && doMes.length ? el("div", { class: "resumo-pilares", "aria-label": "Pilares de conteúdo do mês" },
    el("strong", {}, "Pilares do mês:"),
    usados.map((p) => { const n = doMes.filter((t) => t.pilar === p).length; return el("span", { class: `etiqueta ${n ? "" : "vazio"}`, title: n ? "" : "Nenhum post deste pilar no mês" }, `${p} · ${n}`); }),
    semPilar ? el("span", { class: "subtitulo" }, `${semPilar} sem pilar`) : null) : null;

  const [ini, fimP] = [`${estado.mes}-01`, addDias(`${estado.mes}-01`, 41)];
  // Feriados sempre; com um cliente filtrado, também as datas comerciais e as da marca (aba Marca)
  const datasPeriodo = datasEntre(addDias(ini, -7), fimP, { clienteId: estado.cliente || "", marcaId: estado.cliente ? (estado.marca ?? undefined) : "", comerciais: !!estado.cliente });
  const datasDoDia = (d) => datasPeriodo.filter((x) => x.data === d && x.tipo !== "mes");
  const temasDoMes = datasPeriodo.filter((x) => x.tipo === "mes" && x.data.startsWith(estado.mes));
  const seloData = (x) => el("span", { class: `data-cal ${x.tipo}`, title: x.tipo === "feriado" ? "Feriado" : x.tipo === "marca" ? "Data da marca" : "Data comemorativa" }, x.nome);
  const datasDoMes = datasPeriodo.filter((x) => x.data.startsWith(estado.mes));
  const faixaDatas = datasDoMes.length ? el("div", { class: "datas-do-mes", "aria-label": "Datas do mês" },
    el("strong", {}, "Datas do mês:"),
    datasDoMes.map((x) => el("span", { class: `data-cal ${x.tipo}` }, x.tipo === "mes" ? `${x.nome} (o mês todo)` : `${fmtData(x.data, true)} ${x.nome}`))) : null;
  const compromissosDoPeriodo = compromissosEntre(addDias(ini, -7), fimP)
    .filter((x) => (!estado.cliente || x.c.clienteId === estado.cliente) && (!busca || normalizar(x.c.titulo || "").includes(busca)));

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
        }, el("span", { class: "cal-num" }, Number(d.slice(8))), datasDoDia(d).map(seloData), comps.map(chipCompromisso), doDia.map(chip), tarefasDia.map(chipTarefa));
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

  return el("div", { class: "tela tela-tarefas" },
    ...topo,
    verCompromissos ? avisoPendentes() : null,
    verPosts ? legenda : null, verPosts ? resumoPilares : null, faixaDatas, corpo,
    el("p", { class: "nota" }, "Posts aparecem no dia da publicação e as outras tarefas (○) no dia do prazo. Compromissos (◷) são reuniões, gravações e visitas: só eles vão para a Google Agenda. Planejar, link de aprovação e PDF ficam em Ações do mês."));
}
