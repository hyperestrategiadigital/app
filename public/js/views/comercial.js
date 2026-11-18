// Contratos e orçamentos gerados pelo app (só administradores), e a aba Configurar do Financeiro:
// dados da Hyper, serviços e preços, despesas fixas, reserva, modelo do contrato e importação da planilha.
import { el, avisar, formulario, abrirModal, confirmar, fecharModais, hojeISO, addDias, fmtMoeda, normalizar } from "../ui.js";
import { dados, porId, contrato, salvarComId, criar, atualizar, opcoesClientes, clientesAtivos } from "../db.js";
import { STATUS_ORCAMENTO, CATEGORIAS_FIN } from "../constantes.js";
import {
  configComercial, servicosCatalogo, servicoPorNome, SERVICOS_PADRAO, MODELO_CONTRATO, textoContrato, documentoContrato,
  abrirParaPDF, baixarWord, totaisOrcamento, documentoOrcamento, despesasFixas, textoVencimento
} from "../comercial.js";
import { garantirMes } from "../recorrencias.js";

const proximoMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10); };
const nomeArquivo = (s) => normalizar(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Serviços do catálogo que combinam com os serviços marcados na ficha do cliente. */
function sugerirServicos(c) {
  const s = (c?.servicos || []).join(" ").toLowerCase();
  const ids = [];
  if (/meta|google|tráfego/.test(s)) ids.push("trafego");
  if (/social/.test(s)) ids.push("social");
  if (/vídeo/.test(s)) ids.push("video");
  if (/site|lp/.test(s)) ids.push("manutencao-lp");
  return servicosCatalogo().filter((x) => ids.includes(x.id)).map((x) => x.nome);
}

/* ---------------- Contrato ---------------- */

export async function abrirGeradorContrato(clienteId, base = {}) {
  const c = porId("clientes", clienteId);
  const k = contrato(clienteId);
  const salvo = k.dadosContrato || {};
  if (!configComercial().contratada?.nome) avisar("Dica: preencha os dados da Hyper em Financeiro → Configurar para sair no contrato.", "erro");
  const nomes = servicosCatalogo().map((s) => s.nome);
  const temTrafego = (v) => (v.servicos || []).some((n) => servicoPorNome(n)?.trafego);
  const temUnico = (v) => (v.servicos || []).some((n) => servicoPorNome(n)?.tipo === "unico");
  const promessa = formulario(`Contrato · ${c?.nome || ""}`, [
    { tipo: "secao", rotulo: "Contratante" },
    { nome: "contratante", rotulo: "Nome ou razão social", obrigatorio: true, largura: "metade", dica: "Como está no CNPJ ou no documento" },
    { nome: "documento", rotulo: "CNPJ ou CPF", largura: "metade", dica: "CNPJ 00.000.000/0001-00" },
    { tipo: "secao", rotulo: "Serviços" },
    { nome: "servicos", rotulo: "O que entra no contrato", tipo: "multi", opcoes: nomes },
    { tipo: "secao", rotulo: "Valores" },
    { nome: "desconto", rotulo: "Desconto sobre a tabela (%)", tipo: "number", largura: "metade", dica: "0" },
    { nome: "mensalidade", rotulo: "Valor mensal (R$)", tipo: "number", largura: "metade" },
    { nome: "pagamento", rotulo: "Pagamento", tipo: "select", opcoes: [["pos", "Pós-pago (paga o mês que passou)"], ["pre", "Pré-pago (paga antes)"], ["", "Não citar"]], largura: "metade" },
    { nome: "diaVencimento", rotulo: "Vencimento (dia)", tipo: "number", largura: "metade" },
    { nome: "vencimentoUtil", rotulo: "Contar em dias úteis (ex.: 5º dia útil)", tipo: "checkbox", largura: "metade" },
    { nome: "valorUnico", rotulo: "Valor do projeto único (R$)", tipo: "number", largura: "metade", mostrarSe: temUnico },
    { nome: "condicaoUnico", rotulo: "Como paga o projeto", largura: "metade", mostrarSe: temUnico, dica: "50% na aprovação e 50% na entrega" },
    { nome: "verba", rotulo: "Verba de anúncios prevista (opcional)", dica: "Ex.: R$ 600,00 por mês", mostrarSe: temTrafego },
    { tipo: "secao", rotulo: "Prazo" },
    { nome: "inicio", rotulo: "Início", tipo: "date", largura: "metade" },
    { nome: "meses", rotulo: "Duração (meses)", tipo: "number", largura: "metade" },
    { nome: "data", rotulo: "Data da assinatura", tipo: "date", largura: "metade" }
  ], {
    contratante: salvo.contratante || "", documento: salvo.documento || "",
    servicos: base.servicos || salvo.servicos || sugerirServicos(c),
    mensalidade: base.mensalidade ?? k.mensalidade ?? null, valorUnico: base.valorUnico ?? salvo.valorUnico ?? null,
    condicaoUnico: salvo.condicaoUnico || "50% na aprovação e 50% na entrega",
    pagamento: k.pagamento ?? "pos", diaVencimento: k.diaVencimento || 5, vencimentoUtil: k.vencimentoUtil ?? !k.diaVencimento,
    verba: salvo.verba || k.verbaAnuncios || "", inicio: salvo.inicio || proximoMes(), meses: salvo.meses || 12, data: hojeISO(),
    desconto: base.desconto ?? salvo.desconto ?? 0
  }, { rotuloSalvar: "Ver contrato", largo: true });
  ligarPrecos([...document.querySelectorAll(".modal form")].pop(), { preencher: base.mensalidade == null && base.valorUnico == null && !k.mensalidade });
  const v = await promessa;
  if (!v) return;
  if (!v.servicos.length) { avisar("Marque pelo menos um serviço.", "erro"); return abrirGeradorContrato(clienteId, base); }
  // Guarda o que foi usado: o próximo contrato do cliente já vem preenchido, e a mensalidade alimenta o Financeiro
  const { data, ...guardar } = v;
  await salvarComId("contratos", clienteId, {
    clienteId, dadosContrato: { ...guardar, geradoEm: Date.now() },
    ...(Number(v.mensalidade) > 0 ? { mensalidade: Number(v.mensalidade) } : {}),
    diaVencimento: Number(v.diaVencimento) || 5, vencimentoUtil: !!v.vencimentoUtil, pagamento: v.pagamento, verbaAnuncios: v.verba || ""
  });
  previaContrato(`Contrato ${c?.nome || ""}`, textoContrato({ ...v, data: data || hojeISO() }));
}

/** Preço de tabela dos serviços marcados (Financeiro → Configurar). */
export function precoTabela(nomes = []) {
  const servicos = nomes.map(servicoPorNome).filter(Boolean);
  const soma = (unico) => servicos.filter((s) => (s.tipo === "unico") === unico).reduce((t, s) => t + (Number(s.preco) || 0), 0);
  return { mensal: soma(false), unico: soma(true), semPreco: servicos.filter((s) => !(Number(s.preco) > 0)).map((s) => s.nome) };
}

/**
 * No formulário do contrato: marcar serviços ou mudar o desconto preenche os valores com a tabela de preços.
 * Dá para digitar outro valor por cima (combo, promoção); o resumo mostra o desconto que ficou.
 */
function ligarPrecos(form, { preencher }) {
  if (!form) return;
  const campo = (n) => form.querySelector(`#f-${n}`);
  const info = el("div", { class: "tabela-precos" });
  campo("mensalidade").closest("label").before(info);
  const arred = (x) => Math.round(x * 100) / 100;
  const aplicar = () => {
    const v = form.lerValores();
    const t = precoTabela(v.servicos);
    const d = Math.min(Math.max(Number(v.desconto) || 0, 0), 100) / 100;
    if (t.mensal) campo("mensalidade").value = arred(t.mensal * (1 - d));
    if (t.unico && campo("valorUnico")) campo("valorUnico").value = arred(t.unico * (1 - d));
    resumo();
  };
  const resumo = () => {
    const v = form.lerValores();
    const t = precoTabela(v.servicos);
    const partes = [];
    if (t.mensal) {
      const real = Number(v.mensalidade) || 0;
      const desc = t.mensal ? Math.round((1 - real / t.mensal) * 1000) / 10 : 0;
      partes.push(el("span", {}, "Tabela: ", el("strong", {}, `${fmtMoeda(t.mensal)}/mês`),
        real && Math.abs(real - t.mensal) > 0.009 ? ` → ${fmtMoeda(real)}/mês (${desc > 0 ? `${String(desc).replace(".", ",")}% de desconto` : `${String(-desc).replace(".", ",")}% acima da tabela`})` : ""));
    }
    if (t.unico) {
      const real = Number(v.valorUnico) || 0;
      partes.push(el("span", {}, "Projeto: ", el("strong", {}, fmtMoeda(t.unico)), real && Math.abs(real - t.unico) > 0.009 ? ` → ${fmtMoeda(real)}` : ""));
    }
    if (t.semPreco.length) partes.push(el("span", { class: "erro" }, `Sem preço na tabela: ${t.semPreco.join(", ")}.`));
    if (!(v.servicos || []).length) partes.push(el("span", { class: "subtitulo" }, "Marque os serviços para puxar os preços da tabela."));
    info.replaceChildren(...partes, el("a", { class: "link", href: "#/financeiro/configurar", onClick: () => fecharModais() }, "Editar a tabela de preços"));
  };
  form.querySelector("#f-servicos").addEventListener("change", aplicar);
  campo("desconto").addEventListener("input", aplicar);
  for (const n of ["mensalidade", "valorUnico"]) campo(n)?.addEventListener("input", resumo);
  if (preencher) aplicar(); else resumo();
}

function previaContrato(titulo, texto) {
  const area = el("textarea", { class: "previa-contrato", rows: 22, "aria-label": "Texto do contrato" });
  area.value = texto;
  const html = () => documentoContrato(titulo, area.value);
  abrirModal(titulo, el("div", {},
    el("p", { class: "subtitulo" }, "Confira e ajuste o texto aqui se precisar. Depois baixe em PDF (para enviar) ou em Word (para editar)."),
    area,
    el("div", { class: "acoes" },
      el("button", { class: "secundario", onClick: async () => { await navigator.clipboard.writeText(area.value).catch(() => {}); avisar("Texto copiado."); } }, "Copiar texto"),
      el("button", { class: "secundario", onClick: () => baixarWord(html(), nomeArquivo(titulo)) }, "⬇ Word"),
      el("button", { class: "destaque", onClick: async () => { if (!(await abrirParaPDF(html()))) avisar("Permita pop-ups para este site para gerar o PDF.", "erro"); } }, "⬇ PDF"))),
  { largo: true });
}

/* ---------------- Orçamento ---------------- */

export function abrirOrcamentoNovo(o = {}) {
  const editando = !!o.id;
  const catalogo = servicosCatalogo();
  const estado = {
    para: o.para || "", clienteId: o.clienteId || "", data: o.data || hojeISO(), validade: o.validade ?? 15, desconto: o.desconto ?? 0,
    status: o.status || "rascunho", observacoes: o.observacoes ?? "Início em até 7 dias após a aprovação.\nPagamento via PIX.",
    itens: (o.itens || []).map((i) => ({ ...i }))
  };
  if (!estado.itens.length) estado.itens.push(itemDe(catalogo[0]));

  const campo = (rotulo, entrada, largura = "metade") => el("label", { class: `campo ${largura}` }, el("span", {}, rotulo), entrada);
  const entrada = (k, { tag = "input", ...attrs } = {}) => {
    const i = el(tag, attrs);
    i.value = estado[k] ?? "";
    i.addEventListener("input", () => { estado[k] = attrs.type === "number" ? Number(i.value) || 0 : i.value; atualizarTotais(); });
    return i;
  };
  const cliente = el("select", { onChange: (e) => { estado.clienteId = e.target.value; if (!estado.para) { estado.para = porId("clientes", e.target.value)?.nome || ""; para.value = estado.para; } } },
    opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === estado.clienteId }, v ? r : "— Ainda não é cliente —")));
  const para = entrada("para", { placeholder: "Nome da empresa ou pessoa", required: true });
  const status = el("select", { onChange: (e) => (estado.status = e.target.value) }, STATUS_ORCAMENTO.map(([v, r]) => el("option", { value: v, selected: v === estado.status }, r)));
  const lista = el("div", { class: "itens-orcamento" });
  const totais = el("div", { class: "totais-orcamento" });

  function atualizarTotais() {
    const t = totaisOrcamento(estado);
    totais.replaceChildren(...[
      t.mensal ? el("strong", {}, `${fmtMoeda(t.mensal)}/mês`) : null,
      t.unico ? el("strong", {}, `${fmtMoeda(t.unico)} único`) : null,
      !t.mensal && !t.unico ? el("span", { class: "subtitulo" }, "Coloque os preços dos serviços.") : null,
      Number(estado.desconto) ? el("span", { class: "subtitulo" }, `com ${estado.desconto}% de desconto`) : null].filter(Boolean));
  }
  function desenhar() {
    lista.replaceChildren(...estado.itens.map((item, i) => {
      const nome = el("select", { "aria-label": "Serviço", onChange: (e) => {
        const s = catalogo.find((x) => x.nome === e.target.value);
        estado.itens[i] = s ? itemDe(s, item.qtd) : { ...item, nome: "", descricao: "" };
        desenhar();
      } }, [...catalogo.map((s) => el("option", { value: s.nome, selected: s.nome === item.nome }, s.nome)),
        el("option", { value: "", selected: !catalogo.some((s) => s.nome === item.nome) }, "Outro (escrever)")]);
      const livre = el("input", { placeholder: "Nome do serviço", value: item.nome, "aria-label": "Nome do serviço", onInput: (e) => (item.nome = e.target.value) });
      const num = (k, rotulo) => el("input", { type: "number", step: "0.01", min: "0", value: item[k] ?? "", "aria-label": rotulo, title: rotulo, onInput: (e) => { item[k] = Number(e.target.value) || 0; atualizarTotais(); } });
      const tipo = el("select", { "aria-label": "Cobrança", onChange: (e) => { item.tipo = e.target.value; atualizarTotais(); } },
        [["mensal", "por mês"], ["unico", "único"]].map(([v, r]) => el("option", { value: v, selected: (item.tipo || "mensal") === v }, r)));
      return el("div", { class: "item-orcamento" },
        el("div", { class: "item-nome" }, nome, catalogo.some((s) => s.nome === item.nome) ? null : livre,
          el("input", { class: "item-desc", placeholder: "Descrição (aparece na proposta)", value: item.descricao || "", "aria-label": "Descrição", onInput: (e) => (item.descricao = e.target.value) })),
        el("label", { class: "item-num" }, el("span", {}, "Preço"), num("preco", "Preço (R$)")),
        el("label", { class: "item-qtd" }, el("span", {}, "Qtd."), num("qtd", "Quantidade")),
        tipo,
        el("button", { class: "icone", "aria-label": "Remover serviço", onClick: () => { estado.itens.splice(i, 1); desenhar(); } }, "✕"));
    }));
    atualizarTotais();
  }
  desenhar();

  const salvar = async () => {
    if (!estado.para.trim()) { avisar("Diga para quem é o orçamento.", "erro"); return null; }
    const t = totaisOrcamento(estado);
    const itens = estado.itens.filter((i) => i.nome);
    const v = { ...estado, itens, valorMensal: t.mensal, valorUnico: t.unico, valor: t.mensal || t.unico, recorrente: t.mensal > 0, descricao: itens.map((i) => i.nome).join(" + ") };
    if (editando) { await atualizar("orcamentos", o.id, v); return { ...o, ...v }; }
    const ref = await criar("orcamentos", v);
    return { ...v, id: ref.id };
  };
  const fechar = abrirModal(editando ? `Orçamento · ${o.para}` : "Novo orçamento", el("div", {},
    el("div", { class: "form-grade" },
      campo("Para quem", para), campo("Cliente cadastrado", cliente),
      campo("Data", entrada("data", { type: "date" })), campo("Validade (dias)", entrada("validade", { type: "number", min: "0" })),
      campo("Desconto (%)", entrada("desconto", { type: "number", min: "0", max: "100", step: "0.5" })), campo("Situação", status)),
    el("h3", { class: "form-secao" }, "Serviços"),
    lista,
    el("div", { class: "acoes-esquerda" }, el("button", { class: "secundario mini", onClick: () => { estado.itens.push(itemDe(catalogo[0])); desenhar(); } }, "+ Serviço"),
      el("a", { class: "link", href: "#/financeiro/configurar", onClick: () => fechar() }, "Editar preços dos serviços")),
    totais,
    campo("Observações (aparecem na proposta)", entrada("observacoes", { tag: "textarea", rows: 3 }), ""),
    el("div", { class: "acoes" },
      el("button", { class: "secundario", onClick: async () => { if (await salvar()) { fechar(); avisar("Orçamento salvo."); } } }, "Salvar"),
      estado.status === "aprovado" || editando ? el("button", { class: "secundario", onClick: async () => { const s = await salvar(); if (s) { fechar(); await contratoDoOrcamento(s); } } }, "📄 Gerar contrato") : null,
      el("button", { class: "destaque", onClick: async () => {
        if (!estado.para.trim()) { avisar("Diga para quem é o orçamento.", "erro"); return; }
        const pdf = abrirParaPDF(salvar().then((s) => documentoOrcamento(s)));
        fechar();
        if (!(await pdf)) avisar("Permita pop-ups para este site para gerar o PDF.", "erro");
        else avisar("Orçamento salvo.");
      } }, "Salvar e baixar PDF"))), { largo: true });
}

