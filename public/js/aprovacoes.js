// Aprovação do cliente por link: o cliente abre aprovar.html?t=<token> (sem login), vê os posts do mês
// e aprova ou pede ajuste em cada um. As respostas voltam para os posts no app.
// espacos/hyper/aprovacoes/{token}            fotografia dos posts (o link vale 60 dias)
//                       /{token}/artes/{post}   imagens de cada post, na ordem do post: {post}, {post}__1, {post}__2… (uma por documento, limite de 1 MB)
//                       /{token}/respostas/{post} { status: "aprovado" | "ajuste", comentario, nome, em, copyNova? }
// copyNova: a legenda editada pelo próprio cliente na revisão. Não troca a copy sozinha: toda resposta fica no post
// como `respostaCliente` (pendente) até a equipe ver no Hoje → "Respostas dos clientes" e decidir (usar a legenda
// do cliente ou manter a nossa). As etapas mudam na hora (aprovado → Aprovado; revisão → Em produção).
import { el, avisar, abrirModal, fmtData } from "./ui.js";
import { dados, porId, salvarComId, salvarSub, listarSub, ouvirSub, excluirSub, atualizarSub, espacoInfo, identidade, atualizar, registrarAtividade } from "./db.js";
import { eu, pode } from "./permissoes.js";
import { postsDoMes, dataPost, nomeMes } from "./exportacao.js";
import { artesNaOrdem, comprimirImagem } from "./arquivos.js";
import { statusDaEtapa, rotuloObjetivo } from "./constantes.js";

const DIAS_VALIDADE = 60;
const LINK_BASE = location.origin + location.pathname.replace(/[^/]*$/, "");
export const linkAprovacao = (token) => `${LINK_BASE}aprovar.html?t=${token}`;
const novoToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Link ainda válido para o mesmo cliente, mês e marca (para reaproveitar em vez de criar outro). */
const existente = (clienteId, mes, marcaId) => (dados.aprovacoes || []).find((a) =>
  a.clienteId === clienteId && a.mes === mes && (a.marcaId || "") === (marcaId || "") && a.expiraEm > Date.now());

/**
 * Cria (ou atualiza) o link de aprovação do mês e mostra para copiar ou mandar no WhatsApp.
 * Com `lista` e `rotulo`, o link é de um conjunto de posts (ex.: a semana do "Produzir semana"); `mes` vira a chave do link.
 */
export async function gerarLinkAprovacao(clienteId, mes, marcaId, { lista = null, rotulo = "" } = {}) {
  const posts = (lista || postsDoMes(clienteId, mes, marcaId === undefined ? undefined : marcaId))
    .filter((t) => t.statusConteudo !== "publicado");
  if (!posts.length) { avisar("Nenhum post a aprovar neste mês.", "erro"); return; }
  const marca = identidade(clienteId, marcaId || undefined);
  const atual = existente(clienteId, mes, marcaId);
  const token = atual?.id || novoToken();
  const fechar = abrirModal("Link de aprovação", el("p", { class: "subtitulo" }, "Preparando o link…"));
  try {
    // Todas as imagens de cada post, na ordem do post (carrossel), menores que as originais: o link abre rápido no celular
    const artes = await artesNaOrdem(posts);
    for (const id of Object.keys(artes)) artes[id] = await Promise.all(artes[id].map((d) => comprimirImagem(d, { maxLado: 1080, qualidade: 0.75 }).catch(() => d)));
    await salvarComId("aprovacoes", token, {
      clienteId, marcaId: marcaId || "", mes, rotulo: rotulo || "", nome: marca.nome || "", cor: marca.cor || marca.paleta?.[0] || "",
      posts: posts.map((t) => ({
        id: t.id, titulo: t.titulo || "", formato: t.formato || "", rede: t.rede || "", data: dataPost(t), hora: t.hora || "",
        tema: (t.statusConteudo || "ideia") === "ideia", // ainda é ideia: o cliente aprova o tema antes da produção
        objetivo: rotuloObjetivo(t.objetivo), roteiro: t.roteiro || "", copy: t.copy || "", linkCanva: t.linkCanva || "",
        temArte: !!artes[t.id]?.length, qtdArtes: artes[t.id]?.length || 0 // a página só busca as imagens de quem tem
      })),
      postIds: posts.map((t) => t.id),
      emailUrl: espacoInfo.emailUrl || "",
      criadoPor: eu.nome || eu.email, atualizadoEm: Date.now(), criadoEm: atual?.criadoEm || Date.now(),
      expiraEm: Date.now() + DIAS_VALIDADE * 86400000
    });
    // Uma imagem por documento (limite de 1 MB por documento): a 1ª com o id do post, as outras <post>__<n>
    for (const [tarefaId, lista] of Object.entries(artes)) {
      for (const [i, dadosArte] of lista.entries()) await salvarSub(["aprovacoes", token, "artes"], { dados: dadosArte }, i ? `${tarefaId}__${i}` : tarefaId);
    }
    // Link refeito: as respostas antigas saem (o cliente responde de novo sobre a versão atual)
    if (atual) for (const r of await listarSub(["aprovacoes", token, "respostas"]).catch(() => [])) {
      await excluirSub(["aprovacoes", token, "respostas"], r.id).catch(() => {});
      delete dados.respostasCliente[r.id];
    }
    // Prontos vão para "Em aprovação"; ideias continuam ideias até o cliente aprovar o tema
    for (const t of posts) if (t.statusConteudo === "producao" || (t.ajusteCliente && (t.statusConteudo || "ideia") !== "ideia")) {
      await atualizar("tarefas", t.id, { statusConteudo: "aprovacao", status: statusDaEtapa("aprovacao"), ajusteCliente: "", aprovacaoDesde: Date.now() });
    }
    fechar();
    mostrarLink(token, marca.nome, mes, posts.length, rotulo, posts.filter((t) => (t.statusConteudo || "ideia") === "ideia").length);
  } catch (e) { fechar(); avisar("Não consegui criar o link: " + e.message, "erro"); }
}

