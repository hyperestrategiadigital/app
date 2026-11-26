// Planejamento do mês de um cliente: uma tabela onde cada linha é um post.
// Ao salvar, cada linha vira (ou atualiza) uma tarefa do tipo Conteúdo — aparece na lista de tarefas e no calendário.
import { el, hojeISO, addDias, dataDe, fmtDiaSemana, fmtData, avisar, abrirModal, confirmar, formulario, vazio, fecharModais, normalizar } from "../ui.js";
import { porId, criar, atualizar, excluir, clientesAtivos, marcasDo } from "../db.js";
import { cabecalho, abas, modeloChecklist } from "./componentes.js";
import { responsavelPadrao } from "../agenda.js";
import { datasEntre } from "../datas.js";
import { FORMATOS, formatoAtual, prazoDoPost, REDES, STATUS_CONTEUDO, TIPO_CONTEUDO, DIAS_SEMANA, rotuloStatusConteudo, statusDaEtapa, OBJETIVOS, rotuloObjetivo, objetivoDe } from "../constantes.js";
import { postsDoMes, dataPost, exportarPDF, nomeMes, temPrefixo } from "../exportacao.js";
import { corCliente } from "./calendario.js";
import { gerarLinkAprovacao } from "../aprovacoes.js";

const CAMPOS = ["dataPublicacao", "hora", "formato", "rede", "titulo", "objetivo", "roteiro", "prazo", "statusConteudo", "marcaId", "pilar", "copy"];
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
    chave: novaChave(), id: null, dataPublicacao: data, hora: base.hora || "", formato: formatoAtual(base.formato) || "Estático",
    rede: base.rede || "Instagram", titulo: "", objetivo: "", roteiro: "", prazo: "", statusConteudo: "ideia", marcaId: base.marcaId || "", pilar: "", copy: ""
  };
}

function seletor(lista, valor, aoMudar, rotulo) {
  return el("select", { "aria-label": rotulo, onChange: (e) => aoMudar(e.target.value) },
    lista.map((o) => { const [v, r] = Array.isArray(o) ? o : [o, o]; return el("option", { value: v, selected: v === valor }, r); }));
}

/** O planejamento é um modo do Calendário: #/calendario/<cliente>/<mês>/planejar */
export const linkPlano = (clienteId, mes) => `#/calendario/${clienteId}/${mes}/planejar`;

/** Rota antiga #/planejamento/<cliente>/<mês>: leva para o Calendário. */
export function redirecionar({ params }) {
  const [clienteId, mes] = params;
  location.replace(clienteId ? linkPlano(clienteId, /^\d{4}-\d{2}$/.test(mes || "") ? mes : hojeISO().slice(0, 7)) : "#/calendario");
  return el("div");
}

