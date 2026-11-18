// Financeiro: receitas e despesas do mês, mensalidades automáticas e orçamentos.
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
  const [a, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(a, m, 0).getDate();
  const comMensalidade = clientesAtivos().map((c) => ({ ...c, ...contrato(c.id), id: c.id })).filter((c) => c.mensalidade > 0);
  if (!comMensalidade.length) { avisar("Nenhum cliente tem mensalidade cadastrada. Preencha na ficha do cliente.", "erro"); return; }
  let novas = 0;
  for (const c of comMensalidade) {
    const id = `mens-${c.id}-${mes}`;
    if (dados.financeiro.some((f) => f.id === id)) continue;
    const dia = String(Math.min(Number(c.diaVencimento) || 10, ultimoDia)).padStart(2, "0");
    await salvarComId("financeiro", id, {
      descricao: `Mensalidade ${MESES[m - 1]}`, tipo: "receita", categoria: "Mensalidade", clienteId: c.id,
      valor: c.mensalidade, vencimento: `${mes}-${dia}`, status: "pendente", pagoEm: null, criadoEm: Date.now()
    });
    novas++;
  }
  avisar(novas ? `${novas} mensalidade(s) criada(s).` : "As mensalidades deste mês já estavam criadas.");
}

export function render({ estado, renderizar }) {
  estado.mes ??= hojeISO().slice(0, 7);
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
  const corpo = estado.aba === "lancamentos" ? [
    el("div", { class: "resumo" },
      numero("Receitas previstas", fmtMoeda(soma(receitas))),
      numero("Recebido", fmtMoeda(recebido), "ok"),
      numero("Despesas", fmtMoeda(soma(despesas))),
      numero("Saldo do mês", fmtMoeda(recebido - pago), recebido - pago < 0 ? "alerta" : "")),
    vencidasGerais.length ? el("p", { class: "faixa-alerta" },
      `${vencidasGerais.length} recebimento(s) vencido(s) no total: ${fmtMoeda(soma(vencidasGerais))} — ${[...new Set(vencidasGerais.map((f) => nomeCliente(f.clienteId)))].join(", ")}`) : null,
    el("div", { class: "com-acao" }, el("h2", {}, `Receitas (${receitas.length})`),
      el("button", { class: "secundario mini", onClick: () => gerarMensalidades(estado.mes) }, "Gerar mensalidades do mês")),
    receitas.length ? el("div", { class: "lista" }, receitas.map(linha)) : vazio("Nenhuma receita neste mês."),
    el("h2", {}, `Despesas (${despesas.length})`),
    despesas.length ? el("div", { class: "lista" }, despesas.map(linha)) : vazio("Nenhuma despesa neste mês.")
  ] : [
    el("div", { class: "resumo" }, STATUS_ORCAMENTO.map(([s, r]) => {
      const l = orcs.filter((o) => o.status === s);
      return numero(r, `${l.length} · ${fmtMoeda(soma(l))}`, s === "aprovado" ? "ok" : "");
    })),
    orcs.length ? el("div", { class: "lista" }, orcs.map((o) =>
      el("div", { class: "linha-tabela", onClick: () => abrirOrcamento(o) },
        el("span", { class: "data-mini" }, fmtData(o.data, true)), el("strong", {}, o.para),
        el("span", { class: "resumo-texto" }, o.descricao || ""),
        el("span", { class: "valor" }, fmtMoeda(o.valor) + (o.recorrente ? "/mês" : "")),
        el("span", { class: `etiqueta st-orc-${o.status}` }, STATUS_ORCAMENTO.find(([v]) => v === o.status)?.[1] || o.status))))
      : vazio("Nenhum orçamento registrado.")
  ];

  return el("div", { class: "tela" },
    cabecalho("Financeiro", null,
      estado.aba === "lancamentos" ? [
        el("button", { class: "secundario", onClick: () => abrirLancamento({ tipo: "despesa", vencimento: estado.mes === hoje.slice(0, 7) ? hoje : `${estado.mes}-01` }) }, "+ Despesa"),
        el("button", { class: "destaque", onClick: () => abrirLancamento({ tipo: "receita", vencimento: estado.mes === hoje.slice(0, 7) ? hoje : `${estado.mes}-01` }) }, "+ Receita")
      ] : el("button", { class: "destaque", onClick: () => abrirOrcamento() }, "+ Orçamento")),
    el("div", { class: "filtros" },
      abas([["lancamentos", "Receitas e despesas"], ["orcamentos", "Orçamentos"]], estado.aba, (a) => { estado.aba = a; renderizar(); }),
      estado.aba === "lancamentos" ? el("div", { class: "navegador-mes" },
        el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => mudarMes(-1) }, "‹"),
        el("strong", {}, `${MESES[mes - 1]} ${ano}`),
        el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => mudarMes(1) }, "›")) : null),
    corpo);
}

function numero(rotulo, valor, classe = "") {
  return el("div", { class: `numero ${classe}` }, el("strong", {}, valor), el("span", {}, rotulo));
}
