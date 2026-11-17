// Geração automática de tarefas recorrentes.
import { dados, gravarEmLote, atualizar } from "./db.js";
import { hojeISO, addDias, dataDe, normalizar } from "./ui.js";

// Cria as tarefas recorrentes dos próximos 7 dias. Cada ocorrência tem id fixo (rec-<id>-<data>),
// então rodar de novo nunca duplica. `geradasAte` evita recriar ocorrências que você apagou.
export async function gerarRecorrencias() {
  const limite = addDias(hojeISO(), 7);
  for (const r of dados.recorrencias) {
    if (r.ativo === false) continue;
    let d = r.geradasAte ? addDias(r.geradasAte, 1) : hojeISO();
    if (d < hojeISO()) d = hojeISO();
    const novas = [];
    for (; d <= limite; d = addDias(d, 1)) {
      const data = dataDe(d);
      const bate = r.frequencia === "mensal"
        ? data.getDate() === Number(r.diaMes || 1)
        : r.frequencia === "quinzenal"
          ? data.getDay() === Number(r.diaSemana) && Math.floor((data - dataDe(r.inicio || hojeISO())) / 86400000 / 7) % 2 === 0
          : data.getDay() === Number(r.diaSemana);
      // Não cria se já existe uma tarefa igual (mesmo título, cliente e data), ex.: vinda da planilha
      const jaExiste = dados.tarefas.some((t) => t.prazo === d && (t.clienteId || "") === (r.clienteId || "") && normalizar(t.titulo) === normalizar(r.titulo));
      if (bate && !jaExiste) novas.push({
        id: `rec-${r.id}-${d}`, titulo: r.titulo, clienteId: r.clienteId || "", tipo: r.tipo || "Outro",
        status: "a_fazer", prazo: d, checklist: (r.checklist || []).map((i) => ({ texto: i.texto, feito: false })),
        notas: r.notas || "", recorrenciaId: r.id, criadoEm: Date.now()
      });
    }
    if (novas.length) await gravarEmLote("tarefas", novas);
    await atualizar("recorrencias", r.id, { geradasAte: limite });
  }
}
