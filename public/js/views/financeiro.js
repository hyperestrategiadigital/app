// Financeiro: receitas e despesas do mês, mensalidades automáticas e orçamentos.
import { garantirMes } from "../recorrencias.js";
import { abrirGeradorContrato, abrirOrcamentoNovo, abaConfigurar } from "./comercial.js";
import { reserva, despesasFixas, textoVencimento, documentoOrcamento, abrirParaPDF } from "../comercial.js";
import { ehAdmin } from "../permissoes.js";
import { el, formulario, confirmar, avisar, hojeISO, fmtData, fmtMoeda, vazio, fecharModais } from "../ui.js";
import { dados, criar, atualizar, excluir, salvarComId, nomeCliente, opcoesClientes, clientesAtivos, contrato } from "../db.js";
import { cabecalho, abas, seloCliente } from "./componentes.js";
import { CATEGORIAS_FIN, STATUS_ORCAMENTO } from "../constantes.js";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function botaoExcluir(col, item, msg) {
  return el("button", {
    type: "button", class: "perigo-texto", onClick: async () => {
      if (await confirmar(msg)) { await excluir(col, item.id); fecharModais(); }
    }
  }, "Excluir");
}

export function abrirLancamento(l = {}) {
  const editando = !!l.id;
  const tipo = l.tipo || "receita";
  return formulario(editando ? "Editar lançamento" : tipo === "receita" ? "Nova receita" : "Nova despesa", [
    { nome: "descricao", rotulo: "Descrição", obrigatorio: true, dica: tipo === "receita" ? "Ex.: Mensalidade novembro" : "Ex.: Canva Pro" },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: [["receita", "Receita"], ["despesa", "Despesa"]], padrao: tipo, largura: "metade" },
    { nome: "categoria", rotulo: "Categoria", tipo: "select", opcoes: [...new Set([...CATEGORIAS_FIN.receita, ...CATEGORIAS_FIN.despesa])], padrao: tipo === "receita" ? "Avulso" : "Ferramentas", largura: "metade" },
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientes(), largura: "metade" },
    { nome: "valor", rotulo: "Valor (R$)", tipo: "number", obrigatorio: true, largura: "metade" },
    { nome: "vencimento", rotulo: "Vencimento", tipo: "date", padrao: hojeISO(), largura: "metade" },
    { nome: "status", rotulo: "Situação", tipo: "select", opcoes: [["pendente", "Pendente"], ["pago", "Pago"]], padrao: "pendente", largura: "metade" },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", linhas: 2 }
  ], l, {
    extras: editando ? [botaoExcluir("financeiro", l, `Excluir "${l.descricao}"?`)] : [],
    aoSalvar: async (v) => {
      v.pagoEm = v.status === "pago" ? (l.pagoEm || hojeISO()) : null;
      editando ? await atualizar("financeiro", l.id, v) : await criar("financeiro", v);
      avisar("Lançamento salvo.");
    }
  });
}

export function abrirOrcamento(o = {}) {
  const editando = !!o.id;
  return formulario(editando ? "Editar orçamento" : "Novo orçamento", [
    { nome: "para", rotulo: "Para quem", obrigatorio: true, dica: "Nome do cliente ou prospect", largura: "metade" },
    { nome: "clienteId", rotulo: "Cliente cadastrado (se já for)", tipo: "select", opcoes: opcoesClientes(), largura: "metade" },
    { nome: "descricao", rotulo: "Escopo", tipo: "textarea", linhas: 3, dica: "Ex.: Meta + Google + Landing Page" },
    { nome: "valor", rotulo: "Valor (R$)", tipo: "number", largura: "metade" },
    { nome: "recorrente", rotulo: "Valor mensal (recorrente)", tipo: "checkbox", padrao: true },
    { nome: "data", rotulo: "Enviado em", tipo: "date", padrao: hojeISO(), largura: "metade" },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: STATUS_ORCAMENTO, padrao: "rascunho", largura: "metade" },
    { nome: "link", rotulo: "Link da proposta (Drive/Canva)" }
  ], o, {
    extras: editando ? [botaoExcluir("orcamentos", o, "Excluir este orçamento?")] : [],
    aoSalvar: async (v) => { editando ? await atualizar("orcamentos", o.id, v) : await criar("orcamentos", v); avisar("Orçamento salvo."); }
  });
}

