// Portal do cliente (papel "cliente"): o que a pessoa do cliente vê no Hyper Studio.
// Início (posts para aprovar e próximos), Calendário do mês, Marca (identidade e redes, só leitura) e Resultados.
// Ela aprova ou pede ajuste nos posts em aprovação e pode sugerir posts (entram como ideia para a equipe).
// As regras do Firestore garantem que ela só lê e muda o que é dela ("Portal do cliente" em firestore.rules).
import { el, avisar, abrirModal, fecharModais, formulario, fmtData, fmtDiaSemana, hojeISO, addDias, vazio, linkExterno, amostraCor } from "../ui.js";
import { dados, porId, marcasDo, atualizar, criar, registrarAtividade, identidade } from "../db.js";
import { eu, marcasRestritas } from "../permissoes.js";
import { TIPO_CONTEUDO, FORMATOS, REDES, CAMPOS_REDES, rotuloStatusConteudo } from "../constantes.js";
import { dataPost, nomeMes } from "../exportacao.js";
import { listarArtesTarefa } from "../arquivos.js";
import { promptCopy } from "../prompts.js";
import { cabecalho, corCliente } from "./componentes.js";
import { abaResultados } from "./resultados.js";
import { GRUPO } from "./marca.js";

/** Contas que a pessoa vê: as marcas liberadas, ou cada cliente (e as marcas dele, se for grupo). */
export function contasDoPortal() {
  if (marcasRestritas()) return (eu.marcas || []).map((id) => porId("marcas", id)).filter(Boolean)
    .map((m) => ({ chave: m.id, clienteId: m.clienteId, marcaId: m.id, nome: m.nome, obj: m }));
  return (eu.clientes || []).map((id) => porId("clientes", id)).filter(Boolean).flatMap((c) => {
    const marcas = marcasDo(c.id);
    if (!marcas.length) return [{ chave: c.id, clienteId: c.id, marcaId: "", nome: c.nome, obj: c }];
    return [...marcas.map((m) => ({ chave: m.id, clienteId: c.id, marcaId: m.id, nome: m.nome, obj: m })),
      { chave: `${c.id}:grupo`, clienteId: c.id, marcaId: "", nome: `${c.nome} (institucional)`, obj: c }];
  });
}
const contaDoPost = (t) => contasDoPortal().find((k) => k.clienteId === t.clienteId && k.marcaId === (t.marcaId || ""));
const posts = () => dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && contaDoPost(t));
const porData = (a, b) => (dataPost(a) || "9").localeCompare(dataPost(b) || "9");

function seloConta(t) {
  const k = contaDoPost(t);
  if (!k || contasDoPortal().length < 2) return null;
  return el("span", { class: "etiqueta marca-etiqueta", style: { "--selo": corCliente(k.obj) } }, k.nome);
}

/* ---------------- Aprovar ---------------- */

async function aprovar(t) {
  await atualizar("tarefas", t.id, { statusConteudo: "aprovado", status: "andamento", aprovacaoCliente: { decisao: "aprovado", nome: eu.nome || eu.email, em: Date.now() } });
  registrarAtividade(t.id, { texto: `${eu.nome || eu.email} aprovou o post pelo Hyper Studio.` });
  avisar("Post aprovado. Obrigado!");
}

function pedirAjuste(t) {
  return formulario(`Pedir ajuste · ${t.titulo || "post"}`, [
    { nome: "comentario", rotulo: "O que precisa mudar?", tipo: "textarea", linhas: 5, obrigatorio: true, dica: "Ex.: trocar a foto, ajustar o preço na legenda, mudar a data…" }
  ], {}, {
    rotuloSalvar: "Enviar ajuste",
    aoSalvar: async ({ comentario }) => {
      await atualizar("tarefas", t.id, { statusConteudo: "producao", status: "andamento", aprovacaoCliente: { decisao: "ajuste", comentario, nome: eu.nome || eu.email, em: Date.now() } });
      await registrarAtividade(t.id, { tipo: "comentario", texto: `Ajuste pedido pelo cliente: ${comentario}` });
      avisar("Pedido de ajuste enviado para a Hyper.");
    }
  });
}