function itemDe(s, qtd = 1) {
  return s ? { nome: s.nome, descricao: s.descricao || "", preco: Number(s.preco) || 0, qtd, tipo: s.tipo || "mensal" } : { nome: "", descricao: "", preco: 0, qtd, tipo: "mensal" };
}

/** Orçamento aprovado → contrato. Se ainda não é cliente, cria o cliente antes. */
async function contratoDoOrcamento(o) {
  let clienteId = o.clienteId;
  if (!clienteId) {
    if (!(await confirmar(`${o.para} ainda não é cliente. Criar o cliente e gerar o contrato?`))) return;
    clienteId = (await criar("clientes", { nome: o.para, ativo: true, servicos: [], paleta: ["#4E2CA3"], cor: "#4E2CA3" })).id;
    await atualizar("orcamentos", o.id, { clienteId, status: "aprovado" });
  }
  const t = totaisOrcamento(o);
  const nomes = servicosCatalogo().map((s) => s.nome);
  await abrirGeradorContrato(clienteId, { servicos: (o.itens || []).map((i) => i.nome).filter((n) => nomes.includes(n)), mensalidade: t.mensal || null, valorUnico: t.unico || null, desconto: Number(o.desconto) || 0 });
}

/* ---------------- Configurar (Financeiro) ---------------- */

