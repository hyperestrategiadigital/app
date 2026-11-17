// Rotinas: lembretes que viram tarefas sozinhos na agenda, seguindo o ritmo da Hyper
// (produzir a semana seguinte, planejar o mês seguinte, cobrar no vencimento).
import { el, formulario, confirmar, avisar, hojeISO, fmtData, fmtDiaSemana, vazio, normalizar } from "../ui.js";
import { dados, criar, atualizar, excluir, nomeCliente, opcoesClientes, clientesAtivos } from "../db.js";
import { cabecalho } from "./componentes.js";
import { TIPOS_TAREFA, DIAS_SEMANA } from "../constantes.js";
import { gerarRecorrencias, descreverRotina, proximaData } from "../recorrencias.js";

const MODELOS = {
  producao: { titulo: "Produção da semana seguinte", icone: "▶", texto: "Toda semana, no dia escolhido, entra a tarefa \"Produzir semana DD/MM\" com os posts da semana seguinte do cliente." },
  planejamento: { titulo: "Planejamento do mês seguinte", icone: "☷", texto: "Todo mês, no dia escolhido, entra \"Planejar <mês seguinte>\" com atalho para o calendário de planejamento do cliente." },
  cobranca: { titulo: "Cobrança da mensalidade", icone: "$", texto: "Todo mês, no dia de vencimento da ficha do cliente (ou alguns dias antes), entra \"Cobrar mensalidade\"." },
  livre: { titulo: "Rotinas livres", icone: "↻", texto: "Qualquer tarefa que se repete: Manutenção TP, Organizar Semana, reuniões..." }
};

const regerar = () => setTimeout(() => gerarRecorrencias().catch(console.error), 400);
const temServico = (c, trecho) => (c.servicos || []).some((s) => s.includes(trecho));

/** Sugestões do seu histórico: Manutenção TP toda sexta e Organizar Semana toda segunda. */
async function criarSugestoes() {
  const existentes = new Set(dados.recorrencias.map((r) => `${normalizar(r.titulo)}|${r.clienteId || ""}`));
  const novas = [];
  for (const c of clientesAtivos()) {
    if ((c.servicos || []).some((s) => s.includes("Ads")) && !existentes.has(`manutencao tp|${c.id}`))
      novas.push({ titulo: "Manutenção TP", clienteId: c.id, tipo: "Tráfego pago", frequencia: "semanal", diaSemana: "5" });
  }
  const hyper = dados.clientes.find((c) => normalizar(c.nome) === "hyper");
  if (!existentes.has(`organizar semana|${hyper?.id || ""}`))
    novas.push({ titulo: "Organizar Semana", clienteId: hyper?.id || "", tipo: "Organização", frequencia: "semanal", diaSemana: "1" });
  if (!novas.length) { avisar("As recorrências sugeridas já existem."); return; }
  for (const n of novas) await criar("recorrencias", { ...n, modelo: "livre", ativo: true, checklist: [], inicio: hojeISO(), geradasAte: null });
  regerar();
  avisar(`${novas.length} recorrência(s) criada(s).`);
}

