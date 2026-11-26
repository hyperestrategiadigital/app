// Aprovação do cliente por link: o cliente abre aprovar.html?t=<token> (sem login), vê os posts do mês
// e aprova ou pede ajuste em cada um. As respostas voltam para os posts no app.
// espacos/hyper/aprovacoes/{token}            fotografia dos posts (o link vale 60 dias)
//                       /{token}/artes/{post}   imagem de cada post (uma por documento, por causa do limite de 1 MB)
//                       /{token}/respostas/{post} { status: "aprovado" | "ajuste", comentario, nome, em, copyNova? }
// copyNova: a legenda editada pelo próprio cliente na revisão (vira a copy do post; a anterior fica no histórico).
import { el, avisar, abrirModal, fmtData } from "./ui.js";
import { dados, porId, salvarComId, salvarSub, listarSub, ouvirSub, excluirSub, atualizarSub, espacoInfo, identidade, atualizar, registrarAtividade } from "./db.js";
import { eu, pode } from "./permissoes.js";
import { postsDoMes, dataPost, nomeMes } from "./exportacao.js";
import { artePrincipal, comprimirImagem } from "./arquivos.js";
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
    // Uma imagem por post (o criativo final tem preferência), menor que a original: o link abre bem mais rápido no celular
    const artes = await artePrincipal(posts);
    for (const id of Object.keys(artes)) artes[id] = await comprimirImagem(artes[id], { maxLado: 1080, qualidade: 0.75 }).catch(() => artes[id]);
    await salvarComId("aprovacoes", token, {
      clienteId, marcaId: marcaId || "", mes, rotulo: rotulo || "", nome: marca.nome || "", cor: marca.cor || marca.paleta?.[0] || "",
      posts: posts.map((t) => ({
        id: t.id, titulo: t.titulo || "", formato: t.formato || "", rede: t.rede || "", data: dataPost(t), hora: t.hora || "",
        tema: (t.statusConteudo || "ideia") === "ideia", // ainda é ideia: o cliente aprova o tema antes da produção
        objetivo: rotuloObjetivo(t.objetivo), roteiro: t.roteiro || "", copy: t.copy || "", linkCanva: t.linkCanva || "",
        temArte: !!artes[t.id] // a página só busca a imagem de quem tem
      })),
      postIds: posts.map((t) => t.id),
      emailUrl: espacoInfo.emailUrl || "",
      criadoPor: eu.nome || eu.email, atualizadoEm: Date.now(), criadoEm: atual?.criadoEm || Date.now(),
      expiraEm: Date.now() + DIAS_VALIDADE * 86400000
    });
    for (const [tarefaId, dadosArte] of Object.entries(artes)) {
      await salvarSub(["aprovacoes", token, "artes"], { dados: dadosArte }, tarefaId);
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
    // Legenda editada pelo cliente: vira a copy do post; a anterior fica no histórico
    const copy = r.copyNova && r.copyNova !== t.copy ? { copy: r.copyNova } : {};
    if (copy.copy) registrarAtividade(t.id, { tipo: "comentario", texto: `${quem} editou a legenda pelo link. Legenda anterior:\n${t.copy || "(vazia)"}` });
    if (r.status === "aprovado" && (t.statusConteudo || "ideia") === "ideia") {
      // Era o tema (validação do conceito): segue para a produção
      await atualizar("tarefas", t.id, { statusConteudo: "producao", status: statusDaEtapa("producao"), ajusteCliente: "" });
      registrarAtividade(t.id, { texto: `— ${quem} aprovou o tema pelo link${r.comentario ? `: "${r.comentario}"` : ""}` });
    } else if (r.status === "aprovado") {
      if (["producao", "aprovacao"].includes(t.statusConteudo)) await atualizar("tarefas", t.id, { statusConteudo: "aprovado", status: statusDaEtapa("aprovado"), ajusteCliente: "", ...copy });
      else if (copy.copy) await atualizar("tarefas", t.id, copy);
      registrarAtividade(t.id, { texto: `— ${quem} aprovou pelo link${copy.copy ? " com a legenda editada por ele" : ""}${r.comentario ? `: "${r.comentario}"` : ""}` });
    } else if ((t.statusConteudo || "ideia") === "ideia") {
      await atualizar("tarefas", t.id, { ajusteCliente: r.comentario || "ajuste pedido" });
      registrarAtividade(t.id, { tipo: "comentario", texto: `${quem} pediu ajuste no tema: ${r.comentario || "(sem comentário)"}` });
    } else {
      await atualizar("tarefas", t.id, { statusConteudo: "producao", status: statusDaEtapa("producao"), ajusteCliente: r.comentario || "ajuste pedido", ...copy });
      registrarAtividade(t.id, { tipo: "comentario", texto: `${quem} pediu revisão: ${r.comentario || "(sem comentário)"}${copy.copy ? " (e editou a legenda)" : ""}` });
    }
    if (ultimoAviso !== token) { ultimoAviso = token; avisar(`${quem} respondeu a aprovação de ${porId("clientes", t.clienteId)?.nome || "um cliente"}.`); }
  } catch (e) { console.warn("Resposta do cliente:", e.message); }
}

/** Selo para mostrar no post: aprovado ou ajuste pedido pelo cliente. */
export function seloResposta(t) {
  const r = dados.respostasCliente?.[t.id];
  if (!r) return null;
  return r.status === "aprovado"
    ? el("span", { class: "etiqueta ok", title: `Aprovado por ${r.nome || "cliente"} em ${fmtData(new Date(r.em).toISOString().slice(0, 10))}` }, r.copyNova ? "✓ Cliente aprovou (legenda editada)" : "✓ Cliente aprovou")
    : el("span", { class: "etiqueta alerta", title: r.comentario || "" }, "✎ Cliente pediu revisão");
}
