// Planejamento do mês de um cliente: uma tabela onde cada linha é um post.
// Ao salvar, cada linha vira (ou atualiza) uma tarefa do tipo Conteúdo — aparece na lista de tarefas e no calendário.
import { el, hojeISO, addDias, dataDe, fmtDiaSemana, avisar, abrirModal, confirmar, formulario, vazio } from "../ui.js";
import { dados, porId, criar, atualizar, excluir, clientesAtivos } from "../db.js";
import { cabecalho } from "./componentes.js";
import { FORMATOS, REDES, STATUS_CONTEUDO, TIPO_CONTEUDO, DIAS_SEMANA } from "../constantes.js";
import { postsDoMes, dataPost, exportarExcel, exportarPDF, nomeMes } from "../exportacao.js";
import { corCliente } from "./calendario.js";

const CAMPOS = ["dataPublicacao", "hora", "formato", "rede", "titulo", "objetivo", "roteiro", "prazo", "statusConteudo"];
let contador = 0;
const novaChave = () => `n${Date.now().toString(36)}${contador++}`;

function linhaDePost(t) {
  const l = { chave: t.id, id: t.id };
  for (const c of CAMPOS) l[c] = t[c] ?? "";
  l.dataPublicacao = dataPost(t);
  return l;
}

function linhaNova(data, base = {}) {
  return {
    chave: novaChave(), id: null, dataPublicacao: data, hora: base.hora || "", formato: base.formato || "Feed estático",
    rede: base.rede || "Instagram", titulo: "", objetivo: "", roteiro: "", prazo: "", statusConteudo: "ideia"
  };
}

function seletor(lista, valor, aoMudar, rotulo) {
  return el("select", { "aria-label": rotulo, onChange: (e) => aoMudar(e.target.value) },
    lista.map((o) => { const [v, r] = Array.isArray(o) ? o : [o, o]; return el("option", { value: v, selected: v === valor }, r); }));
}