/** Cria uma rotina de modelo para vários clientes de uma vez. */
async function novaRotinaModelo(modelo) {
  const clientes = clientesAtivos();
  const jaTem = new Set(dados.recorrencias.filter((r) => r.modelo === modelo).map((r) => r.clienteId));
  const sugeridos = clientes.filter((c) => !jaTem.has(c.id) && (
    modelo === "cobranca" ? c.mensalidade > 0 : modelo === "producao" || modelo === "planejamento" ? temServico(c, "Social") || !(c.servicos || []).length : true));
  const campos = [
    { nome: "clientes", rotulo: "Clientes", tipo: "multi", opcoes: clientes.map((c) => c.nome) },
    ...(modelo === "producao" ? [{ nome: "diaSemana", rotulo: "Dia da semana para produzir", tipo: "select", opcoes: DIAS_SEMANA, padrao: "1", largura: "metade" }] : []),
    ...(modelo === "planejamento" ? [{ nome: "diaMes", rotulo: "Dia do mês para planejar", tipo: "number", padrao: 20, largura: "metade" }] : []),
    ...(modelo === "cobranca" ? [{ nome: "antecedencia", rotulo: "Quando cobrar", tipo: "select", opcoes: [["0", "No dia do vencimento"], ["1", "1 dia antes"], ["3", "3 dias antes"], ["5", "5 dias antes"]], padrao: "0", largura: "metade" }] : [])
  ];
  const r = await formulario(MODELOS[modelo].titulo, campos, { clientes: sugeridos.map((c) => c.nome) }, { rotuloSalvar: "Criar rotinas", largo: true });
  if (!r) return;
  const escolhidos = clientes.filter((c) => r.clientes.includes(c.nome));
  if (!escolhidos.length) { avisar("Escolha pelo menos um cliente.", "erro"); return; }
  const semVencimento = modelo === "cobranca" ? escolhidos.filter((c) => !c.diaVencimento) : [];
  for (const c of escolhidos) {
    await criar("recorrencias", {
      modelo, clienteId: c.id, ativo: true, inicio: hojeISO(), geradasAte: null, checklist: [],
      frequencia: modelo === "producao" ? "semanal" : "mensal",
      diaSemana: String(r.diaSemana ?? "1"), diaMes: Number(r.diaMes) || 20, antecedencia: Number(r.antecedencia) || 0,
      titulo: MODELOS[modelo].titulo
    });
  }
  regerar();
  avisar(`${escolhidos.length} rotina(s) criada(s).` + (semVencimento.length ? ` Sem dia de vencimento na ficha (usando dia 10): ${semVencimento.map((c) => c.nome).join(", ")}.` : ""));
}

function editarRotina(r) {
  const modelo = r.modelo || "livre";
  const campos = modelo === "livre" ? [
    { nome: "titulo", rotulo: "Tarefa", obrigatorio: true, dica: "Ex.: Manutenção TP" },
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientes(), largura: "metade" },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS_TAREFA, padrao: "Tráfego pago", largura: "metade" },
    { nome: "frequencia", rotulo: "Frequência", tipo: "select", opcoes: [["semanal", "Semanal"], ["quinzenal", "Quinzenal"], ["mensal", "Mensal"]], padrao: "semanal", largura: "metade" },
    { nome: "diaSemana", rotulo: "Dia da semana", tipo: "select", opcoes: DIAS_SEMANA, padrao: "5", largura: "metade", mostrarSe: (v) => v.frequencia !== "mensal" },
    { nome: "diaMes", rotulo: "Dia do mês", tipo: "number", padrao: 1, largura: "metade", mostrarSe: (v) => v.frequencia === "mensal" },
    { nome: "checklist", rotulo: "Checklist padrão", tipo: "checklist" },
    { nome: "ativo", rotulo: "Ativa", tipo: "checkbox", padrao: true }
  ] : [
    ...(modelo === "producao" ? [{ nome: "diaSemana", rotulo: "Dia da semana para produzir", tipo: "select", opcoes: DIAS_SEMANA, largura: "metade" }] : []),
    ...(modelo === "planejamento" ? [{ nome: "diaMes", rotulo: "Dia do mês para planejar", tipo: "number", largura: "metade" }] : []),
    ...(modelo === "cobranca" ? [{ nome: "antecedencia", rotulo: "Quando cobrar", tipo: "select", opcoes: [["0", "No dia do vencimento"], ["1", "1 dia antes"], ["3", "3 dias antes"], ["5", "5 dias antes"]], largura: "metade" }] : []),
    { nome: "ativo", rotulo: "Ativa", tipo: "checkbox", padrao: true }
  ];
  const valores = { ...r, antecedencia: String(r.antecedencia ?? 0), diaSemana: String(r.diaSemana ?? "1") };
  const novo = !r.id;
  return formulario(novo ? "Nova rotina" : `${MODELOS[modelo].titulo}${r.clienteId ? ` · ${nomeCliente(r.clienteId)}` : ""}`, campos, valores, {
    largo: modelo === "livre",
    extras: novo ? [] : [el("button", { type: "button", class: "perigo-texto", onClick: async () => {
      if (await confirmar("Excluir esta rotina? As tarefas já criadas continuam.")) { await excluir("recorrencias", r.id); document.querySelector(".modal-fundo")?.remove(); }
    } }, "Excluir")],
    aoSalvar: async (v) => {
      if (v.diaSemana !== undefined) v.diaSemana = String(v.diaSemana);
      if (v.antecedencia !== undefined) v.antecedencia = Number(v.antecedencia);
      // Mudou o dia: libera a geração a partir de hoje (sem duplicar, os ids são fixos por data)
      if (novo) await criar("recorrencias", { ...v, modelo: "livre", inicio: hojeISO(), geradasAte: null });
      else await atualizar("recorrencias", r.id, { ...v, geradasAte: null });
      regerar();
      avisar("Rotina salva.");
    }
  });
}

