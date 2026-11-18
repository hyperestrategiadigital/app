// Rotinas: tarefas criadas sozinhas na agenda.
// - livre:        título fixo, semanal / quinzenal / mensal
// - producao:     toda semana, produzir os posts da SEMANA SEGUINTE do cliente
// - planejamento: todo mês, planejar o MÊS SEGUINTE do cliente
// - cobranca:     todo mês, cobrar a mensalidade no vencimento do cliente (ou X dias antes)
import { dados, gravarEmLote, atualizar, porId, contrato, salvarComId, existeNoBanco, clientesAtivos } from "./db.js";
import { pode } from "./permissoes.js";
import { responsavelPadrao } from "./agenda.js";
import { diaUtil, despesasFixas } from "./comercial.js";
import { hojeISO, addDias, dataDe, normalizar, fmtData } from "./ui.js";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesSeguinte = (iso) => { const d = dataDe(iso); return hojeISO(new Date(d.getFullYear(), d.getMonth() + 1, 1)).slice(0, 7); };
/** Segunda-feira da semana seguinte à data. */
export const segundaSeguinte = (iso) => addDias(iso, 7 - ((dataDe(iso).getDay() + 6) % 7));

/** Dia do mês em que a rotina cai (para cobrança vem do vencimento do cliente). */
function diaDoMes(r, iso) {
  const d = dataDe(iso);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (r.modelo === "cobranca") {
    const venc = Number(contrato(r.clienteId).diaVencimento) || 10;
    return Math.max(1, Math.min(venc, ultimo) - (Number(r.antecedencia) || 0));
  }
  return Math.min(Number(r.diaMes) || 1, ultimo);
}

function cai(r, iso) {
  const data = dataDe(iso);
  if (r.frequencia === "mensal") return data.getDate() === diaDoMes(r, iso);
  if (r.frequencia === "quinzenal")
    return data.getDay() === Number(r.diaSemana) && Math.floor((data - dataDe(r.inicio || hojeISO())) / 86400000 / 7) % 2 === 0;
  return data.getDay() === Number(r.diaSemana);
}

/** Monta a tarefa de uma ocorrência conforme o modelo da rotina. */
export function ocorrencia(r, d) {
  const cliente = porId("clientes", r.clienteId);
  const nome = cliente?.nome || "";
  const base = {
    id: `rec-${r.id}-${d}`, clienteId: r.clienteId || "", status: "a_fazer", prazo: d,
    responsavel: r.responsavel || responsavelPadrao(), notas: r.notas || "", recorrenciaId: r.id, rotina: r.modelo || "livre", criadoEm: Date.now(),
    checklist: (r.checklist || []).map((i) => ({ texto: i.texto, feito: false }))
  };
  if (r.modelo === "producao") {
    const semana = segundaSeguinte(d);
    return { ...base, tipo: "Produção", titulo: `Produzir semana ${fmtData(semana, true)}${nome ? ` — ${nome}` : ""}`,
      semanaInicio: semana, atalho: `#/calendario/${r.clienteId || ""}/${semana.slice(0, 7)}` };
  }
  if (r.modelo === "planejamento") {
    const mes = mesSeguinte(d);
    return { ...base, tipo: "Planejamento", titulo: `Planejar ${MESES[Number(mes.slice(5)) - 1]}${nome ? ` — ${nome}` : ""}`,
      mesAlvo: mes, atalho: `#/calendario/${r.clienteId}/${mes}/planejar`,
      checklist: base.checklist.length ? base.checklist : [
        { texto: "Planejar os posts no calendário", feito: false },
        { texto: "Enviar o PDF para o cliente aprovar", feito: false },
        { texto: "Ajustar com o retorno do cliente", feito: false }] };
  }
  if (r.modelo === "cobranca") {
    const mes = d.slice(0, 7);
    // Sem valor no título: tarefas são vistas pela equipe; o valor fica no Financeiro
    return { ...base, tipo: "Financeiro / Comercial", titulo: `Cobrar mensalidade ${MESES[Number(mes.slice(5)) - 1]}${nome ? ` — ${nome}` : ""}`,
      atalho: "#/financeiro", lancamentoId: `mens-${r.clienteId}-${mes}` };
  }
  return { ...base, tipo: r.tipo || "Outro", titulo: r.titulo };
}