async function gerarMensalidades(mes) {
  if (!clientesAtivos().some((c) => Number(contrato(c.id).mensalidade) > 0) && !despesasFixas().length) { avisar("Nenhum cliente tem mensalidade cadastrada. Preencha em Editar, na ficha do cliente.", "erro"); return; }
  const novas = await garantirMes(mes);
  avisar(novas ? `${novas} lançamento(s) criado(s).` : "As mensalidades e despesas fixas deste mês já estavam criadas.");
}

/** Marca como pago tudo que está pendente no mês (ex.: fechar o mês no zero a zero). */
async function quitarMes(lista, mes) {
  const abertos = lista.filter((f) => f.status !== "pago");
  if (!abertos.length || !(await confirmar(`Marcar ${abertos.length} lançamento(s) de ${MESES[Number(mes.slice(5)) - 1]} como pagos?`))) return;
  for (const f of abertos) await atualizar("financeiro", f.id, { status: "pago", pagoEm: f.vencimento < hojeISO() ? f.vencimento : hojeISO() });
  avisar("Mês fechado: tudo pago.");
}

// Mensalidades do mês atual em diante entram sozinhas ao abrir o Financeiro (uma vez por mês e por sessão).
const tentados = new Set();
function mensalidadesAutomaticas(mes) {
  if (mes < hojeISO().slice(0, 7) || tentados.has(mes)) return;
  tentados.add(mes);
  garantirMes(mes).catch((e) => console.warn("Mensalidades:", e.message));
}

/** Contratos: quanto cada cliente paga por mês, custos fixos, reserva e a situação do mês escolhido. */
function abaContratos(estado) {
  const hoje = hojeISO();
  const clientes = clientesAtivos().map((c) => ({ c, k: contrato(c.id) })).sort((a, b) => (Number(b.k.mensalidade) || 0) - (Number(a.k.mensalidade) || 0) || a.c.nome.localeCompare(b.c.nome, "pt-BR"));
  const com = clientes.filter(({ k }) => Number(k.mensalidade) > 0);
  const sem = clientes.filter(({ k }) => !(Number(k.mensalidade) > 0));
  const total = com.reduce((s, { k }) => s + Number(k.mensalidade), 0);
  const custos = despesasFixas().reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const r = reserva();
  const lanc = (c) => dados.financeiro.find((f) => f.id === `mens-${c.id}-${estado.mes}`);
  const recebido = com.filter(({ c }) => lanc(c)?.status === "pago").reduce((s, { k }) => s + Number(k.mensalidade), 0);
  const admin = ehAdmin();
  return [
    el("div", { class: "resumo" },
      numero("Receita mensal dos contratos", fmtMoeda(total), "ok"),
      numero("Despesas fixas", fmtMoeda(custos)),
      r ? numero(`Reserva (${r}%)`, fmtMoeda(total * r / 100)) : null,
      numero("Sobra prevista no mês", fmtMoeda(total * (1 - r / 100) - custos), total * (1 - r / 100) - custos < 0 ? "alerta" : "")),
    el("div", { class: "com-acao" }, el("h2", {}, `Contratos (${com.length}) · ${MESES[Number(estado.mes.slice(5)) - 1]}: ${fmtMoeda(recebido)} recebido de ${fmtMoeda(total)}`)),
    com.length ? el("div", { class: "lista" }, com.map(({ c, k }) => {
      const f = lanc(c);
      const situacao = f?.status === "pago" ? ["ok", "Pago"] : f && f.vencimento < hoje ? ["alerta", "Vencido"] : f ? ["", "Pendente"] : ["", "—"];
      return el("div", { class: "linha-tabela" },
        seloCliente(c.id), el("a", { href: `#/clientes/${c.id}` }, el("strong", {}, c.nome)),
        el("span", { class: "subtitulo" }, [textoVencimento(k).replace(" de cada mês", ""), k.pagamento === "pre" ? "pré" : k.pagamento === "pos" ? "pós" : "", k.verbaAnuncios ? `verba ${k.verbaAnuncios}` : ""].filter(Boolean).join(" · ")),
        el("span", { class: "valor receita" }, fmtMoeda(Number(k.mensalidade)) + "/mês"),
        el("span", { class: `etiqueta ${situacao[0]}` }, situacao[1]),
        admin ? el("button", { class: "secundario mini", onClick: () => abrirGeradorContrato(c.id) }, k.dadosContrato ? "📄 Contrato" : "📄 Gerar contrato") : null);
    })) : vazio("Nenhum cliente com mensalidade. Preencha no Editar de cada cliente."),
    sem.length ? el("p", { class: "subtitulo" }, `Sem valor de contrato (${sem.length}): `, ...sem.flatMap(({ c }, i) => [i ? ", " : "",
      admin ? el("a", { href: "#/financeiro/contratos", onClick: (e) => { e.preventDefault(); abrirGeradorContrato(c.id); } }, c.nome) : el("a", { href: `#/clientes/${c.id}` }, c.nome)])) : null
  ];
}