export function render() {
  const grupos = Object.keys(MODELOS).map((m) => [m, dados.recorrencias.filter((r) => (r.modelo || "livre") === m)
    .sort((a, b) => nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId), "pt-BR"))]);

  const linha = (r) => {
    const prox = r.ativo === false ? null : proximaData(r);
    return el("div", { class: `linha-tabela ${r.ativo === false ? "feita" : ""}`, onClick: () => editarRotina(r) },
      el("strong", {}, r.modelo && r.modelo !== "livre" ? nomeCliente(r.clienteId) : r.titulo),
      r.modelo === "livre" || !r.modelo ? el("span", {}, r.clienteId ? nomeCliente(r.clienteId) : "Hyper / geral") : null,
      el("span", { class: "etiqueta" }, descreverRotina(r)),
      prox ? el("span", { class: "etiqueta formato" }, `próxima: ${fmtDiaSemana(prox)} ${fmtData(prox, true)}`) : el("span", { class: "etiqueta" }, "pausada"),
      el("button", { class: "link", onClick: async (e) => { e.stopPropagation(); await atualizar("recorrencias", r.id, { ativo: r.ativo === false, geradasAte: null }); regerar(); } },
        r.ativo === false ? "Retomar" : "Pausar"));
  };

  return el("div", { class: "tela" },
    cabecalho("Rotinas", "Tarefas que entram sozinhas na sua agenda (até 7 dias antes)",
      el("button", { class: "secundario", onClick: () => editarRotina({}) }, "+ Rotina livre")),
    el("div", { class: "explica-rotinas" },
      el("strong", {}, "Seu ritmo: "), `esta semana (${fmtData(hojeISO(), true)}) você produz os posts da semana seguinte e, no fim do mês, planeja o mês seguinte. As rotinas abaixo lembram você disso para cada cliente.`),
    grupos.map(([m, lista]) => el("section", { class: "bloco" },
      el("div", { class: "com-acao" },
        el("h2", {}, el("span", { class: "menu-icone", "aria-hidden": "true" }, MODELOS[m].icone), " ", MODELOS[m].titulo, el("span", { class: "contador" }, lista.length)),
        m === "livre" ? el("button", { class: "secundario mini", onClick: criarSugestoes }, "Sugestões: Manutenção TP e Organizar Semana") : el("button", { class: "mini", onClick: () => novaRotinaModelo(m) }, "+ Adicionar clientes")),
      el("p", { class: "subtitulo" }, MODELOS[m].texto),
      lista.length ? el("div", { class: "lista" }, lista.map(linha)) : vazio(m === "livre" ? "Nenhuma rotina livre." : "Nenhum cliente com esta rotina ainda.",
        m === "livre" ? el("button", { class: "link", onClick: () => editarRotina({}) }, "+ Criar rotina livre") : el("button", { class: "link", onClick: () => novaRotinaModelo(m) }, "+ Escolher clientes")))));
}
