// Peças reutilizadas entre telas: cartão e formulário de tarefa, selo de cliente.
import { el, formulario, confirmar, avisar, fmtPrazoRelativo, diasAte, hojeISO, linkExterno } from "../ui.js";
import { criar, atualizar, excluir, nomeCliente, opcoesClientes, porId } from "../db.js";
import { STATUS_TAREFA, TIPOS_TAREFA } from "../constantes.js";

export const atrasada = (t) => t.status !== "concluido" && t.prazo && t.prazo < hojeISO();

export function seloCliente(clienteId) {
  if (!clienteId) return null;
  const c = porId("clientes", clienteId);
  return el("a", { class: "selo-cliente", href: `#/clientes/${clienteId}`, onClick: (e) => e.stopPropagation(), style: c?.cor ? { "--selo": c.cor } : undefined },
    nomeCliente(clienteId));
}

export function abrirTarefa(tarefa = {}) {
  const editando = !!tarefa.id;
  const campos = [
    { nome: "titulo", rotulo: "Tarefa", obrigatorio: true, dica: "Ex.: Manutenção TP, Roteiro Grazi..." },
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientes(), largura: "metade" },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS_TAREFA, padrao: "Conteúdo", largura: "metade" },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: STATUS_TAREFA, padrao: "a_fazer", largura: "metade" },
    { nome: "prazo", rotulo: "Prazo final", tipo: "date", padrao: hojeISO(), largura: "metade" },
    { nome: "checklist", rotulo: "Entregas (checklist)", tipo: "checklist" },
    { nome: "linkCanva", rotulo: "Link do Canva", dica: "https://www.canva.com/design/...", largura: "metade" },
    { nome: "linkDrive", rotulo: "Link do Drive", dica: "https://drive.google.com/...", largura: "metade" },
    { nome: "notas", rotulo: "Observações", tipo: "textarea", linhas: 3 }
  ];
  const extras = editando ? [el("button", {
    type: "button", class: "perigo-texto",
    onClick: async () => {
      if (await confirmar(`Excluir a tarefa "${tarefa.titulo}"?`)) {
        await excluir("tarefas", tarefa.id);
        document.querySelector(".modal-fundo")?.remove();
        avisar("Tarefa excluída.");
      }
    }
  }, "Excluir")] : [];
  return formulario(editando ? "Editar tarefa" : "Nova tarefa", campos, tarefa, {
    extras, largo: true,
    aoSalvar: async (v) => {
      if (v.status === "concluido" && tarefa.status !== "concluido") v.concluidoEm = hojeISO();
      if (v.status !== "concluido") v.concluidoEm = null;
      if (editando) await atualizar("tarefas", tarefa.id, v);
      else await criar("tarefas", v);
      avisar(editando ? "Tarefa atualizada." : "Tarefa criada.");
    }
  });
}

export async function alternarConcluida(t) {
  const concluir = t.status !== "concluido";
  await atualizar("tarefas", t.id, {
    status: concluir ? "concluido" : "a_fazer",
    concluidoEm: concluir ? hojeISO() : null,
    checklist: concluir && t.checklist?.length ? t.checklist.map((i) => ({ ...i, feito: true })) : (t.checklist || [])
  });
  if (concluir) avisar("Concluída! ✓");
}

export function cartaoTarefa(t, { mostrarCliente = true } = {}) {
  const feitos = (t.checklist || []).filter((i) => i.feito).length;
  const total = (t.checklist || []).length;
  const n = t.prazo ? diasAte(t.prazo) : null;
  const classePrazo = t.status === "concluido" ? "" : atrasada(t) ? "atrasado" : n === 0 ? "hoje" : "";
  return el("article", { class: `cartao-tarefa ${t.status === "concluido" ? "feita" : ""}`, tabindex: "0",
    onClick: () => abrirTarefa(t), onKeydown: (e) => { if (e.key === "Enter") abrirTarefa(t); } },
    el("button", {
      class: `check ${t.status === "concluido" ? "marcado" : ""}`, "aria-label": t.status === "concluido" ? "Reabrir tarefa" : "Concluir tarefa",
      onClick: (e) => { e.stopPropagation(); alternarConcluida(t); }
    }, t.status === "concluido" ? "✓" : ""),
    el("div", { class: "cartao-corpo" },
      el("div", { class: "cartao-titulo" }, t.titulo),
      el("div", { class: "cartao-meta" },
        mostrarCliente ? seloCliente(t.clienteId) : null,
        t.tipo ? el("span", { class: "etiqueta" }, t.tipo) : null,
        t.status === "andamento" ? el("span", { class: "etiqueta andamento" }, "Em andamento") : null,
        total ? el("span", { class: "progresso-mini" }, `☑ ${feitos}/${total}`) : null,
        linkExterno(t.linkCanva, "Canva"), linkExterno(t.linkDrive, "Drive"),
        el("span", { class: `prazo ${classePrazo}` }, t.status === "concluido" && t.concluidoEm ? `feita ${fmtPrazoRelativo(t.concluidoEm)}` : fmtPrazoRelativo(t.prazo)))));
}

/** Cabeçalho padrão de tela com título, subtítulo e ações. */
export function cabecalho(titulo, subtitulo, ...acoes) {
  return el("header", { class: "tela-topo" },
    el("div", {}, el("h1", {}, titulo), subtitulo ? el("p", { class: "subtitulo" }, subtitulo) : null),
    el("div", { class: "tela-acoes" }, acoes));
}

export function abas(itens, ativo, aoTrocar) {
  return el("div", { class: "abas", role: "tablist" }, itens.map(([v, r]) =>
    el("button", { role: "tab", "aria-selected": String(v === ativo), class: v === ativo ? "ativa" : "", onClick: () => aoTrocar(v) }, r)));
}