export function abaConfigurar() {
  const cfg = configComercial();
  const salvar = async (valores, msg) => { await salvarComId("config", "comercial", valores); avisar(msg); };

  // Dados da Hyper
  const hyper = { nome: "", documento: "", cidade: "", foro: "", contato: "", ...(cfg.contratada || {}) };
  const campoTexto = (obj, k, rotulo, dica, largura = "metade") => {
    const i = el("input", { value: obj[k] || "", placeholder: dica, onInput: (e) => (obj[k] = e.target.value) });
    return el("label", { class: `campo ${largura}` }, el("span", {}, rotulo), i);
  };
  const reservaEntrada = el("input", { type: "number", min: "0", max: "100", value: cfg.reserva ?? "" });

  // Serviços
  const servicos = (cfg.servicos?.length ? cfg.servicos : SERVICOS_PADRAO).map((s) => ({ ...s, itens: [...(s.itens || [])] }));
  const listaServicos = el("div", { class: "lista-config" });
  const desenharServicos = () => listaServicos.replaceChildren(...servicos.map((s, i) => el("details", { class: "item-config" },
    el("summary", {}, el("strong", {}, s.nome || "Serviço novo"), el("span", { class: "subtitulo" }, ` · ${s.preco ? fmtMoeda(s.preco) : "sem preço"}${s.tipo === "unico" ? " (único)" : "/mês"}`)),
    el("div", { class: "form-grade" },
      campoTexto(s, "nome", "Nome", "Ex.: Gestão de tráfego pago", ""),
      el("label", { class: "campo metade" }, el("span", {}, "Preço (R$)"), el("input", { type: "number", step: "0.01", value: s.preco || "", onInput: (e) => (s.preco = Number(e.target.value) || 0) })),
      el("label", { class: "campo metade" }, el("span", {}, "Cobrança"), el("select", { onChange: (e) => (s.tipo = e.target.value) },
        [["mensal", "Por mês"], ["unico", "Valor único (projeto)"]].map(([v, r]) => el("option", { value: v, selected: (s.tipo || "mensal") === v }, r)))),
      campoTexto(s, "descricao", "Descrição na proposta", "Uma linha", ""),
      el("label", { class: "campo" }, el("span", {}, "Itens no contrato (um por linha)"),
        (() => { const a = el("textarea", { rows: 4 }); a.value = s.itens.join("\n"); a.addEventListener("input", () => (s.itens = a.value.split("\n").map((l) => l.trim()).filter(Boolean))); return a; })()),
      el("label", { class: "campo campo-check" }, el("input", { type: "checkbox", checked: !!s.trafego, onChange: (e) => (s.trafego = e.target.checked) }), el("span", {}, "É tráfego pago (inclui a cláusula da verba de anúncios)")),
      el("button", { class: "perigo-texto", onClick: () => { servicos.splice(i, 1); desenharServicos(); } }, "Remover serviço")))));
  desenharServicos();

  // Despesas fixas
  const fixas = despesasFixas().map((f) => ({ ...f }));
  const listaFixas = el("div", { class: "lista-fixas" });
  const desenharFixas = () => listaFixas.replaceChildren(...fixas.map((f, i) => el("div", { class: "fixa" },
    el("input", { value: f.descricao || "", placeholder: "Descrição", "aria-label": "Descrição", onInput: (e) => (f.descricao = e.target.value) }),
    el("input", { type: "number", step: "0.01", value: f.valor ?? "", placeholder: "Valor", "aria-label": "Valor", onInput: (e) => (f.valor = Number(e.target.value) || 0) }),
    el("input", { type: "number", min: "1", max: "31", value: f.dia ?? "", placeholder: "Dia", "aria-label": "Dia do vencimento", onInput: (e) => (f.dia = Number(e.target.value) || 10) }),
    el("select", { "aria-label": "Categoria", onChange: (e) => (f.categoria = e.target.value) }, CATEGORIAS_FIN.despesa.map((c) => el("option", { value: c, selected: c === (f.categoria || "Ferramentas") }, c))),
    el("button", { class: "icone", "aria-label": "Remover", onClick: () => { fixas.splice(i, 1); desenharFixas(); } }, "✕"))));
  desenharFixas();

  // Modelo do contrato
  const modelo = el("textarea", { rows: 16, class: "previa-contrato" });
  modelo.value = cfg.modeloContrato || MODELO_CONTRATO;

  return [
    el("section", { class: "bloco" },
      el("h2", {}, "Dados da Hyper nos contratos e propostas"),
      el("div", { class: "form-grade" },
        campoTexto(hyper, "nome", "Nome / razão social (CONTRATADA)", "Seu nome completo ou razão social"),
        campoTexto(hyper, "documento", "Documento", "CNPJ 00.000.000/0001-00"),
        campoTexto(hyper, "cidade", "Cidade da assinatura", "Cidade/UF"),
        campoTexto(hyper, "foro", "Foro", "Cidade/UF"),
        campoTexto(hyper, "contato", "Contato na proposta", "WhatsApp ou e-mail", ""),
        el("label", { class: "campo metade" }, el("span", {}, "Reserva sobre as receitas (%)"), reservaEntrada)),
      el("p", { class: "subtitulo" }, "A reserva (ex.: 30% para impostos e caixa) aparece no Financeiro como \"livre após a reserva\"."),
      el("button", { onClick: () => salvar({ contratada: hyper, reserva: Number(reservaEntrada.value) || 0 }, "Dados salvos.") }, "Salvar")),
    el("section", { class: "bloco" },
      el("h2", {}, "Serviços e preços"),
      el("p", { class: "subtitulo" }, "Usados para montar orçamentos e contratos. O preço é só a sugestão: dá para mudar em cada orçamento."),
      listaServicos,
      el("div", { class: "acoes" },
        el("button", { class: "secundario mini", onClick: () => { servicos.push({ id: `s-${Date.now()}`, nome: "", tipo: "mensal", preco: 0, descricao: "", itens: [] }); desenharServicos(); listaServicos.lastChild.open = true; } }, "+ Serviço"),
        el("button", { onClick: () => salvar({ servicos: servicos.filter((s) => s.nome.trim()) }, "Serviços salvos.") }, "Salvar serviços"))),
    el("section", { class: "bloco" },
      el("h2", {}, `Despesas fixas (${fmtMoeda(fixas.reduce((s, f) => s + (Number(f.valor) || 0), 0))}/mês)`),
      el("p", { class: "subtitulo" }, "Entram sozinhas em Receitas e despesas todo mês, no dia indicado. Descrição · valor · dia · categoria."),
      listaFixas,
      el("div", { class: "acoes" },
        el("button", { class: "secundario mini", onClick: () => { fixas.push({ id: `f-${Date.now()}`, descricao: "", valor: 0, dia: 10, categoria: "Ferramentas" }); desenharFixas(); } }, "+ Despesa fixa"),
        el("button", { onClick: async () => {
          await salvar({ despesasFixas: fixas.filter((f) => f.descricao.trim()).map((f) => ({ ...f, id: f.id || `f-${nomeArquivo(f.descricao)}` })) }, "Despesas fixas salvas.");
          garantirMes(hojeISO().slice(0, 7)).catch(() => {});
        } }, "Salvar despesas"))),
    el("section", { class: "bloco" },
      el("h2", {}, "Modelo do contrato"),
      el("details", {}, el("summary", {}, "Editar o texto padrão"),
        el("p", { class: "subtitulo" }, "Campos trocados automaticamente: {{CONTRATANTE}}, {{DOC_CONTRATANTE}}, {{CONTRATADA}}, {{DOC_CONTRATADA}}, {{OBJETO}}, {{ITENS}}, {{INICIO}}, {{MESES}}, {{FIM}}, {{VALORES}}, {{VERBA}}, {{FORO}}, {{CIDADE}}, {{DATA}}, {{ASSINATURAS}}."),
        modelo,
        el("div", { class: "acoes" },
          el("button", { class: "secundario", onClick: async () => { if (await confirmar("Voltar ao texto padrão do contrato?")) { modelo.value = MODELO_CONTRATO; await salvar({ modeloContrato: "" }, "Modelo padrão restaurado."); } } }, "Voltar ao padrão"),
          el("button", { onClick: () => salvar({ modeloContrato: modelo.value === MODELO_CONTRATO ? "" : modelo.value }, "Modelo salvo.") }, "Salvar modelo")))),
    el("section", { class: "bloco" },
      el("h2", {}, "Importar da planilha"),
      el("p", { class: "subtitulo" }, "Arquivo .json preparado pelo Claude com contratos, despesas fixas, preços e lançamentos avulsos. Você confere antes de aplicar."),
      el("label", { class: "botao-link secundario" }, "Escolher arquivo .json",
        el("input", { type: "file", accept: ".json,application/json", hidden: true, onChange: async (e) => {
          const f = e.target.files[0]; e.target.value = "";
          if (!f) return;
          try { const j = JSON.parse(await f.text()); if (j.tipo !== "financeiro-hyper") throw new Error("Esse arquivo não é de financeiro."); previaImportacao(j); }
          catch (erro) { avisar("Não consegui ler: " + erro.message, "erro"); }
        } })))
  ];
}