export function render({ params, estado, renderizar }) {
  const [clienteId, mesParam] = params;
  if (!clienteId) return telaEscolha();
  const cliente = porId("clientes", clienteId);
  if (!cliente) return el("div", { class: "tela" }, vazio("Cliente não encontrado.", el("a", { href: "#/calendario", class: "link" }, "← Calendário")));
  const mes = /^\d{4}-\d{2}$/.test(mesParam || "") ? mesParam : hojeISO().slice(0, 7);
  const chave = `${clienteId}|${mes}`;

  estado.modo ??= "calendario";
  // Rascunho em memória até salvar
  if (estado.chave !== chave) {
    estado.chave = chave;
    estado.clienteId = clienteId;
    estado.linhas = postsDoMes(clienteId, mes).map(linhaDePost);
    estado.removidas = [];
    estado.alterado = false;
  }
  const marcar = () => { if (!estado.alterado) { estado.alterado = true; renderizar(); } };
  const marcas = marcasDo(clienteId);
  const opcoesMarca = [...marcas.map((m) => [m.id, m.nome]), ["", "Institucional do grupo"]];
  const ordenar = () => estado.linhas.sort((a, b) => (a.dataPublicacao + a.hora).localeCompare(b.dataPublicacao + b.hora));

  const irMes = (n) => {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(a, m - 1 + n, 1);
    if (estado.alterado && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
    location.hash = linkPlano(clienteId, hojeISO(d).slice(0, 7));
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
      { nome: "formato", rotulo: "Formato", tipo: "select", opcoes: FORMATOS, padrao: "Estático", largura: "metade" },
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

  /**
   * Importar planejamento (JSON): os posts entram como rascunho neste mês (você revisa e salva).
   * Formato: { tipo: "planejamento-hyper", posts: [{ data: "AAAA-MM-DD", hora, marca, formato, rede, titulo, pilar, objetivo, roteiro, copy }] }
   */
  const importar = () => {
    const texto = el("textarea", { rows: 8, id: "plano-json", placeholder: "Cole aqui o JSON do planejamento" });
    const previa = el("div", { class: "previa-briefing" });
    let novos = [];
    const marcaDe = (nome) => !nome ? (estado.marcaAtual || "") : (marcas.find((x) => normalizar(x.nome).replace(/[^a-z0-9]/g, "") === normalizar(nome).replace(/[^a-z0-9]/g, ""))?.id ?? null);
    const ler = () => {
      novos = [];
      if (!texto.value.trim()) { previa.replaceChildren(); botao.disabled = true; return; }
      let j;
      try {
        const t = texto.value; const ini = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
        j = JSON.parse(t.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || (ini.length ? t.slice(Math.min(...ini)) : t));
      } catch { previa.replaceChildren(el("p", { class: "erro" }, "Não consegui ler o JSON. Copie a resposta inteira.")); botao.disabled = true; return; }
      const posts = Array.isArray(j) ? j : j.posts || [];
      const foraDoMes = posts.filter((p) => !String(p.data || "").startsWith(mes));
      const semMarca = new Set();
      for (const p of posts.filter((x) => String(x.data || "").startsWith(mes) && (x.titulo || x.tema))) {
        let marcaId = marcas.length ? marcaDe(p.marca) : "";
        if (marcaId === null) { semMarca.add(p.marca); marcaId = ""; }
        novos.push({ ...linhaNova(p.data, { formato: p.formato, rede: p.rede, hora: p.hora, marcaId }), titulo: String(p.titulo || p.tema).trim(),
          pilar: p.pilar || "", objetivo: objetivoDe(p.objetivo || ""), roteiro: p.roteiro || p.briefing || "", copy: p.copy || "",
          formato: formatoAtual(p.formato) || "Estático", rede: p.rede || "Instagram", hora: p.hora || "" });
      }
      botao.disabled = !novos.length;
      previa.replaceChildren(...[
        el("p", {}, el("strong", {}, `${novos.length} post(s) de ${nomeMes(mes)}`), " entram como rascunho em ", el("strong", {}, cliente.nome), "."),
        novos.length ? el("ul", { class: "lista-previa-briefing" }, novos.map((l) => el("li", {}, `${fmtData(l.dataPublicacao, true)} · ${l.formato} | ${l.titulo}${l.marcaId ? ` · ${porId("marcas", l.marcaId)?.nome}` : ""}`))) : null,
        foraDoMes.length ? el("p", { class: "faixa-aviso" }, `${foraDoMes.length} post(s) de outro mês ficam de fora: importe no mês deles.`) : null,
        semMarca.size ? el("p", { class: "faixa-aviso" }, `Marca não encontrada (${[...semMarca].join(", ")}): esses posts entram como institucionais do grupo.`) : null
      ].filter(Boolean));
    };
    texto.addEventListener("input", ler);
    const botao = el("button", { class: "confirmar", disabled: true, onClick: () => {
      estado.linhas.push(...novos); ordenar(); estado.alterado = true; fechar(); renderizar();
      avisar(`${novos.length} post(s) no rascunho. Revise e clique em Salvar planejamento.`);
    } }, "Colocar no planejamento");
    const fechar = abrirModal(`Importar planejamento · ${cliente.nome} · ${nomeMes(mes)}`, el("div", { class: "importar-briefing" },
      el("p", {}, "Cole o JSON do planejamento. Os posts deste mês entram como rascunho: nada é gravado até você clicar em Salvar planejamento."),
      texto, previa, el("div", { class: "acoes" }, el("button", { class: "secundario negar", onClick: () => fechar() }, "Cancelar"), botao)), { largo: true });
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
        if (!v.prazo) v.prazo = prazoDoPost(v.dataPublicacao, v.formato, hojeISO()); // antecedência do formato (Ajustes → Menus e listas)
        const status = statusDaEtapa(v.statusConteudo);
        if (l.id) {
          const atual = porId("tarefas", l.id);
          if (atual && CAMPOS.some((c) => (atual[c] ?? "") !== v[c])) {
            await atualizar("tarefas", l.id, { ...v, status, ...(status !== atual.status ? { concluidoEm: status === "concluido" ? hojeISO() : null } : {}) });
            atualizados++;
          }
        } else {
          const ref = await criar("tarefas", { ...v, tipo: TIPO_CONTEUDO, clienteId, responsavel: responsavelPadrao(), status, concluidoEm: status === "concluido" ? hojeISO() : null, checklist: modeloChecklist({ tipo: TIPO_CONTEUDO, formato: v.formato }), notas: "", linkCanva: "", linkDrive: "" });
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
          el("button", { class: "destaque", onClick: () => gerarLinkAprovacao(clienteId, mes) }, "🔗 Link para o cliente aprovar"),
          el("button", { class: "secundario", onClick: () => exportarPDF(clienteId, mes) }, "⬇ PDF"),
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
    marcas.length ? el("td", {}, seletor(opcoesMarca, l.marcaId || "", (v) => { l.marcaId = v; marcar(); }, "Marca")) : null,
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

  const tabela = el("div", { class: "bloco tabela-rolagem" },
      el("table", { class: "tabela-plano" },
        el("thead", {}, el("tr", {}, ["Publicação", "Hora", "Formato", "Rede", ...(marcas.length ? ["Marca"] : []), "Tema", "Objetivo", "Briefing", "Prazo produção", "Etapa", ""].map((h) => el("th", {}, h)))),
        el("tbody", {}, linhas.length ? linhas : el("tr", {}, el("td", { colspan: marcas.length ? 11 : 10, class: "vazio" }, "Nenhum post planejado. Adicione linhas ou use \"Preencher o mês\".")))),
      el("div", { class: "acoes" },
        el("button", { class: "secundario", onClick: adicionar }, "+ Adicionar post"),
        el("button", { class: "secundario", onClick: preencher }, "Preencher o mês (dias fixos)"),
        el("span", { class: "espaco" }),
        estado.alterado ? el("button", { class: "link", onClick: () => { estado.chave = null; renderizar(); } }, "Descartar alterações") : null));

  const botaoSalvar = el("button", { class: "confirmar", disabled: !estado.alterado, onClick: (e) => salvar(e.currentTarget) }, "Salvar planejamento");

  return el("div", { class: "tela tela-larga" },
    el("div", { class: "filtros" },
      abas([["ver", "Calendário"], ["planejar", "Planejar mês"]], "planejar", () => {
        if (estado.alterado && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
        location.hash = `#/calendario/${clienteId}/${mes}`;
      })),
    el("header", { class: "tela-topo ficha-topo", style: { "--selo": corCliente(cliente) } },
      el("div", {},
        el("h1", {}, `Planejamento · ${cliente.nome}`),
        el("div", { class: "navegador-mes" },
          el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => irMes(-1) }, "‹"),
          el("strong", {}, nomeMes(mes)),
          el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => irMes(1) }, "›"),
          el("span", { class: "subtitulo" }, `${estado.linhas.length} post(s)${estado.alterado ? " · alterações não salvas" : ""}`))),
      el("div", { class: "tela-acoes" },
        el("button", { class: "secundario", onClick: () => gerarLinkAprovacao(clienteId, mes), disabled: estado.alterado, title: estado.alterado ? "Salve antes" : "" }, "🔗 Link de aprovação"),
        el("button", { class: "secundario", onClick: () => exportarPDF(clienteId, mes), disabled: estado.alterado, title: estado.alterado ? "Salve antes de exportar" : "" }, "⬇ PDF"),
        botaoSalvar)),
    cliente.tomDeVoz || cliente.publico ? el("p", { class: "dica-cliente" },
      cliente.tomDeVoz ? [el("strong", {}, "Tom de voz: "), cliente.tomDeVoz, " "] : null,
      cliente.publico ? [el("strong", {}, " Público: "), cliente.publico] : null) : null,
    el("div", { class: "filtros" },
      abas([["calendario", "Grade do mês"], ["tabela", "Tabela"]], estado.modo, (m) => { estado.modo = m; renderizar(); }),
      el("button", { class: "secundario mini", onClick: preencher }, "Preencher dias fixos"),
      el("button", { class: "secundario mini", onClick: importar }, "Importar planejamento (JSON)"),
      marcas.length ? el("label", { class: "check-inline" }, "Novos posts da marca ",
        seletor(opcoesMarca, estado.marcaAtual || "", (v) => { estado.marcaAtual = v; }, "Marca dos novos posts")) : null,
      el("span", { class: "espaco" }),
      estado.alterado ? el("button", { class: "link", onClick: () => { estado.chave = null; renderizar(); } }, "Descartar alterações") : null),
    estado.modo === "calendario" ? calendarioPlano({ estado, mes, cliente, renderizar, marcar: () => { estado.alterado = true; renderizar(); } }) : tabela,
    el("p", { class: "nota" }, "No calendário, digite no dia no formato \"Formato | Tema\" (ex.: Estático | Promo de Natal) e aperte Enter. Arraste para trocar o dia. Ao salvar, cada post entra na lista de tarefas (com o prazo de produção) e na aba Conteúdo."));
}

function telaEscolha() {
  const mes = hojeISO().slice(0, 7);
  return el("div", { class: "tela" },
    cabecalho("Planejamento", "Escolha o cliente para planejar o mês"),
    el("div", { class: "grade-clientes" }, clientesAtivos().map((c) => {
      const n = postsDoMes(c.id, mes).length;
      const prox = postsDoMes(c.id, hojeISO(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)).slice(0, 7)).length;
      return el("a", { class: "cartao-cliente", href: linkPlano(c.id, mes), style: { "--selo": corCliente(c) } },
        el("h3", {}, c.nome),
        el("div", { class: "numeros-cliente" },
          el("span", {}, el("strong", {}, n), " posts este mês"),
          el("span", {}, el("strong", {}, prox), " no próximo")));
    })));
}