function botoesAprovacao(t, depois = () => {}) {
  if (t.statusConteudo !== "aprovacao") return null;
  return el("div", { class: "acoes" },
    el("button", { class: "confirmar", onClick: async (e) => {
      e.currentTarget.disabled = true;
      try { await aprovar(t); depois(); } catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
    } }, "✓ Aprovar"),
    el("button", { class: "negar", onClick: () => { depois(); pedirAjuste(t); } }, "Pedir ajuste"));
}

/** Criativos do post (carregam depois). */
function galeria(t) {
  const caixa = el("div", { class: "portal-artes" });
  if (!t.qtdArtes) return null;
  listarArtesTarefa(t.clienteId, t.id)
    .then((artes) => caixa.replaceChildren(...artes.map((a) => el("img", { src: a.dados, alt: a.nome || "Criativo do post", loading: "lazy" }))))
    .catch(() => caixa.replaceChildren(el("p", { class: "subtitulo" }, "Não consegui carregar as imagens.")));
  return caixa;
}

function cartaoPost(t, { completo = false } = {}) {
  return el("article", { class: `portal-post ${t.statusConteudo === "aprovacao" ? "para-aprovar" : ""}`, style: { "--selo": corCliente(contaDoPost(t)?.obj || {}) } },
    el("div", { class: "portal-post-topo" },
      el("span", { class: "data-mini" }, dataPost(t) ? `${fmtDiaSemana(dataPost(t))}, ${fmtData(dataPost(t), true)}${t.hora ? ` · ${t.hora}` : ""}` : "sem data"),
      seloConta(t),
      el("span", { class: "etiqueta" }, [t.formato, t.rede].filter(Boolean).join(" · ") || "Post"),
      el("span", { class: `etiqueta st-${t.statusConteudo || "ideia"}` }, rotuloStatusConteudo(t.statusConteudo || "ideia"))),
    el("h3", {}, t.titulo || "(sem tema)"),
    completo ? galeria(t) : null,
    completo && t.copy ? el("div", { class: "portal-copy" }, t.copy) : null,
    completo ? botoesAprovacao(t) : null,
    !completo ? el("button", { class: "link", onClick: () => abrirPost(t) }, t.statusConteudo === "aprovacao" ? "Ver e aprovar →" : "Ver post →") : null);
}

function abrirPost(t) {
  abrirModal(t.titulo || "Post", el("div", {},
    el("p", { class: "subtitulo" }, [dataPost(t) ? fmtData(dataPost(t)) : "", t.formato, t.rede, rotuloStatusConteudo(t.statusConteudo || "ideia")].filter(Boolean).join(" · ")),
    galeria(t),
    t.copy ? el("div", { class: "portal-copy" }, t.copy) : el("p", { class: "subtitulo" }, "A legenda ainda não foi escrita."),
    t.aprovacaoCliente?.decisao === "ajuste" ? el("p", { class: "faixa-aviso" }, `Ajuste pedido: ${t.aprovacaoCliente.comentario}`) : null,
    botoesAprovacao(t, fecharModais)), { largo: true });
}

/* ---------------- Sugerir um post ---------------- */

/** Grava a sugestão do cliente: post como "ideia" para a equipe (só os campos que as regras aceitam). */
export function criarSugestao(k, v) {
  return criar("tarefas", {
    tipo: TIPO_CONTEUDO, clienteId: k.clienteId, marcaId: k.marcaId, titulo: v.titulo, dataPublicacao: v.dataPublicacao || "", prazo: v.dataPublicacao || "",
    formato: v.formato || "", rede: v.rede || "", copy: v.copy || "", notas: v.notas || "",
    statusConteudo: "ideia", status: "a_fazer", responsavel: "", sugeridoPeloCliente: eu.nome || eu.email
  });
}

