// Tarefas: quadro por status (A fazer / Em andamento / Concluído) ou lista, com filtros.
import { quitarCobranca } from "../recorrencias.js";
import { el, hojeISO, addDias, normalizar, vazio } from "../ui.js";
import { dados, atualizar, opcoesClientes, registrarAtividade } from "../db.js";
import { cartaoTarefa, atrasada, abrirTarefa, cabecalho, visoesTarefas, seletorResponsavel, opcoesResponsaveis } from "./componentes.js";
import { novoPost } from "./calendario.js";
import { eu, ehAdmin, tarefaVisivel, pode } from "../permissoes.js";
import { STATUS_TAREFA, TIPOS_TAREFA, TIPO_CONTEUDO, etapaDoStatus } from "../constantes.js";

export function render({ estado, renderizar }) {
  // Tarefas e Calendário compartilham o estado (filtros); aqui ficam as visões Quadro, Lista e Carga da equipe
  if (!estado.visao || estado.visao === "calendario") estado.visao = "quadro";
  estado.periodoConcluidas ??= "30";
  const f = estado;

  if (f.responsavel === undefined) f.responsavel = ehAdmin() ? "" : eu.nome; // quem não é admin começa vendo as próprias
  const busca = normalizar(f.busca);
  const filtradas = dados.tarefas.filter((t) => tarefaVisivel(t) &&
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
    seletorResponsavel(f, renderizar));

  const seletorPeriodo = el("select", { class: "mini", onChange: set("periodoConcluidas"), "aria-label": "Período das concluídas" },
    [["7", "últimos 7 dias"], ["30", "últimos 30 dias"], ["90", "últimos 90 dias"], ["tudo", "todas"]]
      .map(([v, r]) => el("option", { value: v, selected: v === f.periodoConcluidas }, r)));

  let corpo;
  if (f.visao === "quadro") {
    corpo = el("div", { class: "quadro" }, STATUS_TAREFA.map(([st, rotulo]) =>
      el("section", {
        class: "coluna", dataset: { status: st },
        onDragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("alvo"); },
        onDragleave: (e) => e.currentTarget.classList.remove("alvo"),
        onDrop: async (e) => {
          e.currentTarget.classList.remove("alvo");
          const id = e.dataTransfer.getData("text/plain");
          const t = dados.tarefas.find((x) => x.id === id);
          if (t && t.status !== st) await atualizar("tarefas", id, {
            status: st, concluidoEm: st === "concluido" ? hojeISO() : null,
            ...(t.tipo === TIPO_CONTEUDO ? { statusConteudo: etapaDoStatus(st, t.statusConteudo) } : {})
          });
          if (t && (st === "concluido") !== (t.status === "concluido")) quitarCobranca(t, st === "concluido");
          if (t && t.status !== st) registrarAtividade(id, { texto: `mudou o status para ${STATUS_TAREFA.find(([v]) => v === st)?.[1]}` });
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
  } else if (f.visao === "equipe") {
    corpo = cargaDaEquipe(filtradas, (pessoa) => { f.responsavel = pessoa; f.visao = "lista"; renderizar(); });
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
      pode("conteudo") ? el("button", { class: "secundario", onClick: () => novoPost({ clienteId: f.cliente || "" }) }, "+ Novo post") : null,
      el("button", { class: "destaque", onClick: () => abrirTarefa({ clienteId: f.cliente || "", prazo: hojeISO() }) }, "+ Nova tarefa")),
    visoesTarefas(f, renderizar), filtros, corpo);
}

/** Quantas tarefas e posts abertos cada pessoa tem: atrasadas e por dia nos próximos 7 dias. */
function cargaDaEquipe(tarefas, verPessoa) {
  const hoje = hojeISO();
  const dias = Array.from({ length: 7 }, (_, i) => addDias(hoje, i));
  const abertas = tarefas.filter((t) => t.status !== "concluido");
  const pessoas = [...new Set([...opcoesResponsaveis(), ...abertas.map((t) => t.responsavel || "")])];
  const linhas = pessoas.map((p) => {
    const dela = abertas.filter((t) => (t.responsavel || "") === p);
    const porDia = dias.map((d) => dela.filter((t) => t.prazo === d).length);
    const semana = porDia.reduce((a, b) => a + b, 0);
    return { p, atrasadas: dela.filter(atrasada).length, porDia, semana, posts: dela.filter((t) => t.tipo === TIPO_CONTEUDO && t.prazo >= hoje && t.prazo <= dias[6]).length, total: dela.length };
  }).filter((l) => l.total || l.p).sort((a, b) => b.semana + b.atrasadas - (a.semana + a.atrasadas));
  const maximo = Math.max(1, ...linhas.flatMap((l) => l.porDia));
  const nomeDia = (d) => new Date(d + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }).replace(".", "");
  return el("div", { class: "bloco carga-equipe" },
    el("p", { class: "subtitulo" }, "Tarefas e posts em aberto por prazo. Clique numa pessoa para ver a lista dela."),
    el("table", { class: "tabela-carga" },
      el("thead", {}, el("tr", {}, el("th", {}, "Pessoa"), el("th", {}, "Atrasadas"), dias.map((d) => el("th", {}, nomeDia(d))), el("th", {}, "Semana"), el("th", {}, "Posts"))),
      el("tbody", {}, linhas.map((l) => el("tr", {},
        el("td", {}, el("button", { class: "link", onClick: () => verPessoa(l.p) }, l.p || "Sem responsável")),
        el("td", { class: l.atrasadas ? "alerta" : "" }, l.atrasadas || "–"),
        l.porDia.map((n) => el("td", {}, n ? el("span", { class: `carga ${n / maximo > 0.5 ? "forte" : ""}`, style: { "--carga": String(n / maximo) } }, n) : "–")),
        el("td", {}, el("strong", {}, l.semana)),
        el("td", {}, l.posts || "–"))))));
}