function mostrarLink(token, nome, mes, n, rotulo = "", temas = 0) {
  const link = linkAprovacao(token);
  const periodo = rotulo || nomeMes(mes);
  const texto = `Oi! Segue ${rotulo ? `o conteúdo da ${rotulo}` : `o planejamento de ${nomeMes(mes)}`} de ${nome} para você aprovar. É só abrir, ver cada post e clicar em Aprovar ou Pedir revisão (dá para editar a legenda aí mesmo): ${link}`;
  abrirModal("Link de aprovação", el("div", {},
    el("p", {}, `${n} post(s) de ${periodo}. O link vale ${DIAS_VALIDADE} dias e não pede login. ${temas ? `${temas === n ? "Todos ainda são ideias: o cliente aprova o tema" : `${temas} ainda são ideias: o cliente aprova o tema; os outros foram para "Em aprovação"`}. Tema aprovado vai para "Em produção".` : "Os posts foram para a etapa \"Em aprovação\"."}`),
    el("input", { type: "text", value: link, readonly: true, onFocus: (e) => e.target.select() }),
    el("div", { class: "acoes" },
      el("button", { class: "destaque", onClick: async () => { await navigator.clipboard.writeText(texto).catch(() => {}); avisar("Mensagem com o link copiada."); } }, "Copiar mensagem"),
      el("a", { class: "botao-link secundario", href: `https://wa.me/?text=${encodeURIComponent(texto)}`, target: "_blank", rel: "noopener" }, "Mandar no WhatsApp"),
      el("a", { class: "botao-link secundario", href: link, target: "_blank", rel: "noopener" }, "Ver como o cliente vê")),
    el("p", { class: "subtitulo" }, "Se você mudar os posts, gere o link de novo: é o mesmo endereço, atualizado.")));
}

/* ---------------- Respostas voltando para o app ---------------- */

/** Resposta do cliente por post: dados.respostasCliente[postId] = { status, comentario, nome, em, token } */
dados.respostasCliente = {};
const ouvindo = new Map();
let ultimoAviso = null;

/** Liga/desliga os ouvintes das respostas conforme os links válidos (chamado quando os dados mudam). */
export function acompanharRespostas(notificar) {
  if (!pode("conteudo")) return;
  const validos = new Set((dados.aprovacoes || []).filter((a) => a.expiraEm > Date.now()).map((a) => a.id));
  for (const [token, parar] of ouvindo) if (!validos.has(token)) { parar(); ouvindo.delete(token); }
  for (const token of validos) {
    if (ouvindo.has(token)) continue;
    ouvindo.set(token, ouvirSub(["aprovacoes", token, "respostas"], (lista) => {
      for (const r of lista) {
        const atual = dados.respostasCliente[r.id];
        if (!atual || (r.em || 0) >= (atual.em || 0)) dados.respostasCliente[r.id] = { ...r, token };
        aplicarResposta(token, r);
      }
      notificar();
    }));
  }
}

