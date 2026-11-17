// Rotinas: tarefas criadas sozinhas na agenda.
// - livre:        título fixo, semanal / quinzenal / mensal
// - producao:     toda semana, produzir os posts da SEMANA SEGUINTE do cliente
// - planejamento: todo mês, planejar o MÊS SEGUINTE do cliente
// - cobranca:     todo mês, cobrar a mensalidade no vencimento do cliente (ou X dias antes)
import { dados, gravarEmLote, atualizar, porId } from "./db.js";
import { hojeISO, addDias, dataDe, normalizar, fmtData, fmtMoeda } from "./ui.js";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesSeguinte = (iso) => { const d = dataDe(iso); return hojeISO(new Date(d.getFullYear(), d.getMonth() + 1, 1)).slice(0, 7); };
/** Segunda-feira da semana seguinte à data. */
export const segundaSeguinte = (iso) => addDias(iso, 7 - ((dataDe(iso).getDay() + 6) % 7));

/** Dia do mês em que a rotina cai (para cobrança vem do vencimento do cliente). */
function diaDoMes(r, iso) {
  const d = dataDe(iso);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (r.modelo === "cobranca") {
    const venc = Number(porId("clientes", r.clienteId)?.diaVencimento) || 10;
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
    notas: r.notas || "", recorrenciaId: r.id, rotina: r.modelo || "livre", criadoEm: Date.now(),
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
      mesAlvo: mes, atalho: `#/planejamento/${r.clienteId}/${mes}`,
      checklist: base.checklist.length ? base.checklist : [
        { texto: "Planejar os posts no calendário", feito: false },
        { texto: "Enviar o PDF para o cliente aprovar", feito: false },
        { texto: "Ajustar com o retorno do cliente", feito: false }] };
  }
  if (r.modelo === "cobranca") {
    const mes = d.slice(0, 7);
    return { ...base, tipo: "Financeiro", titulo: `Cobrar mensalidade ${MESES[Number(mes.slice(5)) - 1]}${nome ? ` — ${nome}` : ""}${cliente?.mensalidade ? ` (${fmtMoeda(cliente.mensalidade)})` : ""}`,
      atalho: "#/financeiro" };
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
    await atualizar("recorrencias", r.id, { geradasAte: limite });
  }
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
    const venc = porId("clientes", r.clienteId)?.diaVencimento;
    const ant = Number(r.antecedencia) || 0;
    return `todo mês, ${ant ? `${ant} dia(s) antes do vencimento` : "no vencimento"}${venc ? ` (dia ${venc})` : " (sem dia de vencimento na ficha)"}`;
  }
  if (r.frequencia === "mensal") return `todo dia ${r.diaMes || 1}`;
  if (r.frequencia === "quinzenal") return `a cada 2 semanas, ${dia}`;
  return `toda ${dia}`;
}