/* ---------------- Importação ---------------- */

const chave = (s) => normalizar(s || "").replace(/[^a-z0-9]/g, "");
function acharCliente(nome) {
  const k = chave(nome);
  const ativos = clientesAtivos();
  return ativos.find((c) => chave(c.nome) === k) || ativos.find((c) => chave(c.nome).includes(k) || k.includes(chave(c.nome))) || null;
}

/** { tipo: "financeiro-hyper", contratada, reserva, servicos, despesasFixas, contratos: [{ cliente, mensalidade, diaVencimento, vencimentoUtil, pagamento, verbaAnuncios, observacao }], avulsos: [{ cliente, descricao, valor, vencimento, categoria }], quitarAte: "AAAA-MM" } */
export function previaImportacao(j) {
  const contratos = (j.contratos || []).map((k) => ({ ...k, sel: el("select", { "aria-label": `Cliente para ${k.cliente}` },
    el("option", { value: "" }, "— não importar —"),
    clientesAtivos().map((c) => el("option", { value: c.id, selected: c.id === acharCliente(k.cliente)?.id }, c.nome))) }));
  const avulsos = (j.avulsos || []).map((a) => ({ ...a, clienteId: acharCliente(a.cliente)?.id || "" }));
  const status = el("p", { class: "subtitulo" });
  const fechar = abrirModal("Importar financeiro", el("div", {},
    contratos.length ? [el("h3", { class: "form-secao" }, "Contratos (confira o cliente de cada linha)"),
      el("div", { class: "lista" }, contratos.map((k) => el("div", { class: "linha-importar" },
        el("span", {}, el("strong", {}, k.cliente), el("br"), el("small", { class: "subtitulo" }, `${fmtMoeda(k.mensalidade)}/mês · ${textoVencimento(k)}${k.pagamento ? ` · ${k.pagamento === "pre" ? "pré" : "pós"}` : ""}${k.observacao ? ` · ${k.observacao}` : ""}`)),
        k.sel)))] : null,
    j.despesasFixas ? el("p", {}, `Despesas fixas: ${j.despesasFixas.length} (${fmtMoeda(j.despesasFixas.reduce((s, f) => s + f.valor, 0))}/mês) — substituem a lista atual.`) : null,
    j.servicos ? el("p", {}, `Serviços e preços: ${j.servicos.map((s) => `${s.nome}${s.preco ? ` (${fmtMoeda(s.preco)})` : ""}`).join(", ")}.`) : null,
    j.contratada ? el("p", {}, `Dados da Hyper: ${j.contratada.nome || ""} · ${j.contratada.documento || ""}.`) : null,
    j.reserva != null ? el("p", {}, `Reserva sobre as receitas: ${j.reserva}%.`) : null,
    avulsos.length ? el("p", {}, `Lançamentos avulsos: ${avulsos.map((a) => `${a.descricao} ${fmtMoeda(a.valor)} em ${a.vencimento.split("-").reverse().join("/")}${a.clienteId ? "" : " (sem cliente)"}`).join("; ")}.`) : null,
    j.quitarAte ? el("p", { class: "faixa-aviso" }, `Tudo que vence até o fim de ${j.quitarAte.split("-").reverse().join("/")} fica marcado como pago (zero a zero).`) : null,
    status,
    el("div", { class: "acoes" },
      el("button", { class: "secundario", onClick: () => fechar() }, "Cancelar"),
      el("button", { class: "destaque", onClick: async (e) => {
        const botao = e.currentTarget;
        botao.disabled = true;
        try {
          await aplicarImportacao(j, contratos.map((k) => ({ ...k, clienteId: k.sel.value })), avulsos, (m) => (status.textContent = m));
          fechar();
          avisar("Financeiro importado.");
        } catch (erro) { console.error(erro); avisar(erro.message, "erro"); botao.disabled = false; }
      } }, "Importar"))), { largo: true });
}