/** Aprovado: o post vai para "Aprovado". Ajuste: volta para "Em produção" com o comentário no histórico. */
async function aplicarResposta(token, r) {
  if (r.aplicadaEm) return;
  const t = porId("tarefas", r.id);
  if (!t) return;
  try {
    await atualizarSub(["aprovacoes", token, "respostas"], r.id, { aplicadaEm: Date.now() });
    const quem = r.nome ? `${r.nome} (cliente)` : "O cliente";
    // A resposta fica no post para a equipe ver e decidir (a legenda do cliente não substitui a nossa sozinha)
    const editou = r.copyNova && r.copyNova !== t.copy;
    const copy = { respostaCliente: { status: r.status, comentario: r.comentario || "", copyNova: editou ? r.copyNova : "", nome: r.nome || "", em: r.em || Date.now() } };
    if (editou) registrarAtividade(t.id, { tipo: "comentario", texto: `${quem} sugeriu outra legenda pelo link:\n${r.copyNova}` });
    if (r.status === "aprovado" && (t.statusConteudo || "ideia") === "ideia") {
      // Era o tema (validação do conceito): segue para a produção
      await atualizar("tarefas", t.id, { statusConteudo: "producao", status: statusDaEtapa("producao"), ajusteCliente: "", ...copy });
      registrarAtividade(t.id, { texto: `— ${quem} aprovou o tema pelo link${r.comentario ? `: "${r.comentario}"` : ""}` });
    } else if (r.status === "aprovado") {
      if (["producao", "aprovacao"].includes(t.statusConteudo)) await atualizar("tarefas", t.id, { statusConteudo: "aprovado", status: statusDaEtapa("aprovado"), ajusteCliente: "", ...copy });
      else await atualizar("tarefas", t.id, copy);
      registrarAtividade(t.id, { texto: `— ${quem} aprovou pelo link${editou ? " com uma legenda editada por ele (para a equipe ver)" : ""}${r.comentario ? `: "${r.comentario}"` : ""}` });
    } else if ((t.statusConteudo || "ideia") === "ideia") {
      await atualizar("tarefas", t.id, { ajusteCliente: r.comentario || "ajuste pedido", ...copy });
      registrarAtividade(t.id, { tipo: "comentario", texto: `${quem} pediu ajuste no tema: ${r.comentario || "(sem comentário)"}` });
    } else {
      await atualizar("tarefas", t.id, { statusConteudo: "producao", status: statusDaEtapa("producao"), ajusteCliente: r.comentario || "ajuste pedido", ...copy });
      registrarAtividade(t.id, { tipo: "comentario", texto: `${quem} pediu revisão: ${r.comentario || "(sem comentário)"}${editou ? " (e sugeriu outra legenda)" : ""}` });
    }
    if (ultimoAviso !== token) { ultimoAviso = token; avisar(`${quem} respondeu a aprovação de ${porId("clientes", t.clienteId)?.nome || "um cliente"}.`); }
  } catch (e) { console.warn("Resposta do cliente:", e.message); }
}

/** Selo para mostrar no post: aprovado ou ajuste pedido pelo cliente. */
export function seloResposta(t) {
  // Resposta que a equipe ainda não viu: destaque (abre o post para decidir)
  if (t.respostaCliente) return el("span", { class: "etiqueta resposta-pendente", title: t.respostaCliente.comentario || "Resposta do cliente para ver" },
    t.respostaCliente.status === "aprovado" ? (t.respostaCliente.copyNova ? "✉ Cliente sugeriu legenda" : "✉ Cliente aprovou: ver") : "✉ Cliente pediu revisão");
  const r = dados.respostasCliente?.[t.id];
  if (!r) return null;
  return r.status === "aprovado"
    ? el("span", { class: "etiqueta ok", title: `Aprovado por ${r.nome || "cliente"} em ${fmtData(new Date(r.em).toISOString().slice(0, 10))}` }, r.copyNova ? "✓ Cliente aprovou (legenda editada)" : "✓ Cliente aprovou")
    : el("span", { class: "etiqueta alerta", title: r.comentario || "" }, "✎ Cliente pediu revisão");
}

/* ---------------- Respostas dos clientes para a equipe ver ---------------- */