/* ---------------- Calendário de planejamento ---------------- */

// "Estático | Tema" → { formato, titulo }. Prefixos do jeito que você já escreve na planilha.
const PREFIXOS = [
  [/^est[aá]tico/i, "Estático"], [/^feed/i, "Estático"], [/^carrossel/i, "Carrossel"],
  [/^reels?/i, "Vídeo"], [/^v[ií]deo/i, "Vídeo"], [/^stor(y|ies)/i, "Story"], [/^whats/i, "WhatsApp"],
  [/^tiktok/i, "Vídeo"], [/^tr[aá]fego/i, "Estático"], [/^an[uú]ncio/i, "Estático"], [/^blog/i, "Blog"],
  [/^artigo/i, "Artigo"], [/^e-?mail/i, "E-mail marketing"]
];
export function lerTextoRapido(texto, formatoPadrao = "Estático") {
  return texto.split(";").map((parte) => parte.trim()).filter(Boolean).map((parte) => {
    const [prefixo, ...resto] = parte.split("|");
    if (resto.length) {
      const achado = PREFIXOS.find(([re]) => re.test(prefixo.trim()));
      if (achado) return { formato: achado[1], titulo: resto.join("|").trim() };
    }
    // Prefixo desconhecido (ex.: "Comercial | ..."): mantém o texto inteiro como tema, em Estático
    return { formato: resto.length ? "Estático" : formatoPadrao, titulo: parte };
  });
}