export function sugerirPost() {
  const contas = contasDoPortal();
  if (!contas.length) return avisar("Nenhuma marca liberada para você ainda.", "erro");
  const ultimoForm = () => [...document.querySelectorAll(".modal form")].pop();
  const contaDe = (chave) => contas.find((k) => k.chave === chave) || contas[0];
  return formulario("Sugerir um post", [
    contas.length > 1 ? { nome: "conta", rotulo: "Marca", tipo: "select", opcoes: contas.map((k) => [k.chave, k.nome]), obrigatorio: true } : null,
    { nome: "titulo", rotulo: "Tema / ideia", obrigatorio: true, dica: "Ex.: promoção de Natal, bastidores da equipe" },
    { nome: "dataPublicacao", rotulo: "Quando publicar (se tiver data)", tipo: "date", largura: "metade" },
    { nome: "formato", rotulo: "Formato", tipo: "select", opcoes: FORMATOS, padrao: "Feed estático", largura: "metade" },
    { nome: "rede", rotulo: "Rede", tipo: "select", opcoes: REDES, padrao: "Instagram", largura: "metade" },
    { nome: "copy", rotulo: "Legenda (opcional)", tipo: "textarea", linhas: 5, dica: "Escreva aqui ou use o botão para o Claude escrever no tom de voz da marca." },
    { nome: "notas", rotulo: "Observações para a Hyper", tipo: "textarea", linhas: 3 }
  ].filter(Boolean), { conta: contas[0].chave }, {
    rotuloSalvar: "Enviar sugestão",
    extras: [el("button", { type: "button", class: "secundario mini", onClick: async () => {
      const v = ultimoForm()?.lerValores?.() || {};
      const k = contaDe(v.conta);
      try { await navigator.clipboard.writeText(promptCopy({ ...v, clienteId: k.clienteId, marcaId: k.marcaId })); avisar("Pedido copiado! Cole no Claude para ele escrever a legenda no tom da marca."); }
      catch { avisar("Não consegui copiar o pedido.", "erro"); }
      window.open("https://claude.ai/new", "_blank", "noopener");
    } }, "✨ Legenda com o Claude")],
    aoSalvar: async (v) => {
      await criarSugestao(contaDe(v.conta), v);
      avisar("Sugestão enviada para a Hyper.");
    }
  });
}

/* ---------------- Telas ---------------- */

export const inicio = {
  render() {
    const todos = posts();
    const paraAprovar = todos.filter((t) => t.statusConteudo === "aprovacao").sort(porData);
    const hoje = hojeISO();
    const proximos = todos.filter((t) => t.statusConteudo !== "aprovacao" && t.statusConteudo !== "ideia" && dataPost(t) >= hoje && dataPost(t) <= addDias(hoje, 21)).sort(porData);
    const ajustes = todos.filter((t) => t.aprovacaoCliente?.decisao === "ajuste" && t.statusConteudo === "producao");
    const nome = (eu.nome || "").split(" ")[0];
    return el("div", { class: "tela tela-portal" },
      cabecalho(`Olá${nome ? `, ${nome}` : ""}!`, contasDoPortal().map((k) => k.nome).join(" · ") || "Bem-vindo ao Hyper Studio",
        el("button", { class: "secundario", onClick: sugerirPost }, "+ Sugerir um post"),
        el("a", { class: "botao-link destaque", href: "#/studio" }, "✦ Abrir o Studio")),
      el("h2", {}, `Para aprovar (${paraAprovar.length})`),
      paraAprovar.length ? el("div", { class: "portal-lista" }, paraAprovar.map((t) => cartaoPost(t, { completo: true })))
        : vazio("Nada esperando a sua aprovação. Quando a Hyper mandar posts, eles aparecem aqui."),
      ajustes.length ? [el("h2", {}, `Ajustes que você pediu (${ajustes.length})`), el("div", { class: "portal-lista compacta" }, ajustes.map((t) => cartaoPost(t)))] : null,
      el("h2", {}, "Próximas publicações"),
      proximos.length ? el("div", { class: "portal-lista compacta" }, proximos.map((t) => cartaoPost(t)))
        : el("p", { class: "subtitulo" }, "Nenhum post marcado para as próximas três semanas."));
  }
};

export const calendario = {
  render({ estado, renderizar }) {
    estado.mes ??= hojeISO().slice(0, 7);
    const [a, m] = estado.mes.split("-").map(Number);
    const mudar = (n) => { const d = new Date(a, m - 1 + n, 1); estado.mes = hojeISO(d).slice(0, 7); renderizar(); };
    const doMes = posts().filter((t) => dataPost(t).startsWith(estado.mes)).sort(porData);
    const dias = [...new Set(doMes.map(dataPost))];
    return el("div", { class: "tela tela-portal" },
      cabecalho("Calendário", "Os posts do mês, com a etapa de cada um", el("button", { class: "destaque", onClick: sugerirPost }, "+ Sugerir um post")),
      el("div", { class: "navegador-mes" },
        el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => mudar(-1) }, "‹"),
        el("strong", {}, nomeMes(estado.mes)),
        el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => mudar(1) }, "›")),
      dias.length ? dias.map((d) => el("section", { class: "portal-dia" },
        el("h3", {}, `${fmtDiaSemana(d)}, ${fmtData(d, true)}`),
        el("div", { class: "portal-lista compacta" }, doMes.filter((t) => dataPost(t) === d).map((t) => cartaoPost(t)))))
        : vazio("Nenhum post neste mês."));
  }
};

