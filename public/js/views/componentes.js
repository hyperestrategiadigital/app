// Peças reutilizadas entre telas: cartão e formulário de tarefa, selo de cliente.
import { pode } from "../permissoes.js";
import { abrirCriarArte } from "./criar.js";
import { quitarCobranca, lancamentoDe } from "../recorrencias.js";
import { el, formulario, confirmar, avisar, fmtPrazoRelativo, fmtData, diasAte, hojeISO, addDias, linkExterno, fecharModais } from "../ui.js";
import { dados, criar, atualizar, excluir, nomeCliente, opcoesClientes, porId, salvarComId, marcasDo, desfazerExclusao } from "../db.js";
import { STATUS_TAREFA, TIPOS_TAREFA, TIPO_CONTEUDO, ehConteudo, FORMATOS, REDES, STATUS_CONTEUDO, rotuloStatusConteudo, statusDaEtapa } from "../constantes.js";
import { promptCopy } from "../prompts.js";
import { listarArtesTarefa, salvarArte, excluirArte, comprimirImagem } from "../arquivos.js";
import { abrirCompromisso } from "../compromissos.js";
import { configEquipe } from "../agenda.js";
import { linkAgendadorMeta, linkLinkedinAdmin } from "./contas.js";

/** Nomes da equipe (Ajustes → Equipe) + quem já aparece nas tarefas. */
export function opcoesResponsaveis(atual = "") {
  const nomes = configEquipe().map((p) => p.nome).filter(Boolean);
  if (!nomes.length) nomes.push("Matheus");
  if (atual && !nomes.includes(atual)) nomes.push(atual);
  return nomes;
}
export const iniciais = (nome = "") => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";

export const atrasada = (t) => t.status !== "concluido" && t.prazo && t.prazo < hojeISO();

/** Cor que identifica o cliente: 1ª cor da paleta da marca ou a cor escolhida no cadastro. */
export const corCliente = (c) => c?.paleta?.[0] || c?.cor || "#606060";

/** Foto da pessoa (membro ou nome da equipe) ou as iniciais, quando não tem foto. */
export function avatar(pessoa, { grande = false, titulo } = {}) {
  const m = typeof pessoa === "string" ? dados.membros.find((x) => x.nome === pessoa) : pessoa;
  const nome = typeof pessoa === "string" ? pessoa : (pessoa?.nome || pessoa?.email || "");
  const classe = `avatar${grande ? " grande" : ""}`;
  return m?.foto
    ? el("img", { class: classe, src: m.foto, alt: "", title: titulo || nome, referrerpolicy: "no-referrer" })
    : el("span", { class: classe, title: titulo || nome }, iniciais(nome));
}

/** Cor de um post/tarefa: a da marca (se tiver) ou a do cliente. */
export const corDoItem = (t) => corCliente(porId("marcas", t?.marcaId) || porId("clientes", t?.clienteId));
/** "Cliente" ou "Cliente · Marca". */
export const nomeComMarca = (t) => {
  const m = porId("marcas", t?.marcaId);
  return m ? `${nomeCliente(t.clienteId)} · ${m.nome}` : nomeCliente(t?.clienteId);
};

