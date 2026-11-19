// Busca rápida (Ctrl+K ou ⌘K): encontra telas, clientes, marcas, tarefas, posts e compromissos.
import { el, abrirModal, normalizar, fmtData } from "./ui.js";
import { dados, nomeCliente, porId } from "./db.js";
import { tarefaVisivel, ehCliente } from "./permissoes.js";
import { TIPO_CONTEUDO } from "./constantes.js";
import { abrirTarefa } from "./views/componentes.js";
import { abrirCompromisso } from "./compromissos.js";

let telas = () => [];
/** O app informa as telas que a pessoa pode abrir: [{ titulo, icone, href }]. */
export function definirTelas(fn) { telas = fn; }

const LIMITE = 30;

function candidatos() {
  const lista = [];
  for (const t of telas()) lista.push({ grupo: "Telas", titulo: t.titulo, icone: t.icone, texto: t.titulo, abrir: () => (location.hash = t.href) });
  for (const c of dados.clientes) lista.push({
    grupo: "Clientes", titulo: c.nome, detalhe: c.ativo === false ? "inativo" : c.segmento || "", icone: "◉",
    texto: [c.nome, c.segmento, c.responsavel].join(" "), abrir: () => (location.hash = `#/clientes/${c.id}`)
  });
  for (const m of dados.marcas || []) lista.push({
    grupo: "Marcas", titulo: m.nome, detalhe: nomeCliente(m.clienteId), icone: "◈",
    texto: [m.nome, nomeCliente(m.clienteId)].join(" "), abrir: () => (location.hash = `#/clientes/${m.clienteId}/marca/${m.id}`)
  });
  const tarefas = dados.tarefas.filter(tarefaVisivel)
    .sort((a, b) => (a.status === "concluido") - (b.status === "concluido") || (b.prazo || "").localeCompare(a.prazo || ""));
  for (const t of tarefas) {
    const post = t.tipo === TIPO_CONTEUDO;
    const data = post ? t.dataPublicacao || t.prazo : t.prazo;
    lista.push({
      grupo: post ? "Posts" : "Tarefas", titulo: t.titulo, icone: post ? "✦" : t.status === "concluido" ? "✓" : "○",
      detalhe: [t.clienteId ? nomeCliente(t.clienteId) : "", porId("marcas", t.marcaId)?.nome, data ? fmtData(data) : ""].filter(Boolean).join(" · "),
      texto: [t.titulo, nomeCliente(t.clienteId), porId("marcas", t.marcaId)?.nome, t.responsavel, t.tipo, t.formato].join(" "),
      abrir: () => abrirTarefa(t)
    });
  }
  for (const c of dados.compromissos) lista.push({
    grupo: "Compromissos", titulo: c.titulo, icone: "◷",
    detalhe: [c.data ? fmtData(c.data) : "", c.hora, c.clienteId ? nomeCliente(c.clienteId) : ""].filter(Boolean).join(" · "),
    texto: [c.titulo, nomeCliente(c.clienteId), (c.participantes || []).join(" ")].join(" "),
    abrir: () => abrirCompromisso(c)
  });
  return lista;
}

function procurar(termo) {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  const todos = candidatos();
  if (!palavras.length) return todos.filter((c) => c.grupo === "Telas");
  return todos
    .map((c) => {
      const alvo = normalizar(c.texto);
      if (!palavras.every((p) => alvo.includes(p))) return null;
      const titulo = normalizar(c.titulo);
      const nota = (titulo.startsWith(palavras[0]) ? 0 : titulo.includes(palavras[0]) ? 1 : 2) + (c.grupo === "Telas" ? -1 : 0);
      return { c, nota };
    })
    .filter(Boolean)
    .sort((a, b) => a.nota - b.nota)
    .slice(0, LIMITE)
    .map((x) => x.c);
}

export function abrirBusca() {
  if (document.querySelector(".busca-rapida") || ehCliente()) return; // o portal do cliente não tem a busca da equipe
  let resultados = [];
  let ativo = 0;
  const lista = el("ul", { class: "busca-lista", role: "listbox" });
  const entrada = el("input", {
    type: "search", placeholder: "Buscar cliente, marca, post, tarefa, compromisso ou tela…", "aria-label": "Buscar",
    onInput: () => { ativo = 0; desenhar(); },
    onKeydown: (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); ativo = Math.min(ativo + 1, resultados.length - 1); marcar(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); ativo = Math.max(ativo - 1, 0); marcar(); }
      else if (e.key === "Enter" && resultados[ativo]) { e.preventDefault(); escolher(resultados[ativo]); }
    }
  });
  const fechar = abrirModal("Busca rápida", el("div", { class: "busca-rapida" }, entrada, lista,
    el("p", { class: "nota busca-nota" }, "↑ ↓ para navegar · Enter para abrir · Esc para fechar")));
  function escolher(r) { fechar(); r.abrir(); }
  function marcar() {
    [...lista.children].forEach((li) => li.classList.toggle("ativo", Number(li.dataset.i) === ativo));
    lista.querySelector(".ativo")?.scrollIntoView({ block: "nearest" });
  }
  function desenhar() {
    resultados = procurar(entrada.value);
    let grupo = "";
    const itens = [];
    resultados.forEach((r, i) => {
      if (r.grupo !== grupo) { grupo = r.grupo; itens.push(el("li", { class: "busca-grupo", role: "presentation" }, grupo)); }
      itens.push(el("li", {
        class: `busca-item${i === ativo ? " ativo" : ""}`, role: "option", "data-i": String(i),
        onMousemove: () => { if (ativo !== i) { ativo = i; marcar(); } }, onClick: () => escolher(r)
      },
        el("span", { class: "busca-icone", "aria-hidden": "true" }, r.icone || "•"),
        el("span", { class: "busca-titulo" }, r.titulo),
        r.detalhe ? el("span", { class: "busca-detalhe" }, r.detalhe) : null));
    });
    lista.replaceChildren(...(itens.length ? itens : [el("li", { class: "busca-vazio" }, "Nada encontrado.")]));
  }
  desenhar();
  entrada.focus();
}

/** Atalho global. */
export function ativarAtalhoBusca() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && document.body.classList.contains("logado")) {
      e.preventDefault();
      abrirBusca();
    }
  });
}