function escolherConta(estado, renderizar) {
  const contas = contasDoPortal();
  if (!contas.find((k) => k.chave === estado.conta)) estado.conta = contas[0]?.chave;
  const atual = contas.find((k) => k.chave === estado.conta);
  const seletor = contas.length > 1 ? el("div", { class: "marcas-seletor" }, contas.map((k) =>
    el("button", { class: `legenda-item ${k.chave === estado.conta ? "ativo" : ""}`, style: { "--selo": corCliente(k.obj) }, onClick: () => { estado.conta = k.chave; renderizar(); } },
      el("span", { class: "bolinha" }), k.nome))) : null;
  return { atual, seletor };
}

export const marca = {
  render({ estado, renderizar }) {
    const { atual, seletor } = escolherConta(estado, renderizar);
    if (!atual) return el("div", { class: "tela" }, vazio("Nenhuma marca liberada para você ainda."));
    const id = identidade(atual.clienteId, atual.marcaId);
    const texto = (rotulo, valor) => valor ? el("section", { class: "bloco portal-identidade" }, el("h3", {}, rotulo), el("p", { class: "portal-texto" }, valor)) : null;
    const redes = CAMPOS_REDES.filter(([k]) => atual.obj[k] && k !== "facebookPageId");
    return el("div", { class: "tela tela-portal" },
      cabecalho(atual.nome, "Identidade da marca: é o que a Hyper (e o Claude) seguem em cada post"),
      seletor,
      el("section", { class: "bloco portal-identidade" },
        id.logo ? el("img", { class: "logo-ficha", src: id.logo, alt: `Logo ${atual.nome}` }) : null,
        (id.paleta || []).filter(Boolean).length ? el("div", { class: "paleta-leitura" }, id.paleta.filter(Boolean).map((c) => amostraCor(c))) : null,
        id.fontes ? el("p", {}, el("strong", {}, "Fontes: "), id.fontes) : null,
        redes.length ? el("div", { class: "portal-redes" }, redes.map(([k, rotulo]) => {
          const v = atual.obj[k];
          const url = /^https?:/i.test(v) ? v : k === "instagram" ? `https://instagram.com/${String(v).replace(/^@/, "")}` : "";
          return el("span", { class: "etiqueta" }, `${rotulo}: `, url ? linkExterno(url, v) : v);
        })) : null),
      texto("Sobre a marca", id.descricao),
      texto("Tom de voz", id.tomDeVoz),
      texto("Público-alvo", id.publico),
      texto("Persona", id.persona),
      texto("Diretrizes de conteúdo", id.diretrizes),
      texto("Estilo de imagem", id.estiloVisual),
      el("p", { class: "nota" }, "Quer mudar algo da identidade? Fale com a Hyper: ela atualiza aqui e os próximos posts já seguem."));
  }
};

export const resultados = {
  render({ estado, renderizar }) {
    const { atual, seletor } = escolherConta(estado, renderizar);
    if (!atual) return el("div", { class: "tela" }, vazio("Nenhuma marca liberada para você ainda."));
    const cliente = porId("clientes", atual.clienteId) || { id: atual.clienteId, nome: atual.nome };
    estado.res ??= {};
    estado.res[atual.chave] ??= {};
    const sub = estado.res[atual.chave];
    sub.marcaSel = atual.marcaId || (marcasDo(atual.clienteId).length ? GRUPO : "");
    return el("div", { class: "tela tela-portal" },
      cabecalho("Resultados", "Números do Instagram e do Facebook"),
      seletor,
      el("section", { class: "bloco" }, abaResultados(cliente, sub, renderizar, { leitura: true })));
  }
};