/** Selo com o nome (e a cor) do cliente; passe a tarefa para mostrar também a marca. */
export function seloCliente(clienteId, item) {
  if (!clienteId) return null;
  const c = porId("clientes", clienteId);
  return el("a", { class: "selo-cliente", href: `#/clientes/${clienteId}`, onClick: (e) => e.stopPropagation(), style: c ? { "--selo": item ? corDoItem(item) : corCliente(c) } : undefined },
    item ? nomeComMarca(item) : nomeCliente(clienteId));
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
    { nome: "marcaId", rotulo: "Marca", tipo: "select", largura: "metade",
      opcoesDe: (v) => [["", "Marca principal do cliente"], ...marcasDo(v.clienteId).map((m) => [m.id, m.nome])],
      mostrarSe: (v) => marcasDo(v.clienteId).length > 0 },

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
    { nome: "responsavel", rotulo: "Responsável", tipo: "select", opcoes: opcoesResponsaveis(tarefa.responsavel), padrao: opcoesResponsaveis()[0], largura: "metade" },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: STATUS_TAREFA, padrao: "a_fazer", largura: "metade", mostrarSe: (v) => !conteudo(v) },
    { nome: "prazo", rotulo: "Prazo de entrega", tipo: "date", padrao: hojeISO(), largura: "metade" },
    { nome: "checklist", rotulo: "Checklist", tipo: "checklist" },
    { nome: "linkCanva", rotulo: "Link do Canva (criativo)", dica: "https://www.canva.com/design/...", largura: "metade" },
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
    editando && ehConteudo(tarefa) ? el("a", {
      class: "botao-link secundario mini so-conteudo", target: "_blank", rel: "noopener",
      href: tarefa.rede === "LinkedIn" && porId("clientes", tarefa.clienteId)?.linkedin ? linkLinkedinAdmin(porId("clientes", tarefa.clienteId)) : linkAgendadorMeta(porId("clientes", tarefa.clienteId) || {}),
      onClick: async () => { if (tarefa.copy) { try { await navigator.clipboard.writeText(tarefa.copy); avisar("Legenda copiada. Cole no agendador."); } catch {} } }
    }, "📅 Agendar") : null,
    editando ? el("button", {
      type: "button", class: "perigo-texto",
      onClick: async () => {
        if (await confirmar(`Excluir "${tarefa.titulo}"?`)) {
          const { id, ...copia } = porId("tarefas", tarefa.id) || tarefa;
          await excluir("tarefas", id);
          fecharModais();
          avisar("Tarefa excluída.", "ok", { desfazer: () => desfazerExclusao("tarefas", id, copia) });
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
  // Criativos anexados ao post (imagens guardadas no banco)
  if (form) form.querySelector(".acoes").before(secaoCriativos(tarefa));
  // Rotina "Produzir semana": mostra ao vivo os posts da semana seguinte do cliente
  if (form && tarefa.semanaInicio) form.querySelector(".acoes").before(secaoSemana(tarefa));
  if (form && tarefa.atalho) form.querySelector(".acoes").prepend(el("a", { class: "botao-link secundario mini", href: tarefa.atalho, onClick: () => fecharModais() },
    tarefa.rotina === "planejamento" ? "☷ Abrir planejamento" : tarefa.rotina === "cobranca" ? "$ Abrir financeiro" : "▦ Abrir calendário"));
  // Reunião não é tarefa: vira compromisso (calendário de compromissos + Google Agenda)
  const virarCompromisso = async () => {
    const v = form.lerValores();
    fecharModais();
    const salvo = await abrirCompromisso({ titulo: v.titulo, clienteId: v.clienteId, data: v.prazo || hojeISO(), descricao: v.notas, tipo: "Reunião" });
    if (salvo && tarefa.id) await excluir("tarefas", tarefa.id, { lixeira: false });
  };
  form?.querySelector("#f-tipo")?.addEventListener("change", (e) => {
    if (e.target.value === "Reunião") { avisar("Reuniões entram como compromisso: aparecem no calendário e podem ir para a Google Agenda."); virarCompromisso(); }
  });
  if (form && tarefa.id && tarefa.tipo === "Reunião") form.querySelector(".acoes").prepend(
    el("button", { type: "button", class: "destaque mini", onClick: virarCompromisso }, "◷ Transformar em compromisso"));
  const alternar = () => form?.querySelectorAll(".so-conteudo").forEach((b) => (b.hidden = !conteudo(form.lerValores())));
  form?.addEventListener("change", alternar);
  alternar();
  return promessa;
}

function secaoSemana(tarefa) {
  const fim = addDias(tarefa.semanaInicio, 6);
  const posts = dados.tarefas
    .filter((t) => t.tipo === TIPO_CONTEUDO && (!tarefa.clienteId || t.clienteId === tarefa.clienteId))
    .map((t) => ({ t, d: t.dataPublicacao || t.prazo || "" }))
    .filter(({ d }) => d >= tarefa.semanaInicio && d <= fim)
    .sort((a, b) => a.d.localeCompare(b.d));
  return el("div", { class: "semana-producao" },
    el("h3", { class: "form-secao" }, `Posts de ${fmtData(tarefa.semanaInicio, true)} a ${fmtData(fim, true)} (${posts.length})`),
    posts.length ? posts.map(({ t, d }) => el("button", { type: "button", class: "linha-tabela", onClick: () => { fecharModais(); abrirTarefa(t); } },
      el("span", { class: "data-mini" }, fmtData(d, true)), el("strong", {}, `${t.formato || "Post"} | ${t.titulo}`),
      el("span", { class: `etiqueta st-${t.statusConteudo || "ideia"}` }, rotuloStatusConteudo(t.statusConteudo || "ideia")),
      t.qtdArtes ? el("span", { class: "progresso-mini" }, `🖼 ${t.qtdArtes}`) : null))
      : el("p", { class: "subtitulo" }, "Nenhum post planejado para essa semana. Planeje o mês do cliente primeiro."));
}

function secaoCriativos(tarefa) {
  const caixa = el("div", { class: "criativos-post so-conteudo" }, el("h3", { class: "form-secao" }, "Criativos"));
  if (!tarefa.id) { caixa.append(el("p", { class: "subtitulo" }, "Salve o post para anexar criativos.")); return caixa; }
  const lista = el("div", { class: "grade-criativos" }, el("p", { class: "subtitulo" }, "Carregando..."));
  const entrada = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
  const carregar = async () => {
    try {
      const artes = await listarArtesTarefa(tarefa.clienteId, tarefa.id);
      lista.replaceChildren(...(artes.length ? artes.map((a) => el("figure", { class: "criativo" },
        el("a", { href: a.dados, download: `${tarefa.titulo}.jpg`, title: "Baixar" }, el("img", { src: a.dados, alt: a.nome || "Criativo" })),
        el("figcaption", {}, a.origem === "gerada" ? "Imagem gerada" : "Criativo final"),
        el("button", { type: "button", class: "icone", "aria-label": "Remover criativo", onClick: async () => {
          if (await confirmar("Remover este criativo do post?")) { await excluirArte(tarefa.clienteId, tarefa.id, a.id); carregar(); }
        } }, "✕")))
        : [el("p", { class: "subtitulo" }, "Nenhum criativo anexado. Depois de finalizar no Canva, baixe e anexe aqui.")]));
    } catch (e) { lista.replaceChildren(el("p", { class: "erro" }, "Não consegui carregar: " + e.message)); }
  };
  entrada.addEventListener("change", async () => {
    for (const f of entrada.files) {
      try { await salvarArte(tarefa.clienteId, tarefa.id, await comprimirImagem(f), { origem: "final", nome: f.name }); }
      catch (e) { avisar(e.message, "erro"); }
    }
    entrada.value = "";
    avisar("Criativo anexado.");
    carregar();
  });
  carregar();
  caixa.append(lista, el("div", { class: "acoes-criativos" },
    el("label", { class: "botao-link secundario mini" }, "📎 Anexar criativo final", entrada),
    el("button", { type: "button", class: "secundario mini", onClick: () => { fecharModais(); abrirCriarArte(porId("tarefas", tarefa.id) || tarefa); } }, "✦ Criar arte (imagem + Canva)")));
  return caixa;
}

/** Grava uma tarefa (ou post) mantendo status de tarefa e etapa do post coerentes. */
export async function salvarTarefa(original, v) {
  if (v.tipo !== TIPO_CONTEUDO) {
    for (const k of ["formato", "rede", "dataPublicacao", "hora", "statusConteudo", "objetivo", "roteiro", "copy"]) delete v[k];
  } else {
    if (!v.prazo) v.prazo = v.dataPublicacao;
    v.statusConteudo ||= "ideia";
    v.status = statusDaEtapa(v.statusConteudo);
  }
  if (v.status === "concluido" && original.status !== "concluido") v.concluidoEm = hojeISO();
  if (v.status !== "concluido") v.concluidoEm = null;
  if (original.id) await atualizar("tarefas", original.id, v);
  else await criar("tarefas", v);
  if (original.id && (v.status === "concluido") !== (original.status === "concluido")) await quitarCobranca(original, v.status === "concluido");
  avisar(original.id ? "Salvo." : v.tipo === TIPO_CONTEUDO ? "Post criado e adicionado ao calendário." : "Tarefa criada.");
}

export async function alternarConcluida(t) {
  const concluir = t.status !== "concluido";
  const post = ehConteudo(t);
  await atualizar("tarefas", t.id, {
    status: concluir ? "concluido" : post ? "andamento" : "a_fazer",
    ...(post ? { statusConteudo: concluir ? "publicado" : "agendado" } : {}),
    concluidoEm: concluir ? hojeISO() : null,
    checklist: concluir && t.checklist?.length ? t.checklist.map((i) => ({ ...i, feito: true })) : (t.checklist || [])
  });
  await quitarCobranca(t, concluir);
  if (concluir) avisar(lancamentoDe(t) && pode("financeiro") ? "Concluída! Mensalidade marcada como paga ✓" : "Concluída! ✓", "ok", {
    desfazer: async () => {
      await quitarCobranca(t, false);
      await atualizar("tarefas", t.id, { status: t.status || "a_fazer", concluidoEm: t.concluidoEm || null, checklist: t.checklist || [], ...(post ? { statusConteudo: t.statusConteudo || "ideia" } : {}) });
    }
  });
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
        mostrarCliente ? seloCliente(t.clienteId, t) : t.marcaId ? el("span", { class: "etiqueta" }, porId("marcas", t.marcaId)?.nome || "") : null,
        ehConteudo(t) ? el("span", { class: "etiqueta formato" }, `${t.formato || "Post"}${t.dataPublicacao ? " · " + fmtData(t.dataPublicacao, true) : ""}`) : t.tipo ? el("span", { class: "etiqueta" }, t.tipo) : null,
        ehConteudo(t) && t.statusConteudo ? el("span", { class: `etiqueta st-${t.statusConteudo}` }, rotuloStatusConteudo(t.statusConteudo)) : null,
        t.status === "andamento" ? el("span", { class: "etiqueta andamento" }, "Em andamento") : null,
        total ? el("span", { class: "progresso-mini" }, `☑ ${feitos}/${total}`) : null,
        ehConteudo(t) && t.qtdArtes ? el("span", { class: "progresso-mini", title: "Criativos anexados" }, `🖼 ${t.qtdArtes}`) : null,
        ehConteudo(t) && t.copy ? el("span", { class: "progresso-mini", title: "Copy salva" }, "✎ copy") : null,
        linkExterno(t.linkCanva, "Canva"), linkExterno(t.linkDrive, "Drive"),
        t.atalho ? el("a", { class: "link-externo", href: t.atalho, onClick: (e) => e.stopPropagation() }, t.rotina === "planejamento" ? "Planejar →" : t.rotina === "cobranca" ? "Financeiro →" : "Ver posts →") : null,
        t.responsavel ? avatar(t.responsavel, { titulo: `Responsável: ${t.responsavel}` }) : null,
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