async function aplicarImportacao(j, contratos, avulsos, progresso) {
  const cfg = {};
  for (const k of ["contratada", "reserva", "servicos", "despesasFixas"]) if (j[k] != null) cfg[k] = j[k];
  if (Object.keys(cfg).length) { progresso("Salvando configurações…"); await salvarComId("config", "comercial", cfg); }
  for (const k of contratos.filter((x) => x.clienteId)) {
    progresso(`Contrato: ${k.cliente}…`);
    await salvarComId("contratos", k.clienteId, {
      clienteId: k.clienteId, mensalidade: Number(k.mensalidade) || 0, diaVencimento: Number(k.diaVencimento) || 10,
      vencimentoUtil: !!k.vencimentoUtil, pagamento: k.pagamento || "", verbaAnuncios: k.verbaAnuncios || "", observacaoContrato: k.observacao || ""
    });
  }
  for (const a of avulsos) {
    progresso(`Lançamento: ${a.descricao}…`);
    await salvarComId("financeiro", `avulso-${chave(a.descricao)}-${a.vencimento}`, {
      descricao: a.descricao, tipo: a.tipo || "receita", categoria: a.categoria || "Projeto", clienteId: a.clienteId || "",
      valor: Number(a.valor) || 0, vencimento: a.vencimento, status: "pendente", pagoEm: null, criadoEm: Date.now()
    });
  }
  if (j.quitarAte) {
    await new Promise((r) => setTimeout(r, 400)); // espera os contratos novos chegarem na memória
    for (let mes = hojeISO().slice(0, 7); mes <= j.quitarAte; mes = addDias(`${mes}-28`, 7).slice(0, 7)) {
      progresso(`Gerando ${mes}…`);
      await garantirMes(mes);
    }
    await new Promise((r) => setTimeout(r, 400));
    const fim = `${j.quitarAte}-31`;
    const abertos = dados.financeiro.filter((f) => f.status !== "pago" && f.vencimento && f.vencimento <= fim);
    progresso(`Marcando ${abertos.length} lançamento(s) como pagos…`);
    for (const f of abertos) await atualizar("financeiro", f.id, { status: "pago", pagoEm: f.vencimento < hojeISO() ? f.vencimento : hojeISO() });
  }
}