export function render({ params, estado, renderizar }) {
  const [clienteId, mesParam] = params;
  if (!clienteId) return telaEscolha();
  const cliente = porId("clientes", clienteId);
  if (!cliente) return el("div", { class: "tela" }, vazio("Cliente não encontrado.", el("a", { href: "#/planejamento", class: "link" }, "← Voltar")));
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : hojeISO().slice(0, 7);
  const chave = `${clienteId}|${mes}`;

  // Rascunho em memória até salvar
  if (estado.chave !== chave) {
    estado.chave = chave;
    estado.linhas = postsDoMes(clienteId, mes).map(linhaDePost);
    estado.removidas = [];
    estado.alterado = false;
  }
  const marcar = () => { if (!estado.alterado) { estado.alterado = true; renderizar(); } };
  const ordenar = () => estado.linhas.sort((a, b) => (a.dataPublicacao + a.hora).localeCompare(b.dataPublicacao + b.hora));

  const irMes = (n) => {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(a, m - 1 + n, 1);
    if (estado.alterado && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
    location.hash = `#/planejamento/${clienteId}/${hojeISO(d).slice(0, 7)}`;
  };

  const adicionar = () => {
    const ultima = estado.linhas[estado.linhas.length - 1];
    let data = ultima ? addDias(ultima.dataPublicacao, 1) : `${mes}-01`;
    if (!data.startsWith(mes)) data = ultima.dataPublicacao;
    estado.linhas.push(linhaNova(data, ultima));
    estado.alterado = true;
    renderizar();
    setTimeout(() => document.getElementById(`pl-${estado.linhas.at(-1).chave}-titulo`)?.focus(), 30);
  };

  const preencher = async () => {
    const r = await formulario("Preencher o mês", [
      { nome: "dias", rotulo: "Dias da semana com post", tipo: "multi", opcoes: DIAS_SEMANA.map(([, n]) => n) },
      { nome: "formato", rotulo: "Formato", tipo: "select", opcoes: FORMATOS, padrao: "Feed estático", largura: "metade" },
      { nome: "rede", rotulo: "Rede", tipo: "select", opcoes: REDES, padrao: "Instagram", largura: "metade" },
      { nome: "hora", rotulo: "Horário", tipo: "time", largura: "metade" },
      { nome: "pularExistentes", rotulo: "Pular dias que já têm post", tipo: "checkbox", padrao: true }
    ], {}, { rotuloSalvar: "Adicionar linhas" });
    if (!r || !r.dias.length) return;
    const numeros = new Set(DIAS_SEMANA.filter(([, n]) => r.dias.includes(n)).map(([v]) => Number(v)));
    const [a, m] = mes.split("-").map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    let n = 0;
    for (let d = 1; d <= ultimo; d++) {
      const iso = `${mes}-${String(d).padStart(2, "0")}`;
      if (!numeros.has(dataDe(iso).getDay())) continue;
      if (r.pularExistentes && estado.linhas.some((l) => l.dataPublicacao === iso)) continue;
      estado.linhas.push(linhaNova(iso, r)); n++;
    }
    ordenar();
    estado.alterado = true;
    avisar(`${n} linha(s) adicionada(s). Preencha os temas e salve.`);
    renderizar();
  };

  const salvar = async (botao) => {
    const validas = estado.linhas.filter((l) => l.titulo.trim() || l.id);
    const semTema = validas.filter((l) => !l.titulo.trim());
    if (semTema.length) { avisar("Toda linha precisa de um tema. Preencha ou remova as linhas vazias.", "erro"); return; }
    botao.disabled = true; botao.textContent = "Salvando...";
    let criados = 0, atualizados = 0, removidos = 0;
    try {
      for (const l of validas) {
        const v = {};
        for (const c of CAMPOS) v[c] = typeof l[c] === "string" ? l[c].trim() : l[c];
        if (!v.prazo) v.prazo = addDias(v.dataPublicacao, -2) < hojeISO() ? hojeISO() : addDias(v.dataPublicacao, -2);
        if (l.id) {
          const atual = porId("tarefas", l.id);
          if (atual && CAMPOS.some((c) => (atual[c] ?? "") !== v[c])) { await atualizar("tarefas", l.id, v); atualizados++; }
        } else {
          const ref = await criar("tarefas", { ...v, tipo: TIPO_CONTEUDO, clienteId, status: "a_fazer", checklist: [], notas: "", linkCanva: "", linkDrive: "", copy: "" });
          l.id = ref.id; l.chave = ref.id; criados++;
        }
      }
      for (const id of estado.removidas) { if (porId("tarefas", id)) { await excluir("tarefas", id); removidos++; } }
      estado.removidas = [];
      estado.linhas = validas;
      estado.alterado = false;
      renderizar();
      const fechar = abrirModal("Planejamento salvo ✓", el("div", {},
        el("p", {}, `${criados} post(s) criado(s), ${atualizados} atualizado(s), ${removidos} removido(s). Tudo já está na sua lista de tarefas e no calendário.`),
        el("p", { class: "subtitulo" }, `Quer mandar o planejamento de ${nomeMes(mes)} para ${cliente.nome} aprovar?`),
        el("div", { class: "acoes" },
          el("button", { class: "secundario", onClick: () => exportarExcel(clienteId, mes) }, "⬇ Planilha Excel"),
          el("button", { class: "secundario", onClick: () => exportarPDF(clienteId, mes) }, "⬇ PDF para aprovação"),
          el("span", { class: "espaco" }),
          el("button", { onClick: () => fechar() }, "Fechar"))));
    } catch (e) {
      console.error(e);
      avisar("Erro ao salvar: " + e.message, "erro");
    } finally {
      botao.disabled = false; botao.textContent = "Salvar planejamento";
    }
  };

  const campoTexto = (l, campo, attrs = {}) => {
    const tag = attrs.textarea ? "textarea" : "input";
    const e = el(tag, {
      id: `pl-${l.chave}-${campo}`, type: attrs.tipo || "text", placeholder: attrs.dica || "", rows: attrs.textarea ? 2 : undefined,
      "aria-label": attrs.rotulo || campo,
      onInput: (ev) => { l[campo] = ev.target.value; marcar(); },
      onChange: attrs.reordenar ? () => { ordenar(); renderizar(); } : undefined
    });
    e.value = l[campo] || "";
    return e;
  };

  const linhas = estado.linhas.map((l) => el("tr", { class: l.id ? "" : "nova" },
    el("td", { class: "col-data" }, campoTexto(l, "dataPublicacao", { tipo: "date", rotulo: "Data", reordenar: true }),
      el("small", { class: "dia-semana" }, l.dataPublicacao ? fmtDiaSemana(l.dataPublicacao) : "")),
    el("td", { class: "col-hora" }, campoTexto(l, "hora", { tipo: "time", rotulo: "Horário" })),
    el("td", {}, seletor(FORMATOS, l.formato, (v) => { l.formato = v; marcar(); }, "Formato")),
    el("td", {}, seletor(REDES, l.rede, (v) => { l.rede = v; marcar(); }, "Rede")),
    el("td", { class: "col-tema" }, campoTexto(l, "titulo", { dica: "Tema do post", rotulo: "Tema" })),
    el("td", {}, campoTexto(l, "objetivo", { dica: "Objetivo", rotulo: "Objetivo" })),
    el("td", { class: "col-briefing" }, campoTexto(l, "roteiro", { textarea: true, dica: "Briefing / ideia", rotulo: "Briefing" })),
    el("td", { class: "col-data" }, campoTexto(l, "prazo", { tipo: "date", rotulo: "Prazo de produção" })),
    el("td", {}, seletor(STATUS_CONTEUDO, l.statusConteudo || "ideia", (v) => { l.statusConteudo = v; marcar(); }, "Etapa")),
    el("td", { class: "col-acoes" },
      el("button", { class: "icone", title: "Duplicar", "aria-label": "Duplicar linha", onClick: () => {
        const i = estado.linhas.indexOf(l);
        estado.linhas.splice(i + 1, 0, { ...l, chave: novaChave(), id: null });
        estado.alterado = true; renderizar();
      } }, "⧉"),
      el("button", { class: "icone", title: "Remover", "aria-label": "Remover linha", onClick: async () => {
        if (l.id && !(await confirmar(`Remover "${l.titulo}"? A tarefa será excluída quando você salvar.`))) return;
        if (l.id) estado.removidas.push(l.id);
        estado.linhas = estado.linhas.filter((x) => x !== l);
        estado.alterado = true; renderizar();
      } }, "✕"))));

  const botaoSalvar = el("button", { class: "destaque", disabled: !estado.alterado, onClick: (e) => salvar(e.currentTarget) }, "Salvar planejamento");

  return el("div", { class: "tela tela-larga" },
    el("a", { href: "#/planejamento", class: "voltar" }, "← Planejamento"),
    el("header", { class: "tela-topo ficha-topo", style: { "--selo": corCliente(cliente) } },
      el("div", {},
        el("h1", {}, `Planejamento · ${cliente.nome}`),
        el("div", { class: "navegador-mes" },
          el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => irMes(-1) }, "‹"),
          el("strong", {}, nomeMes(mes)),
          el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => irMes(1) }, "›"),
          el("span", { class: "subtitulo" }, `${estado.linhas.length} post(s)${estado.alterado ? " · alterações não salvas" : ""}`))),
      el("div", { class: "tela-acoes" },
        el("button", { class: "secundario", onClick: () => exportarExcel(clienteId, mes), disabled: estado.alterado, title: estado.alterado ? "Salve antes de exportar" : "" }, "⬇ Excel"),
        el("button", { class: "secundario", onClick: () => exportarPDF(clienteId, mes), disabled: estado.alterado, title: estado.alterado ? "Salve antes de exportar" : "" }, "⬇ PDF"),
        botaoSalvar)),
    cliente.tomDeVoz || cliente.publico ? el("p", { class: "dica-cliente" },
      cliente.tomDeVoz ? [el("strong", {}, "Tom de voz: "), cliente.tomDeVoz, " "] : null,
      cliente.publico ? [el("strong", {}, " Público: "), cliente.publico] : null) : null,
    el("div", { class: "bloco tabela-rolagem" },
      el("table", { class: "tabela-plano" },
        el("thead", {}, el("tr", {}, ["Publicação", "Hora", "Formato", "Rede", "Tema", "Objetivo", "Briefing", "Prazo produção", "Etapa", ""].map((h) => el("th", {}, h)))),
        el("tbody", {}, linhas.length ? linhas : el("tr", {}, el("td", { colspan: 10, class: "vazio" }, "Nenhum post planejado. Adicione linhas ou use \"Preencher o mês\".")))),
      el("div", { class: "acoes" },
        el("button", { class: "secundario", onClick: adicionar }, "+ Adicionar post"),
        el("button", { class: "secundario", onClick: preencher }, "Preencher o mês (dias fixos)"),
        el("span", { class: "espaco" }),
        estado.alterado ? el("button", { class: "link", onClick: () => { estado.chave = null; renderizar(); } }, "Descartar alterações") : null)),
    el("p", { class: "nota" }, "Ao salvar, cada linha vira um post: entra na lista de tarefas (com o prazo de produção) e no calendário (na data de publicação). Mudanças aqui atualizam os posts existentes."));
}

function telaEscolha() {
  const mes = hojeISO().slice(0, 7);
  return el("div", { class: "tela" },
    cabecalho("Planejamento", "Escolha o cliente para planejar o mês"),
    el("div", { class: "grade-clientes" }, clientesAtivos().map((c) => {
      const n = postsDoMes(c.id, mes).length;
      const prox = postsDoMes(c.id, hojeISO(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)).slice(0, 7)).length;
      return el("a", { class: "cartao-cliente", href: `#/planejamento/${c.id}/${mes}`, style: { "--selo": corCliente(c) } },
        el("h3", {}, c.nome),
        el("div", { class: "numeros-cliente" },
          el("span", {}, el("strong", {}, n), " posts este mês"),
          el("span", {}, el("strong", {}, prox), " no próximo")));
    })));
}
