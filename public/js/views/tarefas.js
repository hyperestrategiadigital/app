// Tarefas: quadro por status (A fazer / Em andamento / Concluído) ou lista, com filtros.
import { el, hojeISO, addDias, normalizar, vazio } from "../ui.js";
import { dados, atualizar, opcoesClientes } from "../db.js";
import { cartaoTarefa, atrasada, abrirTarefa, cabecalho, abas, opcoesResponsaveis } from "./componentes.js";
import { STATUS_TAREFA, TIPOS_TAREFA } from "../constantes.js";

export function render({ estado, renderizar }) {
  estado.modo ??= "quadro";
  estado.periodoConcluidas ??= "30";
  const f = estado;

  const busca = normalizar(f.busca);
  const filtradas = dados.tarefas.filter((t) =>
    (!f.cliente || t.clienteId === f.cliente) &&
    (!f.tipo || t.tipo === f.tipo) &&
    (!f.responsavel || (t.responsavel || "") === f.responsavel) &&
    (!busca || normalizar(t.titulo + " " + (t.checklist || []).map((i) => i.texto).join(" ") + " " + (t.notas || "")).includes(busca)));

  const limiteConcluidas = f.periodoConcluidas === "tudo" ? "" : addDias(hojeISO(), -Number(f.periodoConcluidas));
  const ordenarPrazo = (a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999");
  const colunas = {
    a_fazer: filtradas.filter((t) => t.status === "a_fazer" || !t.status).sort(ordenarPrazo),
    andamento: filtradas.filter((t) => t.status === "andamento").sort(ordenarPrazo),
    concluido: filtradas.filter((t) => t.status === "concluido" && (!limiteConcluidas || (t.concluidoEm || t.prazo || "") >= limiteConcluidas))
      .sort((a, b) => (b.concluidoEm || b.prazo || "").localeCompare(a.concluidoEm || a.prazo || ""))
  };
  const nAtrasadas = filtradas.filter(atrasada).length;
  const set = (k) => (e) => { f[k] = e.target.value; renderizar(); };

  const filtros = el("div", { class: "filtros" },
    el("input", { id: "busca-tarefas", type: "search", placeholder: "Buscar tarefa ou entrega...", value: f.busca || "", onInput: set("busca") }),
    el("select", { onChange: set("cliente"), "aria-label": "Cliente" },
      opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === (f.cliente || "") }, v ? r : "Todos os clientes"))),
    el("select", { onChange: set("tipo"), "aria-label": "Tipo" },
      el("option", { value: "" }, "Todos os tipos"), TIPOS_TAREFA.map((t) => el("option", { value: t, selected: t === f.tipo }, t))),
    el("select", { onChange: set("responsavel"), "aria-label": "Responsável" },
      el("option", { value: "" }, "Todos os responsáveis"),
      [...new Set([...opcoesResponsaveis(), ...dados.tarefas.map((t) => t.responsavel).filter(Boolean)])].map((r) => el("option", { value: r, selected: r === f.responsavel }, r))),
    abas([["quadro", "Quadro"], ["lista", "Lista"]], f.modo, (m) => { f.modo = m; renderizar(); }));

  const seletorPeriodo = el("select", { class: "mini", onChange: set("periodoConcluidas"), "aria-label": "Período das concluídas" },
    [["7", "últimos 7 dias"], ["30", "últimos 30 dias"], ["90", "últimos 90 dias"], ["tudo", "todas"]]
      .map(([v, r]) => el("option", { value: v, selected: v === f.periodoConcluidas }, r)));

  let corpo;
  if (f.modo === "quadro") {
    corpo = el("div", { class: "quadro" }, STATUS_TAREFA.map(([st, rotulo]) =>
      el("section", {
        class: "coluna", dataset: { status: st },
        onDragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("alvo"); },
        onDragleave: (e) => e.currentTarget.classList.remove("alvo"),
        onDrop: async (e) => {
          e.currentTarget.classList.remove("alvo");
          const id = e.dataTransfer.getData("text/plain");
          const t = dados.tarefas.find((x) => x.id === id);
          if (t && t.status !== st) await atualizar("tarefas", id, { status: st, concluidoEm: st === "concluido" ? hojeISO() : null });
        }
      },
      el("header", {}, el("h2", {}, rotulo, el("span", { class: "contador" }, colunas[st].length)),
        st === "concluido" ? seletorPeriodo : el("button", { class: "icone", "aria-label": `Nova tarefa em ${rotulo}`, onClick: () => abrirTarefa({ status: st, prazo: hojeISO() }) }, "+")),
      colunas[st].length ? colunas[st].slice(0, 300).map((t) => {
        const c = cartaoTarefa(t);
        c.draggable = true;
        c.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", t.id));
        return c;
      }) : vazio("Nada aqui."))));
  } else {
    const abertas = [...colunas.a_fazer, ...colunas.andamento].sort(ordenarPrazo);
    corpo = el("div", { class: "lista" },
      el("h2", {}, `Abertas (${abertas.length})`),
      abertas.length ? abertas.map((t) => cartaoTarefa(t)) : vazio("Nenhuma tarefa aberta com esses filtros."),
      el("h2", { class: "com-acao" }, `Concluídas (${colunas.concluido.length})`, seletorPeriodo),
      colunas.concluido.slice(0, 300).map((t) => cartaoTarefa(t)));
  }

  return el("div", { class: "tela" },
    cabecalho("Tarefas", nAtrasadas ? `${nAtrasadas} atrasada(s)` : "Tudo em dia",
      el("button", { class: "destaque", onClick: () => abrirTarefa({ clienteId: f.cliente || "", prazo: hojeISO() }) }, "+ Nova tarefa")),
    filtros, corpo);
}