export function render({ params, estado, renderizar }) {
  estado.mes ??= hojeISO().slice(0, 7);
  if (params?.[0] && estado.abaLink !== params[0]) { estado.abaLink = params[0]; estado.aba = params[0]; }
  if (estado.aba === "configurar" && !ehAdmin()) estado.aba = "lancamentos";
  mensalidadesAutomaticas(estado.mes);
  estado.aba ??= "lancamentos";
  const [ano, mes] = estado.mes.split("-").map(Number);
  const mudarMes = (n) => { const d = new Date(ano, mes - 1 + n, 1); estado.mes = hojeISO(d).slice(0, 7); renderizar(); };

  const doMes = dados.financeiro.filter((f) => f.vencimento?.startsWith(estado.mes))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const soma = (l) => l.reduce((s, f) => s + (f.valor || 0), 0);
  const receitas = doMes.filter((f) => f.tipo === "receita");
  const despesas = doMes.filter((f) => f.tipo === "despesa");
  const recebido = soma(receitas.filter((f) => f.status === "pago"));
  const pago = soma(despesas.filter((f) => f.status === "pago"));
  const hoje = hojeISO();
  const vencidasGerais = dados.financeiro.filter((f) => f.tipo === "receita" && f.status !== "pago" && f.vencimento < hoje);

  const linha = (f) => el("div", { class: `linha-tabela ${f.status === "pago" ? "feita" : ""}`, onClick: () => abrirLancamento(f) },
    el("button", {
      class: `check ${f.status === "pago" ? "marcado" : ""}`, "aria-label": f.status === "pago" ? "Marcar como pendente" : "Marcar como pago",
      onClick: async (e) => { e.stopPropagation(); const pagoAgora = f.status !== "pago"; await atualizar("financeiro", f.id, { status: pagoAgora ? "pago" : "pendente", pagoEm: pagoAgora ? hoje : null }); }
    }, f.status === "pago" ? "✓" : ""),
    el("span", { class: "data-mini" }, fmtData(f.vencimento, true)),
    el("strong", {}, f.descricao), seloCliente(f.clienteId),
    el("span", { class: "etiqueta" }, f.categoria || ""),
    el("span", { class: `valor ${f.tipo}` }, (f.tipo === "despesa" ? "− " : "") + fmtMoeda(f.valor)),
    el("span", { class: `etiqueta ${f.status === "pago" ? "ok" : f.vencimento < hoje ? "alerta" : ""}` },
      f.status === "pago" ? "Pago" : f.vencimento < hoje ? "Vencido" : "Pendente"));

  const orcs = [...dados.orcamentos].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const corpo = estado.aba === "contratos" ? abaContratos(estado) : estado.aba === "configurar" ? abaConfigurar() : estado.aba === "lancamentos" ? [
    el("div", { class: "resumo" },
      numero("Receitas previstas", fmtMoeda(soma(receitas))),
      numero("Recebido", fmtMoeda(recebido), "ok"),
      numero("Despesas", fmtMoeda(soma(despesas))),
      numero("Saldo do mês", fmtMoeda(recebido - pago), recebido - pago < 0 ? "alerta" : ""),
      reserva() ? numero(`Livre após a reserva de ${reserva()}%`, fmtMoeda(recebido * (1 - reserva() / 100) - pago), recebido * (1 - reserva() / 100) - pago < 0 ? "alerta" : "") : null),
    vencidasGerais.length ? el("p", { class: "faixa-alerta" },
      `${vencidasGerais.length} recebimento(s) vencido(s) no total: ${fmtMoeda(soma(vencidasGerais))} — ${[...new Set(vencidasGerais.map((f) => nomeCliente(f.clienteId)))].join(", ")}`) : null,
    el("div", { class: "com-acao" }, el("h2", {}, `Receitas (${receitas.length})`),
      estado.mes < hojeISO().slice(0, 7) ? el("button", { class: "secundario mini", onClick: () => gerarMensalidades(estado.mes) }, "Gerar mensalidades deste mês") : null),
    el("p", { class: "subtitulo" }, "As mensalidades dos contratos entram sozinhas todo mês. Marque ✓ quando o cliente pagar (ou conclua a tarefa de cobrança)."),
    receitas.length ? el("div", { class: "lista" }, receitas.map(linha)) : vazio("Nenhuma receita neste mês."),
    el("div", { class: "com-acao" }, el("h2", {}, `Despesas (${despesas.length})`),
      doMes.some((f) => f.status !== "pago") ? el("button", { class: "secundario mini", onClick: () => quitarMes(doMes, estado.mes) }, "✓ Marcar o mês todo como pago") : null),
    despesas.length ? el("div", { class: "lista" }, despesas.map(linha)) : vazio("Nenhuma despesa neste mês.")
  ] : [
    el("div", { class: "resumo" }, STATUS_ORCAMENTO.map(([s, r]) => {
      const l = orcs.filter((o) => o.status === s);
      return numero(r, `${l.length} · ${fmtMoeda(soma(l))}`, s === "aprovado" ? "ok" : "");
    })),
    orcs.length ? el("div", { class: "lista" }, orcs.map((o) =>
      el("div", { class: "linha-tabela", onClick: () => (ehAdmin() ? abrirOrcamentoNovo(o) : abrirOrcamento(o)) },
        el("span", { class: "data-mini" }, fmtData(o.data, true)), el("strong", {}, o.para),
        el("span", { class: "resumo-texto" }, o.descricao || ""),
        el("span", { class: "valor" }, o.itens ? [o.valorMensal ? fmtMoeda(o.valorMensal) + "/mês" : "", o.valorUnico ? fmtMoeda(o.valorUnico) + " único" : ""].filter(Boolean).join(" + ") : fmtMoeda(o.valor) + (o.recorrente ? "/mês" : "")),
        o.itens ? el("button", { class: "secundario mini", title: "Baixar a proposta em PDF", onClick: async (e) => { e.stopPropagation(); if (!(await abrirParaPDF(documentoOrcamento(o)))) avisar("Permita pop-ups para este site.", "erro"); } }, "PDF") : null,
        el("span", { class: `etiqueta st-orc-${o.status}` }, STATUS_ORCAMENTO.find(([v]) => v === o.status)?.[1] || o.status))))
      : vazio("Nenhum orçamento registrado.")
  ];

  return el("div", { class: "tela" },
    cabecalho("Financeiro", null,
      estado.aba === "configurar" ? null : estado.aba !== "orcamentos" ? [
        el("button", { class: "secundario", onClick: () => abrirLancamento({ tipo: "despesa", vencimento: estado.mes === hoje.slice(0, 7) ? hoje : `${estado.mes}-01` }) }, "+ Despesa"),
        el("button", { class: "destaque", onClick: () => abrirLancamento({ tipo: "receita", vencimento: estado.mes === hoje.slice(0, 7) ? hoje : `${estado.mes}-01` }) }, "+ Receita")
      ] : el("button", { class: "destaque", onClick: () => (ehAdmin() ? abrirOrcamentoNovo() : abrirOrcamento()) }, "+ Orçamento")),
    el("div", { class: "filtros" },
      abas([["lancamentos", "Receitas e despesas"], ["contratos", "Contratos"], ["orcamentos", "Orçamentos"], ...(ehAdmin() ? [["configurar", "⚙ Configurar"]] : [])], estado.aba, (a) => { estado.aba = a; renderizar(); }),
      ["lancamentos", "contratos"].includes(estado.aba) ? el("div", { class: "navegador-mes" },
        el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => mudarMes(-1) }, "‹"),
        el("strong", {}, `${MESES[mes - 1]} ${ano}`),
        el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => mudarMes(1) }, "›")) : null),
    corpo);
}

function numero(rotulo, valor, classe = "") {
  return el("div", { class: `numero ${classe}` }, el("strong", {}, valor), el("span", {}, rotulo));
}