// Cria as tarefas das rotinas para os próximos 7 dias. Cada ocorrência tem id fixo (rec-<id>-<data>),
// então rodar de novo nunca duplica. `geradasAte` evita recriar ocorrências que você apagou.
export async function gerarRecorrencias() {
  const limite = addDias(hojeISO(), 7);
  for (const r of dados.recorrencias) {
    if (r.ativo === false) continue;
    if (r.clienteId && porId("clientes", r.clienteId)?.ativo === false) continue;
    let d = r.geradasAte ? addDias(r.geradasAte, 1) : hojeISO();
    if (d < hojeISO()) d = hojeISO();
    const novas = [];
    for (; d <= limite; d = addDias(d, 1)) {
      if (!cai(r, d)) continue;
      const t = ocorrencia(r, d);
      // Não cria se já existe uma tarefa igual (mesmo título, cliente e data), ex.: vinda da planilha
      const jaExiste = dados.tarefas.some((x) => x.id === t.id ||
        (x.prazo === d && (x.clienteId || "") === (r.clienteId || "") && normalizar(x.titulo) === normalizar(t.titulo)));
      if (!jaExiste) novas.push(t);
    }
    if (novas.length) await gravarEmLote("tarefas", novas);
    // Cobrança cria (se ainda não existe) a receita pendente do mês no Financeiro
    for (const t of novas) if (t.lancamentoId) await garantirMensalidade(r.clienteId, t.prazo.slice(0, 7)).catch((e) => console.warn("Mensalidade:", e.message));
    await atualizar("recorrencias", r.id, { geradasAte: limite });
  }
}

/** Cria a receita "Mensalidade <mês>" do cliente (id mens-<cliente>-<mês>), se houver mensalidade no contrato. */
export async function garantirMensalidade(clienteId, mes) {
  const id = `mens-${clienteId}-${mes}`;
  const c = contrato(clienteId);
  if (!pode("financeiro") || !(Number(c.mensalidade) > 0) || dados.financeiro.some((f) => f.id === id)) return false;
  if (await existeNoBanco("financeiro", id)) return false; // nunca sobrescreve uma mensalidade já paga
  const [a, m] = mes.split("-").map(Number);
  const vencimento = c.vencimentoUtil ? diaUtil(mes, Number(c.diaVencimento) || 5)
    : `${mes}-${String(Math.min(Number(c.diaVencimento) || 10, new Date(a, m, 0).getDate())).padStart(2, "0")}`;
  await salvarComId("financeiro", id, {
    descricao: `Mensalidade ${MESES[m - 1]}`, tipo: "receita", categoria: "Mensalidade", clienteId,
    valor: Number(c.mensalidade), vencimento, status: "pendente", pagoEm: null, criadoEm: Date.now()
  });
  return true;
}

/** Despesa fixa da Hyper (Financeiro → Configurar) no mês: id fixa-<id>-<mês>, nunca duplica nem sobrescreve. */
export async function garantirFixa(f, mes) {
  const id = `fixa-${f.id}-${mes}`;
  if (!pode("financeiro") || !(Number(f.valor) > 0) || dados.financeiro.some((x) => x.id === id) || await existeNoBanco("financeiro", id)) return false;
  const [a, m] = mes.split("-").map(Number);
  await salvarComId("financeiro", id, {
    descricao: f.descricao, tipo: "despesa", categoria: f.categoria || "Ferramentas", clienteId: "", fixaId: f.id,
    valor: Number(f.valor), vencimento: `${mes}-${String(Math.min(Number(f.dia) || 10, new Date(a, m, 0).getDate())).padStart(2, "0")}`,
    status: "pendente", pagoEm: null, criadoEm: Date.now()
  });
  return true;
}

/** Mensalidades dos contratos e despesas fixas do mês. Devolve quantos lançamentos criou. */
export async function garantirMes(mes) {
  const r = await Promise.all([
    ...clientesAtivos().filter((c) => Number(contrato(c.id).mensalidade) > 0).map((c) => garantirMensalidade(c.id, mes)),
    ...despesasFixas().map((f) => garantirFixa(f, mes))
  ]);
  return r.filter(Boolean).length;
}

/** Concluir a tarefa de cobrança marca a mensalidade como paga (e reabrir volta para pendente). */
export const lancamentoDe = (t) => t?.lancamentoId || (t?.rotina === "cobranca" && t.clienteId && t.prazo ? `mens-${t.clienteId}-${t.prazo.slice(0, 7)}` : "");
export async function quitarCobranca(t, pago) {
  if (!lancamentoDe(t) || !pode("financeiro")) return;
  const f = porId("financeiro", lancamentoDe(t));
  if (!f || (f.status === "pago") === pago) return;
  try {
    await atualizar("financeiro", f.id, { status: pago ? "pago" : "pendente", pagoEm: pago ? hojeISO() : null });
  } catch (e) { console.warn("Cobrança:", e.message); }
}

export function proximaData(r) {
  for (let i = 0, d = hojeISO(); i < 70; i++, d = addDias(d, 1)) if (cai(r, d)) return d;
  return null;
}

/** Descrição curta para listas: "toda segunda", "todo dia 20", "no vencimento (dia 10)". */
export function descreverRotina(r) {
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const dia = dias[Number(r.diaSemana)] || "";
  if (r.modelo === "cobranca") {
    const venc = contrato(r.clienteId).diaVencimento;
    const ant = Number(r.antecedencia) || 0;
    return `todo mês, ${ant ? `${ant} dia(s) antes do vencimento` : "no vencimento"}${venc ? ` (dia ${venc})` : " (sem dia de vencimento na ficha)"}`;
  }
  if (r.frequencia === "mensal") return `todo dia ${r.diaMes || 1}`;
  if (r.frequencia === "quinzenal") return `a cada 2 semanas, ${dia}`;
  return `toda ${dia}`;
}