function editarLinha(l, estado, marcar) {
  formulario("Post do planejamento", [
    { nome: "titulo", rotulo: "Tema", obrigatorio: true },
    ...(marcasDo(estado.clienteId).length ? [{ nome: "marcaId", rotulo: "Marca", tipo: "select", opcoes: [...marcasDo(estado.clienteId).map((m) => [m.id, m.nome]), ["", "Institucional do grupo"]] }] : []),
    { nome: "dataPublicacao", rotulo: "Publicação", tipo: "date", obrigatorio: true, largura: "metade" },
    { nome: "hora", rotulo: "Horário", tipo: "time", largura: "metade" },
    { nome: "formato", rotulo: "Formato", tipo: "select", opcoes: FORMATOS, largura: "metade" },
    { nome: "rede", rotulo: "Rede", tipo: "select", opcoes: REDES, largura: "metade" },
    { nome: "objetivo", rotulo: "Objetivo (etapa do funil)", tipo: "select", opcoes: [["", "—"], ...OBJETIVOS, ...(l.objetivo && !OBJETIVOS.some(([v]) => v === l.objetivo) ? [[l.objetivo, l.objetivo]] : [])] },
    { nome: "roteiro", rotulo: "Briefing / ideia", tipo: "textarea", linhas: 3 },
    { nome: "prazo", rotulo: "Prazo de produção", tipo: "date", largura: "metade" },
    { nome: "statusConteudo", rotulo: "Etapa", tipo: "select", opcoes: STATUS_CONTEUDO, largura: "metade" }
  ], l, {
    rotuloSalvar: "Aplicar",
    extras: [el("button", { type: "button", class: "perigo-texto", onClick: async () => {
      if (l.id && !(await confirmar(`Remover "${l.titulo}"? O post será excluído quando você salvar o planejamento.`))) return;
      if (l.id) estado.removidas.push(l.id);
      estado.linhas = estado.linhas.filter((x) => x !== l);
      fecharModais();
      marcar();
    } }, "Remover"), el("button", { type: "button", class: "secundario", onClick: () => {
      estado.linhas.push({ ...l, chave: novaChave(), id: null });
      fecharModais();
      marcar();
    } }, "Duplicar")],
    aoSalvar: (v) => { Object.assign(l, v); marcar(); }
  });
}

