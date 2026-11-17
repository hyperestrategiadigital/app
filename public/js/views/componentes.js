// Peças reutilizadas entre telas: cartão e formulário de tarefa, selo de cliente.
import { el, formulario, confirmar, avisar, fmtPrazoRelativo, fmtData, diasAte, hojeISO, linkExterno } from "../ui.js";
import { criar, atualizar, excluir, nomeCliente, opcoesClientes, porId } from "../db.js";
import { STATUS_TAREFA, TIPOS_TAREFA, TIPO_CONTEUDO, ehConteudo, FORMATOS, REDES, STATUS_CONTEUDO, rotuloStatusConteudo } from "../constantes.js";
import { promptCopy } from "../prompts.js";

export const atrasada = (t) => t.status !== "concluido" && t.prazo && t.prazo < hojeISO();

/** Cor que identifica o cliente: 1ª cor da paleta da marca ou a cor escolhida no cadastro. */
export const corCliente = (c) => c?.paleta?.[0] || c?.cor || "#606060";

export function seloCliente(clienteId) {
  if (!clienteId) return null;
  const c = porId("clientes", clienteId);
  return el("a", { class: "selo-cliente", href: `#/clientes/${clienteId}`, onClick: (e) => e.stopPropagation(), style: c ? { "--selo": corCliente(c) } : undefined },
    nomeCliente(clienteId));
}

export function abrirTarefa(tarefa = {}) {
  const editando = !!tarefa.id;
  const conteudo = (v) => v.tipo === TIPO_CONTEUDO;
  const valores = { ...tarefa };
  if (!editando && tarefa.tipo === undefined) valores.tipo = TIPO_CONTEUDO;
  const campos = [
    { nome: "titulo", rotulo: "Tarefa / tema do post", obrigatorio: true, dica: "Ex.: Black Week — plano anual" },
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientes(), largura: "metade" },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS_TAREFA, largura: "metade" },

    { tipo: "secao", rotulo: "Post (aparece no calendário de conteúdo)", mostrarSe: conteudo },
    { nome: "formato", rotulo: "Formato", tipo: "select", opcoes: FORMATOS, padrao: "Feed estático", largura: "metade", mostrarSe: conteudo },
    { nome: "rede", rotulo: "Rede", tipo: "select", opcoes: REDES, padrao: "Instagram", largura: "metade", mostrarSe: conteudo },
    { nome: "dataPublicacao", rotulo: "Data de publicação", tipo: "date", padrao: tarefa.prazo || hojeISO(), obrigatorio: true, largura: "metade", mostrarSe: conteudo },
    { nome: "hora", rotulo: "Horário", tipo: "time", largura: "metade", mostrarSe: conteudo },
    { nome: "statusConteudo", rotulo: "Etapa do post", tipo: "select", opcoes: STATUS_CONTEUDO, padrao: "ideia", largura: "metade", mostrarSe: conteudo },
    { nome: "objetivo", rotulo: "Objetivo", dica: "Ex.: vender plano anual, gerar leads", largura: "metade", mostrarSe: conteudo },
    { nome: "roteiro", rotulo: "Briefing / roteiro", tipo: "textarea", linhas: 3, mostrarSe: conteudo },
    { nome: "copy", rotulo: "Copy / legenda final", tipo: "textarea", linhas: 4, dica: "Cole aqui a copy aprovada", mostrarSe: conteudo },

    { tipo: "secao", rotulo: "Tarefa" },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: STATUS_TAREFA, padrao: "a_fazer", largura: "metade" },
    { nome: "prazo", rotulo: "Prazo de entrega", tipo: "date", padrao: hojeISO(), largura: "metade" },
    { nome: "checklist", rotulo: "Checklist", tipo: "checklist" },
    { nome: "linkCanva", rotulo: "Link do Canva", dica: "https://www.canva.com/design/...", largura: "metade" },
    { nome: "linkDrive", rotulo: "Link do Drive", dica: "https://drive.google.com/...", largura: "metade" },
    { nome: "notas", rotulo: "Observações", tipo: "textarea", linhas: 2 }
  ];
  const ultimoForm = () => [...document.querySelectorAll(".modal form")].pop();
  const lerForm = () => ultimoForm()?.lerValores?.() || {};
  const extras = [
    el("button", {
      type: "button", class: "secundario mini so-conteudo",
      onClick: async () => {
        try { await navigator.clipboard.writeText(promptCopy(lerForm())); avisar("Prompt copiado! Cole no Claude para gerar a copy."); }
        catch { avisar("Não consegui copiar o prompt.", "erro"); }
        window.open("https://claude.ai/new", "_blank", "noopener");
      }
    }, "✨ Copy com o Claude"),
    editando ? el("a", { class: "botao-link mini so-conteudo", href: `#/criar/${tarefa.id}`, onClick: () => document.querySelector(".modal-fundo")?.remove() }, "🎨 Criar arte") : null,
    editando ? el("button", {
      type: "button", class: "perigo-texto",
      onClick: async () => {
        if (await confirmar(`Excluir "${tarefa.titulo}"?`)) {
          await excluir("tarefas", tarefa.id);
          document.querySelector(".modal-fundo")?.remove();
          avisar("Tarefa excluída.");
        }
      }
    }, "Excluir") : null
  ];
  const promessa = formulario(editando ? (ehConteudo(tarefa) ? "Editar post" : "Editar tarefa") : "Nova tarefa", campos, valores, {
    extras, largo: true,
    aoSalvar: async (v) => salvarTarefa(tarefa, v)
  });
  // Botões de conteúdo só aparecem quando o tipo é Conteúdo
  const form = ultimoForm();
  const alternar = () => form?.querySelectorAll(".so-conteudo").forEach((b) => (b.hidden = !conteudo(form.lerValores())));
  form?.addEventListener("change", alternar);
  alternar();
  return promessa;
}

/** Grava uma tarefa (ou post) mantendo status de tarefa e etapa do post coerentes. */
export async function salvarTarefa(original, v) {
  if (v.tipo !== TIPO_CONTEUDO) {
    for (const k of ["formato", "rede", "dataPublicacao", "hora", "statusConteudo", "objetivo", "roteiro", "copy"]) delete v[k];
  } else {
    if (!v.prazo) v.prazo = v.dataPublicacao;
    if (v.statusConteudo === "publicado" && v.status !== "concluido") v.status = "concluido";
  }
  if (v.status === "concluido" && original.status !== "concluido") v.concluidoEm = hojeISO();
  if (v.status !== "concluido") v.concluidoEm = null;
  if (original.id) await atualizar("tarefas", original.id, v);
  else await criar("tarefas", v);
  avisar(original.id ? "Salvo." : v.tipo === TIPO_CONTEUDO ? "Post criado e adicionado ao calendário." : "Tarefa criada.");
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
        ehConteudo(t) ? el("span", { class: "etiqueta formato" }, `${t.formato || "Post"}${t.dataPublicacao ? " · " + fmtData(t.dataPublicacao, true) : ""}`) : t.tipo ? el("span", { class: "etiqueta" }, t.tipo) : null,
        ehConteudo(t) && t.statusConteudo ? el("span", { class: `etiqueta st-${t.statusConteudo}` }, rotuloStatusConteudo(t.statusConteudo)) : null,
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