/** Posts com resposta do cliente que a equipe ainda não viu (aprovação, revisão ou legenda sugerida). */
export const respostasPendentes = () => dados.tarefas.filter((t) => t.respostaCliente && t.tipo === "Conteúdo");

/** A equipe decide: usa a legenda do cliente (se houver) ou mantém a nossa, e a resposta sai da fila. */
export async function resolverResposta(t, { usarLegenda = false } = {}) {
  const r = t.respostaCliente || {};
  const mudancas = { respostaCliente: null };
  if (usarLegenda && r.copyNova) mudancas.copy = r.copyNova;
  await atualizar("tarefas", t.id, mudancas);
  if (r.copyNova) registrarAtividade(t.id, { texto: usarLegenda ? `— usou a legenda do cliente. Legenda anterior:\n${t.copy || "(vazia)"}` : "— manteve a legenda da equipe (a sugerida pelo cliente ficou no histórico)" });
  return mudancas;
}

const rotuloResposta = (r) => r.status === "aprovado" ? (r.copyNova ? "✓ Aprovou com outra legenda" : "✓ Aprovou") : "✎ Pediu revisão";

/** Um bloco por resposta: o pedido, a legenda atual ao lado da sugerida e os botões para decidir. */
export function blocoResposta(t, aoResolver = () => {}) {
  const r = t.respostaCliente;
  if (!r) return null;
  const decidir = async (botao, usarLegenda) => {
    botao.disabled = true;
    try { await resolverResposta(t, { usarLegenda }); aoResolver({ usarLegenda, copy: usarLegenda ? r.copyNova : null }); }
    catch (e) { botao.disabled = false; avisar("Não consegui salvar: " + e.message, "erro"); }
  };
  return el("div", { class: `resposta-cliente ${r.status}` },
    el("div", { class: "resposta-topo" },
      el("span", { class: `etiqueta ${r.status === "aprovado" ? "ok" : "alerta"}` }, rotuloResposta(r)),
      el("span", { class: "subtitulo" }, `${r.nome || "Cliente"} · ${fmtData(new Date(r.em).toISOString().slice(0, 10))}`)),
    r.comentario ? el("p", {}, el("strong", {}, "Pedido: "), r.comentario) : null,
    r.copyNova ? el("div", { class: "comparar-legendas" },
      el("div", {}, el("span", { class: "subtitulo" }, "Legenda atual (nossa)"), el("p", {}, t.copy || "(vazia)")),
      el("div", {}, el("span", { class: "subtitulo" }, "Legenda do cliente"), el("p", {}, r.copyNova))) : null,
    el("div", { class: "acoes" }, r.copyNova
      ? [el("button", { class: "secundario mini", onClick: (e) => decidir(e.currentTarget, false) }, "Manter a nossa"),
         el("button", { class: "confirmar mini", onClick: (e) => decidir(e.currentTarget, true) }, "Usar a do cliente")]
      : el("button", { class: "secundario mini", onClick: (e) => decidir(e.currentTarget, false) }, "Ok, visto")));
}

/** Lista das respostas pendentes agrupadas por cliente (usada na janela de Pendências do Hoje). */
export function listaRespostas(abrirPost, aoMudar = () => {}) {
  const corpo = el("div", { class: "respostas-clientes" });
  const montar = () => {
    const lista = respostasPendentes().sort((a, b) => (a.dataPublicacao || "").localeCompare(b.dataPublicacao || ""));
    if (!lista.length) { corpo.replaceChildren(el("p", { class: "subtitulo" }, "Nenhuma resposta de cliente para ver.")); return; }
    const porCliente = {};
    for (const t of lista) (porCliente[t.clienteId] ??= []).push(t);
    corpo.replaceChildren(...Object.entries(porCliente).map(([cid, posts]) => el("section", { class: "grupo-respostas" },
      el("h4", {}, porId("clientes", cid)?.nome || "Cliente"),
      ...posts.map((t) => el("article", { class: "item-resposta" },
        el("div", { class: "com-acao" },
          el("strong", {}, `${t.dataPublicacao ? fmtData(t.dataPublicacao, true) + " · " : ""}${t.titulo}`),
          abrirPost ? el("button", { class: "link", onClick: () => abrirPost(t) }, "Abrir o post") : null),
        blocoResposta(t, () => setTimeout(() => { montar(); aoMudar(); }, 300)))))));
  };
  montar();
  return corpo;
}