function calendarioPlano({ estado, mes, cliente, renderizar, marcar }) {
  const [a, m] = mes.split("-").map(Number);
  const primeiro = new Date(a, m - 1, 1);
  const inicio = addDias(hojeISO(primeiro), -((primeiro.getDay() + 6) % 7));
  const dias = Array.from({ length: 42 }, (_, i) => addDias(inicio, i));
  const semanas = dias[35].slice(0, 7) === mes ? 6 : 5;
  const hoje = hojeISO();
  // Feriados, datas comerciais e as datas das marcas do cliente (aba Marca): para planejar em cima delas
  const datas = datasEntre(dias[0], dias[semanas * 7 - 1], { clienteId: estado.clienteId });
  const datasDoMes = datas.filter((x) => x.data.startsWith(mes));

  const celula = (d) => {
    const doMes = d.startsWith(mes);
    const doDia = estado.linhas.filter((l) => l.dataPublicacao === d).sort((x, y) => (x.hora || "").localeCompare(y.hora || ""));
    const entrada = doMes ? el("input", {
      class: "plano-rapido", id: `rapido-${d}`, placeholder: doDia.length ? "+" : "Formato | Tema",
      "aria-label": `Novo post em ${fmtData(d)}`,
      onKeydown: (e) => {
        if (e.key !== "Enter" || !e.target.value.trim()) return;
        e.preventDefault();
        const base = doDia[doDia.length - 1] || estado.linhas[estado.linhas.length - 1];
        for (const item of lerTextoRapido(e.target.value, base?.formato)) estado.linhas.push({ ...linhaNova(d, base), marcaId: estado.marcaAtual || "", ...item });
        estado.alterado = true;
        renderizar();
        setTimeout(() => document.getElementById(`rapido-${d}`)?.focus(), 20);
      }
    }) : null;
    return el("div", {
      class: `plano-dia ${doMes ? "" : "fora"} ${d === hoje ? "hoje" : ""}`,
      onDragover: doMes ? (e) => { e.preventDefault(); e.currentTarget.classList.add("alvo"); } : undefined,
      onDragleave: (e) => e.currentTarget.classList.remove("alvo"),
      onDrop: doMes ? (e) => {
        e.preventDefault();
        const l = estado.linhas.find((x) => x.chave === e.dataTransfer.getData("text/plain"));
        if (l && l.dataPublicacao !== d) { l.dataPublicacao = d; marcar(); }
      } : undefined
    },
    el("div", { class: "plano-data" }, el("strong", {}, Number(d.slice(8))), el("span", {}, `/${d.slice(5, 7)}`)),
    datas.filter((x) => x.data === d && x.tipo !== "mes").map((x) => el("span", { class: `data-cal ${x.tipo}`, title: x.nome }, x.nome)),
    doDia.map((l) => {
      const marcaL = porId("marcas", l.marcaId);
      const chip = el("button", {
        class: `plano-post st-${l.statusConteudo || "ideia"} ${l.id ? "" : "novo"}`, draggable: "true",
        style: marcaL ? { "--marca": corCliente(marcaL) } : undefined,
        title: `${marcaL ? marcaL.nome + " · " : ""}${l.formato} · ${rotuloStatusConteudo(l.statusConteudo || "ideia")}${l.objetivo ? " · " + rotuloObjetivo(l.objetivo) : ""}`,
        onClick: () => editarLinha(l, estado, marcar)
      }, marcaL ? el("span", { class: "plano-marca" }, marcaL.nome) : null,
        temPrefixo(l.titulo) ? l.titulo : [el("strong", {}, l.formato), ` | ${l.titulo || "(sem tema)"}`], l.hora ? el("small", {}, ` ${l.hora}`) : null);
      chip.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", l.chave));
      return chip;
    }),
    entrada);
  };

  return el("div", { class: "bloco plano-calendario", style: { "--selo": cliente.paleta?.[0] || cliente.cor || "#4E2CA3" } },
    datasDoMes.length ? el("div", { class: "datas-do-mes", "aria-label": "Datas do mês" }, el("strong", {}, "Datas do mês:"),
      datasDoMes.map((x) => el("span", { class: `data-cal ${x.tipo}` }, x.tipo === "mes" ? `${x.nome} (o mês todo)` : `${fmtData(x.data, true)} ${x.nome}`))) : null,
    el("div", { class: "plano-grade" },
      ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map((n) => el("div", { class: "plano-cabeca" }, n)),
      dias.slice(0, semanas * 7).map(celula)),
    el("div", { class: "legenda-etapas" }, STATUS_CONTEUDO.map(([v, r]) => el("span", { class: `etiqueta st-${v}` }, r))));
}
