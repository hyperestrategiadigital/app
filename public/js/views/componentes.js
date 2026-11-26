// Peças reutilizadas entre telas: cartão e formulário de tarefa, selo de cliente.
import { pode, eu, ehAdmin } from "../permissoes.js";
import { seloResposta, gerarLinkAprovacao, blocoResposta } from "../aprovacoes.js";
import { avisarMencao } from "../emails.js";
import { quitarCobranca, lancamentoDe } from "../recorrencias.js";
import { el, normalizar, formulario, confirmar, avisar, fmtPrazoRelativo, fmtData, diasAte, hojeISO, addDias, linkExterno, fecharModais } from "../ui.js";
import { dados, criar, atualizar, excluir, nomeCliente, opcoesClientes, porId, marcasDo, campanhasDo, desfazerExclusao, listarAtividade, registrarAtividade, excluirAtividade } from "../db.js";
import { STATUS_TAREFA, TIPOS_TAREFA, TIPO_CONTEUDO, ehConteudo, FORMATOS, FORMATO_PADRAO, REDES, STATUS_CONTEUDO, rotuloStatusConteudo, statusDaEtapa, MODELOS_PADRAO, comAtual, prazoDoPost, FORMATO_VIDEO, TIPO_FINANCEIRO, OBJETIVOS } from "../constantes.js";
import { pilaresDe } from "../ia.js";
import { identidade } from "../db.js";
import { abrirAssistenteIA } from "./assistenteIA.js";
import { camposDaResposta } from "../ia.js";
import { postsPorSemana } from "./escopo.js";
import { producaoDoPost, postsDaProducao, roteirosDaProducao, postsAtrasando } from "../producao.js";
import { listarArtesTarefa, salvarArte, excluirArte, comprimirImagem } from "../arquivos.js";
import { abrirCompromisso } from "../compromissos.js";
import { responsaveis, responsavelPadrao } from "../agenda.js";
import { linkAgendadorMeta, linkLinkedinAdmin, redesDe } from "./contas.js";

/** Nomes da equipe (Ajustes → Equipe) + quem já aparece nas tarefas. */
export function opcoesResponsaveis(atual = "") {
  const nomes = responsaveis();
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

/** Passos do modelo para a tarefa: pelo formato (posts) ou pelo tipo. */
export function modeloChecklist(t = {}) {
  const meus = dados.config.find((c) => c.id === "modelos")?.modelos || {};
  const modelos = { ...MODELOS_PADRAO, ...meus };
  const passos = (t.tipo === TIPO_CONTEUDO && modelos[t.formato]) || modelos[t.tipo] || [];
  return passos.map((texto) => ({ texto, feito: false }));
}

/** Clientes ativos + o cliente atual da tarefa, mesmo que esteja inativo (para não sumir da lista). */
function opcoesClientesCom(clienteId) {
  const opcoes = opcoesClientes();
  const c = clienteId && porId("clientes", clienteId);
  if (c && !opcoes.some(([id]) => id === c.id)) opcoes.push([c.id, `${c.nome} (inativo)`]);
  return opcoes;
}

export function abrirTarefa(tarefa = {}) {
  const editando = !!tarefa.id;
  const conteudo = (v) => v.tipo === TIPO_CONTEUDO;
  const valores = { ...tarefa };
  if (!editando && tarefa.tipo === undefined) valores.tipo = TIPO_CONTEUDO;
  if (!editando && !valores.checklist?.length) valores.checklist = modeloChecklist({ formato: FORMATO_PADRAO, ...valores });
  // Post criado à mão é "extra": fica solto nas tarefas. Os do planejamento entram no "Produzir semana".
  if (!editando && valores.extra === undefined) valores.extra = true;
  const producao = editando ? producaoDoPost(tarefa) : null;
  // Post novo: prazo de produção sai da data de publicação e do formato (Ajustes → Menus e listas)
  if (!editando && (valores.tipo === TIPO_CONTEUDO) && valores.dataPublicacao && !tarefa.prazo)
    valores.prazo = prazoDoPost(valores.dataPublicacao, valores.formato || FORMATO_PADRAO, hojeISO());
  const pilaresDaConta = (v) => pilaresDe(identidade(v.clienteId, v.marcaId || undefined));
  const campos = [
    { nome: "titulo", rotulo: "Tarefa / tema do post", obrigatorio: true, dica: "Ex.: Black Week — plano anual" },
    { nome: "status", rotulo: "Status", tipo: "botoes", opcoes: STATUS_TAREFA, padrao: "a_fazer", mostrarSe: (v) => !conteudo(v) },
    { nome: "statusConteudo", rotulo: "Etapa do post", tipo: "botoes", opcoes: STATUS_CONTEUDO, padrao: "ideia", mostrarSe: conteudo },
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientesCom(tarefa.clienteId), largura: "metade" },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: comAtual(TIPOS_TAREFA, tarefa.tipo), largura: "metade" },
    { nome: "marcaId", rotulo: "Marca", tipo: "select", largura: "metade",
      opcoesDe: (v) => [...marcasDo(v.clienteId).map((m) => [m.id, m.nome]), ["", `${porId("clientes", v.clienteId)?.nome || "Grupo"} (institucional)`]],
      mostrarSe: (v) => marcasDo(v.clienteId).length > 0 },
    // Campanha junto de cliente e marca: define o contexto do post (o briefing dela vai no pedido da copy)
    { nome: "campanhaId", rotulo: "Campanha", tipo: "select", largura: "metade",
      opcoesDe: (v) => [["", "—"], ...campanhasDo(v.clienteId, v.marcaId || "").filter((c) => c.ativa !== false || c.id === tarefa.campanhaId).map((c) => [c.id, c.nome])],
      mostrarSe: (v) => !!v.clienteId && (campanhasDo(v.clienteId, v.marcaId || "").length > 0 || !!tarefa.campanhaId) },

    { tipo: "secao", rotulo: "Post (aparece no calendário de conteúdo)", mostrarSe: conteudo },
    { nome: "formato", rotulo: "Formato", tipo: "select", opcoes: comAtual(FORMATOS, tarefa.formato), padrao: FORMATO_PADRAO, largura: "metade", mostrarSe: conteudo },
    { nome: "rede", rotulo: "Rede", tipo: "select", opcoes: comAtual(REDES, tarefa.rede), padrao: REDES[0] || "Instagram", largura: "metade", mostrarSe: conteudo },
    { nome: "dataPublicacao", rotulo: "Data de publicação", tipo: "date", padrao: tarefa.prazo || hojeISO(), obrigatorio: true, largura: "metade", mostrarSe: conteudo },
    { nome: "hora", rotulo: "Horário", tipo: "time", largura: "metade", mostrarSe: conteudo },
    { nome: "objetivo", rotulo: "Objetivo (etapa do funil)", tipo: "select", largura: "metade", mostrarSe: conteudo,
      opcoes: [["", "—"], ...OBJETIVOS, ...(tarefa.objetivo && !OBJETIVOS.some(([v]) => v === tarefa.objetivo) ? [[tarefa.objetivo, tarefa.objetivo]] : [])] },
    { nome: "pilar", rotulo: "Pilar de conteúdo", tipo: "select", largura: "metade",
      opcoesDe: (v) => [["", "—"], ...comAtual(pilaresDaConta(v), tarefa.pilar).map((p) => [p, p])], mostrarSe: (v) => conteudo(v) && (pilaresDaConta(v).length > 0 || !!tarefa.pilar) },
    { nome: "avisoCampanha", tipo: "nota", rotulo: "◆ O briefing da campanha (objetivo, mensagem, condições, chamada e briefing) já vai no pedido da copy. Aqui embaixo, escreva só o que é deste post: o ângulo, o produto, o detalhe.",
      mostrarSe: (v) => conteudo(v) && !!v.campanhaId },
    { nome: "roteiro", rotulo: "Briefing (a ideia do post)", tipo: "textarea", linhas: 3, dica: "O que o post precisa dizer: assunto, oferta, dados, referências…", mostrarSe: conteudo },
    { nome: "videoGravado", rotulo: "O vídeo já foi gravado (a copy sai da transcrição, sem roteiro)", tipo: "checkbox", mostrarSe: (v) => conteudo(v) && v.formato === FORMATO_VIDEO },
    { nome: "transcricao", rotulo: "Transcrição do vídeo", tipo: "textarea", linhas: 4, dica: "Cole o que foi falado no vídeo", mostrarSe: (v) => conteudo(v) && v.formato === FORMATO_VIDEO && v.videoGravado },
    { nome: "textoArte", rotulo: "Roteiro / texto da arte", tipo: "textarea", linhas: 4, dica: "Roteiro do vídeo, lâminas do carrossel, telas dos stories ou o texto da arte", mostrarSe: conteudo },
    { nome: "copy", rotulo: "Copy / legenda final", tipo: "textarea", linhas: 5, dica: "Clique em \"✨ Criar copy\" ou escreva aqui", mostrarSe: conteudo },
    { nome: "exemplo", rotulo: "★ Usar esta copy como exemplo da marca para a IA", tipo: "checkbox", mostrarSe: conteudo },
    { nome: "extra", rotulo: "Post extra: aparece solto nas tarefas, fora do \"Produzir semana\"", tipo: "checkbox", mostrarSe: conteudo },
    { nome: "texto", rotulo: "Texto (apresentação, e-book, página, mensagem…)", tipo: "textarea", linhas: 5, dica: "Clique em \"✨ Criar texto\" ou escreva aqui",
      mostrarSe: (v) => !conteudo(v) && !["Tráfego pago", TIPO_FINANCEIRO, "Reunião"].includes(v.tipo) },

    { tipo: "secao", rotulo: "Tarefa" },
    { nome: "responsavel", rotulo: "Responsável", tipo: "select", opcoes: opcoesResponsaveis(tarefa.responsavel), padrao: responsavelPadrao(), largura: "metade" },
    { nome: "prazo", rotulo: "Prazo de entrega", tipo: "date", padrao: hojeISO(), largura: "metade" },
    { nome: "checklist", rotulo: "Checklist", tipo: "checklist" },
    { nome: "linkCanva", rotulo: "Link do Canva (criativo)", dica: "https://www.canva.com/design/...", largura: "metade" },
    { nome: "linkDrive", rotulo: "Link do Drive", dica: "https://drive.google.com/...", largura: "metade" },
    { nome: "notas", rotulo: "Observações", tipo: "textarea", linhas: 2 }
  ];
  const ultimoForm = () => [...document.querySelectorAll(".modal form")].pop();
  const extras = [
    editando && ehConteudo(tarefa) ? el("a", {
      class: "botao-link secundario mini so-conteudo", target: "_blank", rel: "noopener",
      href: tarefa.rede === "LinkedIn" && redesDe(tarefa.clienteId, tarefa.marcaId).linkedin ? linkLinkedinAdmin(redesDe(tarefa.clienteId, tarefa.marcaId)) : linkAgendadorMeta(redesDe(tarefa.clienteId, tarefa.marcaId)),
      onClick: async () => { if (tarefa.copy) { try { await navigator.clipboard.writeText(tarefa.copy); avisar("Legenda copiada. Cole no agendador."); } catch {} } }
    }, "📅 Agendar") : null,
    editando ? el("button", {
      type: "button", class: "secundario mini", title: "Abre um post novo igual a este para você mudar a data",
      onClick: () => {
        const { id, criadoEm, concluidoEm, produzido, roteiroPronto, aprovacaoCliente, ajusteCliente, respostaCliente, aprovacaoDesde, lembreteAprovacaoEm, qtdArtes, artes, qtdComentarios, exemplo, ...copia } = { ...(porId("tarefas", tarefa.id) || tarefa), ...(ultimoForm()?.lerValores?.() || {}) };
        fecharModais();
        abrirTarefa({ ...copia, titulo: `${copia.titulo} (cópia)`, statusConteudo: "ideia", status: "a_fazer", checklist: (copia.checklist || []).map((i) => ({ ...i, feito: false })) });
      }
    }, "⧉ Duplicar") : null,
    editando ? el("button", {
      type: "button", class: "perigo-texto",
      onClick: async () => {
        if (await confirmar(`Excluir "${tarefa.titulo}"?`)) {
          const { id, ...copia } = porId("tarefas", tarefa.id) || tarefa;
          try { await excluir("tarefas", id); } catch (e) { avisar(`Não consegui excluir: ${e.message}`, "erro"); return; }
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
  // "Montar briefing": perguntas simples que viram o texto do briefing (para quem não é da área)
  const rotuloBriefing = form?.querySelector("#f-roteiro")?.closest(".campo")?.querySelector(":scope > span");
  if (rotuloBriefing) { rotuloBriefing.classList.add("rotulo-com-botao"); rotuloBriefing.append(botaoMontarBriefing(form)); }
  // Prazo acompanha a data de publicação e o formato, enquanto você não mexer nele
  if (form) {
    const [cData, cFormato, cPrazo] = ["#f-dataPublicacao", "#f-formato", "#f-prazo"].map((q) => form.querySelector(q));
    let prazoAuto = prazoDoPost(cData?.value, cFormato?.value, hojeISO());
    const recalcular = () => {
      if (!conteudo(form.lerValores()) || !cData?.value) return;
      const novo = prazoDoPost(cData.value, cFormato.value, hojeISO());
      if (!cPrazo.value || cPrazo.value === prazoAuto) cPrazo.value = novo;
      prazoAuto = novo;
    };
    cData?.addEventListener("change", recalcular);
    cFormato?.addEventListener("change", recalcular);
  }
  // "✨ Criar copy" junto do campo da copy: briefing + identidade da marca
  const rotuloCopy = form?.querySelector("#f-copy")?.closest(".campo")?.querySelector(":scope > span");
  if (rotuloCopy) { rotuloCopy.classList.add("rotulo-com-botao"); rotuloCopy.append(botaoCriarComIA(form, tarefa)); }
  // "✨ Criar texto" nas tarefas que não são post (apresentação, e-book, página…): título + observações como briefing
  const rotuloTexto = form?.querySelector("#f-texto")?.closest(".campo")?.querySelector(":scope > span");
  if (rotuloTexto) { rotuloTexto.classList.add("rotulo-com-botao"); rotuloTexto.append(botaoCriarTexto(form, tarefa)); }
  // Post que está dentro de um "Produzir semana": aviso com atalho
  if (form && producao) form.querySelector(".form-grade").before(el("p", { class: "faixa-info" },
    `Este post faz parte de "${producao.titulo}". `,
    el("button", { type: "button", class: "link", onClick: () => abrirTarefa(producao) }, "Abrir a produção da semana")));
  // Criativos anexados ao post (imagens guardadas no banco)
  if (form) form.querySelector(".acoes").before(secaoCriativos(tarefa));
  // Ajuste pedido pelo cliente no link de aprovação
  // Resposta do cliente pelo link (ainda não vista): pedido e legenda sugerida, para aceitar ou não
  const resposta = form && tarefa.id ? porId("tarefas", tarefa.id)?.respostaCliente : null;
  if (resposta) {
    const bloco = blocoResposta(porId("tarefas", tarefa.id), ({ copy }) => {
      if (copy) { const campo = form.querySelector("#f-copy"); if (campo) campo.value = copy; }
      bloco.replaceWith(el("p", { class: "faixa-ok" }, copy ? "Legenda do cliente aplicada." : "Resposta do cliente vista."));
    });
    form.querySelector(".form-grade").before(bloco);
  } else if (form && tarefa.ajusteCliente) form.querySelector(".form-grade").before(el("p", { class: "faixa-alerta" }, el("strong", {}, "Ajuste pedido pelo cliente: "), tarefa.ajusteCliente));
  // Comentários (com @menção) e histórico de mudanças
  if (form && tarefa.id) form.querySelector(".acoes").before(secaoAtividade(tarefa));
  // Rotina "Produzir semana": mostra ao vivo os posts da semana seguinte do cliente
  // (logo depois de Cliente/Tipo: é o principal desse card)
  if (form && tarefa.semanaInicio) {
    const secTarefa = [...form.querySelectorAll(".form-grade > .form-secao")].find((h) => h.textContent === "Tarefa");
    secTarefa ? secTarefa.before(secaoSemana(tarefa)) : form.querySelector(".form-grade").after(secaoSemana(tarefa));
  }
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

/**
 * "✨ Criar copy": abre o assistente (views/assistenteIA.js) com o pedido completo para a IA da pessoa
 * (jeito Hyper de escrever + marca + briefing do post) e, ao colar a resposta, preenche a copy e o roteiro / texto da arte.
 */
function botaoCriarComIA(form, tarefa) {
  return el("button", { type: "button", class: "destaque mini so-conteudo", title: "Monta o pedido com o jeito Hyper de escrever, a marca e o briefing deste post", onClick: () => {
    const v = { ...form.lerValores(), id: tarefa.id };
    if (!v.clienteId) { avisar("Escolha o cliente primeiro.", "erro"); return; }
    abrirAssistenteIA({
      ctx: { clienteId: v.clienteId, marcaId: v.marcaId || "", post: v },
      aoUsar: (resp) => {
        const { copy, textoArte } = camposDaResposta(resp);
        const preencher = (sel, valor) => { const c = form.querySelector(sel); if (c && valor) { c.value = valor; c.dispatchEvent(new Event("input", { bubbles: true })); } };
        preencher("#f-copy", copy);
        preencher("#f-textoArte", textoArte);
        avisar(copy || textoArte ? "Resposta colocada no post. Revise e salve." : "Não encontrei os blocos na resposta: confira se colou tudo.", copy || textoArte ? "ok" : "erro");
      }
    });
  } }, "✨ Criar copy");
}

/** "✨ Criar texto": pedido com o jeito Hyper e a marca para uma tarefa que não é post; a resposta vai para o campo Texto. */
function botaoCriarTexto(form, tarefa) {
  return el("button", { type: "button", class: "destaque mini", title: "Usa o título e as observações como briefing", onClick: () => {
    const v = { ...form.lerValores(), id: tarefa.id };
    if (!v.clienteId) { avisar("Escolha o cliente primeiro.", "erro"); return; }
    abrirAssistenteIA({
      ctx: { clienteId: v.clienteId, marcaId: v.marcaId || "", post: v }, titulo: "Criar texto",
      aoUsar: (resp) => {
        const c = form.querySelector("#f-texto");
        const { copy, textoArte } = camposDaResposta(resp);
        const texto = [copy, textoArte].filter(Boolean).join("\n\n");
        if (c && texto) { c.value = texto; c.dispatchEvent(new Event("input", { bubbles: true })); avisar("Texto colocado na tarefa. Revise e salve."); }
        else avisar("Não encontrei o texto na resposta: confira se colou tudo.", "erro");
      }
    });
  } }, "✨ Criar texto");
}

/** "Montar briefing": 4 perguntas que viram o briefing do post (somam ao que já estiver escrito). */
function botaoMontarBriefing(form) {
  return el("button", { type: "button", class: "secundario mini so-conteudo", onClick: async () => {
    const v = await formulario("Montar briefing", [
      { nome: "assunto", rotulo: "Sobre o que é o post?", obrigatorio: true, dica: "Ex.: a aula nova de spinning às 7h" },
      { nome: "mensagem", rotulo: "O que a pessoa precisa entender ou sentir?", tipo: "textarea", linhas: 2, dica: "Ex.: que dá para treinar antes do trabalho e sair com energia" },
      { nome: "oferta", rotulo: "Tem oferta, preço, data ou dado importante?", dica: "Ex.: primeira aula grátis até sexta" },
      { nome: "cta", rotulo: "O que a pessoa deve fazer depois de ver?", dica: "Ex.: chamar no WhatsApp, agendar, comentar" },
      { nome: "referencias", rotulo: "Referências ou observações (opcional)", tipo: "textarea", linhas: 2 }
    ], {}, { rotuloSalvar: "Usar no briefing" });
    if (!v) return;
    const texto = [
      `Assunto: ${v.assunto}`, v.mensagem ? `Mensagem principal: ${v.mensagem}` : "", v.oferta ? `Oferta / dados: ${v.oferta}` : "",
      v.cta ? `Chamada para ação: ${v.cta}` : "", v.referencias ? `Referências: ${v.referencias}` : ""
    ].filter(Boolean).join("\n");
    const campo = form.querySelector("#f-roteiro");
    campo.value = campo.value.trim() ? `${campo.value.trim()}\n\n${texto}` : texto;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  } }, "Montar briefing");
}

/** Pessoas mencionadas com @PrimeiroNome (ou @Nome Completo) no texto. */
function mencionados(texto) {
  const t = normalizar(texto);
  return dados.membros.filter((m) => m.status === "ativo" && m.papel !== "cliente" && m.id !== eu.uid && m.nome && m.email &&
    (t.includes("@" + normalizar(m.nome)) || t.includes("@" + normalizar(m.nome.split(" ")[0]))));
}

function secaoAtividade(tarefa) {
  const lista = el("div", { class: "atividade-lista" }, el("p", { class: "subtitulo" }, "Carregando…"));
  const quando = (ms) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  // Só a leitura mais recente desenha a lista (a primeira, ao abrir, pode chegar depois de um comentário novo)
  let versao = 0;
  const carregar = async () => {
    const minha = ++versao;
    try {
      const itens = await listarAtividade(tarefa.id);
      if (minha !== versao) return;
      lista.replaceChildren(...(itens.length ? itens.map((a) => a.tipo === "comentario"
        ? el("div", { class: "comentario" },
          avatar(dados.membros.find((m) => m.id === a.uid) || a.nome),
          el("div", {},
            el("div", { class: "comentario-topo" }, el("strong", {}, a.nome), el("span", { class: "subtitulo" }, quando(a.em)),
              a.uid === eu.uid || ehAdmin() ? el("button", { type: "button", class: "link", onClick: async () => { await excluirAtividade(tarefa.id, a.id); carregar(); } }, "apagar") : null),
            el("p", {}, a.texto)))
        : el("div", { class: "mudanca" }, el("span", {}, `${a.nome} ${a.texto}`), el("span", { class: "subtitulo" }, quando(a.em))))
        : [el("p", { class: "subtitulo" }, "Nenhum comentário ainda.")]));
    } catch (e) { lista.replaceChildren(el("p", { class: "erro" }, "Não consegui carregar: " + e.message)); }
  };
  const caixa = el("textarea", { rows: 2, placeholder: "Escreva um comentário. Use @nome para avisar alguém por e-mail." });
  const enviar = async (botao) => {
    const texto = caixa.value.trim();
    if (!texto) return;
    botao.disabled = true;
    const pessoas = mencionados(texto);
    await registrarAtividade(tarefa.id, { tipo: "comentario", texto, mencoes: pessoas.map((m) => m.nome) });
    atualizar("tarefas", tarefa.id, { qtdComentarios: (porId("tarefas", tarefa.id)?.qtdComentarios || 0) + 1 }).catch(() => {});
    // O comentário aparece na hora; os e-mails das @menções saem depois (podem levar alguns segundos)
    caixa.value = "";
    botao.disabled = false;
    carregar();
    let avisados = 0;
    for (const m of pessoas) if (await avisarMencao({ para: m.email, nomePara: m.nome, tarefa, texto })) avisados++;
    if (pessoas.length) avisar(avisados ? `Comentário enviado. ${avisados} pessoa(s) avisada(s) por e-mail.` : "Comentário enviado (e-mails automáticos desligados).");
  };
  caixa.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(caixa.nextSibling.querySelector("button")); } });
  carregar();
  return el("div", { class: "secao-atividade" },
    el("h3", { class: "form-secao" }, "Comentários e histórico"),
    lista,
    caixa,
    el("div", { class: "acoes-criativos" }, el("button", { type: "button", class: "secundario mini", onClick: (e) => enviar(e.currentTarget) }, "Comentar"),
      el("span", { class: "subtitulo" }, "Ctrl+Enter envia")));
}

/** Descreve o que mudou numa tarefa, para o histórico. */
function mudancas(antes, depois) {
  const r = [];
  if (antes.statusConteudo !== depois.statusConteudo && depois.statusConteudo) r.push(`mudou a etapa para ${rotuloStatusConteudo(depois.statusConteudo)}`);
  else if (antes.status !== depois.status && depois.status) r.push(`mudou o status para ${STATUS_TAREFA.find(([v]) => v === depois.status)?.[1] || depois.status}`);
  if ((antes.responsavel || "") !== (depois.responsavel || "")) r.push(`passou para ${depois.responsavel || "ninguém"}`);
  if ((antes.prazo || "") !== (depois.prazo || "") && depois.prazo) r.push(`mudou o prazo para ${fmtData(depois.prazo, true)}`);
  if ((antes.dataPublicacao || "") !== (depois.dataPublicacao || "") && depois.dataPublicacao) r.push(`mudou a publicação para ${fmtData(depois.dataPublicacao, true)}`);
  if ((antes.titulo || "") !== (depois.titulo || "") && antes.titulo) r.push(`renomeou para "${depois.titulo}"`);
  if (!antes.copy && depois.copy) r.push("colocou a copy");
  if ((antes.linkCanva || "") !== (depois.linkCanva || "") && depois.linkCanva) r.push("colocou o link do Canva");
  return r.join(", ");
}
export const registrarMudanca = (antes, depois) => { const texto = mudancas(antes, { ...antes, ...depois }); if (texto) registrarAtividade(antes.id, { texto }); };

/**
 * "Produzir semana": os posts da semana como checklist (marcar = produzido, campo `produzido` no post) e os
 * roteiros dos vídeos da semana seguinte (campo `roteiroPronto`). Clicar no post abre o card dele por cima;
 * ao fechar, a lista se atualiza. Ações: mandar para aprovação, copiar as legendas e copiar os posts para outra semana.
 */
function secaoSemana(tarefa) {
  const fim = addDias(tarefa.semanaInicio, 6);
  const caixa = el("div", { class: "semana-producao" });
  const linhaPost = (p, campo, rotuloCampo) => el("li", { class: p[campo] ? "feito" : "" },
    el("input", { type: "checkbox", checked: !!p[campo], "aria-label": `${rotuloCampo}: ${p.titulo}`, onChange: async (e) => {
      const marcado = e.target.checked;
      await atualizar("tarefas", p.id, { [campo]: marcado });
      registrarAtividade(p.id, { texto: marcado ? `marcou ${rotuloCampo.toLowerCase()}` : `desmarcou ${rotuloCampo.toLowerCase()}` });
      desenhar();
      if (marcado && campo === "produzido" && ["ideia", "producao"].includes(p.statusConteudo || "ideia"))
        avisar("Produzido ✓", "ok", { acao: { rotulo: "Mandar para aprovação", fn: async () => { await mudarEtapa(porId("tarefas", p.id) || p, "aprovacao"); desenhar(); } } });
    } }),
    el("button", { type: "button", class: "item-producao", title: "Abrir o post", onClick: async () => { await abrirTarefa(porId("tarefas", p.id) || p); desenhar(); } },
      el("span", { class: "data-mini" }, fmtData(p.dataPublicacao || p.prazo, true)),
      el("span", { class: "etiqueta formato" }, p.formato || "Post"),
      el("strong", {}, p.titulo),
      p.marcaId ? el("span", { class: "etiqueta" }, porId("marcas", p.marcaId)?.nome || "") : null,
      el("span", { class: `etiqueta st-${p.statusConteudo || "ideia"}` }, rotuloStatusConteudo(p.statusConteudo || "ideia")),
      porId("tarefas", p.id)?.respostaCliente ? seloResposta(porId("tarefas", p.id)) : null));
  const desenhar = () => {
    const posts = postsDaProducao(tarefa);
    const roteiros = roteirosDaProducao(tarefa);
    const atrasando = tarefa.status === "concluido" ? [] : postsAtrasando(tarefa, hojeISO());
    const feitos = posts.filter((p) => p.produzido).length;
    const prontosParaAprovar = posts.filter((p) => p.produzido && ["ideia", "producao"].includes(p.statusConteudo || "ideia"));
    const fimSeguinte = addDias(tarefa.semanaInicio, 13);
    caixa.replaceChildren(...[
      el("h3", { class: "form-secao" }, `Posts da semana · ${fmtData(tarefa.semanaInicio, true)} a ${fmtData(fim, true)}`,
        posts.length ? el("span", { class: "contador" }, `${feitos}/${posts.length} produzidos`) : null),
      atrasando.length ? el("p", { class: "faixa-alerta" }, `⚠ ${atrasando.length} post(s) publicam em até 2 dias e ainda não foram produzidos.`) : null,
      (() => { const previstos = Math.round(postsPorSemana(porId("clientes", tarefa.clienteId))); return previstos && posts.length < previstos
        ? el("p", { class: "faixa-aviso" }, `O escopo prevê ${previstos} post(s) por semana; esta semana tem ${posts.length}.`) : null; })(),
      posts.length ? el("ul", { class: "checklist-producao" }, posts.map((p) => linhaPost(p, "produzido", "Produzido")))
        : el("p", { class: "subtitulo" }, "Nenhum post planejado para essa semana. Planeje o mês do cliente primeiro."),
      posts.length && feitos === posts.length ? el("p", { class: "faixa-ok" }, "Tudo produzido! Pode concluir esta tarefa.") : null,
      roteiros.length ? [
        el("h3", { class: "form-secao subsecao" }, `Roteiros dos vídeos da semana seguinte · ${fmtData(addDias(tarefa.semanaInicio, 7), true)} a ${fmtData(fimSeguinte, true)}`,
          el("span", { class: "contador" }, `${roteiros.filter((p) => p.roteiroPronto).length}/${roteiros.length} prontos`)),
        el("p", { class: "subtitulo" }, "Vídeo precisa do roteiro uma semana antes da produção."),
        el("ul", { class: "checklist-producao" }, roteiros.map((p) => linhaPost(p, "roteiroPronto", "Roteiro pronto")))] : null,
      posts.length ? el("div", { class: "acoes-producao" },
        el("button", { type: "button", class: "secundario mini", disabled: !pode("conteudo"), title: "Os posts produzidos vão para \"Em aprovação\" e sai um link para o cliente", onClick: () => {
          const lista = prontosParaAprovar.length ? prontosParaAprovar : posts.filter((p) => p.produzido && p.statusConteudo !== "publicado");
          if (!lista.length) { avisar("Marque os posts produzidos primeiro.", "erro"); return; }
          gerarLinkAprovacao(tarefa.clienteId, tarefa.semanaInicio, undefined, { lista, rotulo: `semana de ${fmtData(tarefa.semanaInicio, true)} a ${fmtData(fim, true)}` });
        } }, `➜ Mandar para aprovação${prontosParaAprovar.length ? ` (${prontosParaAprovar.length})` : ""}`),
        el("button", { type: "button", class: "secundario mini", title: "Copia as legendas da semana para colar no agendador", onClick: () => copiarLegendas(posts) }, "📋 Copiar legendas"),
        el("button", { type: "button", class: "secundario mini", title: "Cria posts iguais em outra semana (como ideia)", onClick: () => copiarSemana(tarefa, posts) }, "⧉ Copiar para outra semana")) : null
    ].flat().filter(Boolean));
  };
  desenhar();
  return caixa;
}

/** Legendas da semana num texto só (data, formato e tema antes de cada uma). */
async function copiarLegendas(posts) {
  const comCopy = posts.filter((p) => p.copy);
  if (!comCopy.length) { avisar("Nenhum post desta semana tem copy ainda.", "erro"); return; }
  const texto = comCopy.map((p) => `${fmtData(p.dataPublicacao || p.prazo, true)}${p.hora ? ` ${p.hora}` : ""} · ${p.formato || "Post"} · ${p.titulo}\n\n${p.copy}`).join("\n\n————————\n\n");
  try { await navigator.clipboard.writeText(texto); avisar(`${comCopy.length} legenda(s) copiada(s)${comCopy.length < posts.length ? `; ${posts.length - comCopy.length} post(s) ainda sem copy` : ""}.`); }
  catch { avisar("Não consegui copiar.", "erro"); }
}

/** Copia os posts da semana para outra semana, mantendo o dia da semana (entram como ideia). */
async function copiarSemana(tarefa, posts) {
  const v = await formulario("Copiar os posts para outra semana", [
    { nome: "semana", rotulo: "Segunda-feira da semana de destino", tipo: "date", obrigatorio: true }
  ], { semana: addDias(tarefa.semanaInicio, 7) }, { rotuloSalvar: `Copiar ${posts.length} post(s)` });
  if (!v?.semana) return;
  const delta = Math.round((new Date(`${v.semana}T12:00:00`) - new Date(`${tarefa.semanaInicio}T12:00:00`)) / 86400000);
  for (const p of posts) {
    const { id, criadoEm, concluidoEm, produzido, roteiroPronto, aprovacaoCliente, ajusteCliente, respostaCliente, aprovacaoDesde, lembreteAprovacaoEm, qtdArtes, artes, qtdComentarios, exemplo, ...copia } = p;
    const data = addDias(p.dataPublicacao || p.prazo, delta);
    await criar("tarefas", { ...copia, dataPublicacao: data, prazo: prazoDoPost(data, p.formato, hojeISO()), statusConteudo: "ideia", status: "a_fazer",
      checklist: (p.checklist || []).map((i) => ({ ...i, feito: false })) });
  }
  avisar(`${posts.length} post(s) copiados para a semana de ${fmtData(v.semana, true)}, como ideia.`);
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
        el("figcaption", {}, "Criativo final"),
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
    el("label", { class: "botao-link secundario mini" }, "📎 Anexar criativo final", entrada)));
  return caixa;
}

/** Grava uma tarefa (ou post) mantendo status de tarefa e etapa do post coerentes. */
export async function salvarTarefa(original, v) {
  // Tarefa nova: se o checklist ficou com o modelo de outro formato/tipo, troca pelo certo
  if (!original.id) {
    const doInicio = JSON.stringify(modeloChecklist({ formato: FORMATO_PADRAO, ...original }).map((i) => i.texto));
    const atual = JSON.stringify((v.checklist || []).map((i) => i.texto));
    if (!v.checklist?.length || atual === doInicio) v.checklist = modeloChecklist(v);
  }
  if (v.tipo !== TIPO_CONTEUDO) {
    for (const k of ["formato", "rede", "dataPublicacao", "hora", "statusConteudo", "objetivo", "roteiro", "copy", "extra", "textoArte", "pilar", "videoGravado", "transcricao", "exemplo"]) delete v[k];
  } else {
    if (!v.prazo) v.prazo = prazoDoPost(v.dataPublicacao, v.formato, hojeISO()) || v.dataPublicacao;
    v.statusConteudo ||= "ideia";
    v.status = statusDaEtapa(v.statusConteudo);
    // Desde quando está esperando o cliente (lembrete automático por e-mail)
    if (v.statusConteudo === "aprovacao" && original.statusConteudo !== "aprovacao") v.aprovacaoDesde = Date.now();
  }
  if (v.status === "concluido" && original.status !== "concluido") v.concluidoEm = hojeISO();
  if (v.status !== "concluido") v.concluidoEm = null;
  if (original.id) { const antes = { ...(porId("tarefas", original.id) || original) }; await atualizar("tarefas", original.id, v); registrarMudanca(antes, v); }
  else { const novo = await criar("tarefas", v); registrarAtividade(novo.id, { texto: "criou" }); }
  if (original.id && (v.status === "concluido") !== (original.status === "concluido")) await quitarCobranca(original, v.status === "concluido");
  avisar(original.id ? "Salvo." : v.tipo === TIPO_CONTEUDO ? "Post criado e adicionado ao calendário." : "Tarefa criada.");
}

/** Muda só a etapa de um post (e o status de tarefa que sai dela), com desfazer. */
export async function mudarEtapa(t, etapa) {
  if (!etapa || etapa === (t.statusConteudo || "ideia")) return;
  const antes = { statusConteudo: t.statusConteudo || "ideia", status: t.status || "a_fazer", concluidoEm: t.concluidoEm || null };
  const status = statusDaEtapa(etapa);
  await atualizar("tarefas", t.id, { statusConteudo: etapa, status, concluidoEm: status === "concluido" ? (t.concluidoEm || hojeISO()) : null,
    ...(etapa === "aprovacao" ? { aprovacaoDesde: Date.now() } : {}) });
  registrarAtividade(t.id, { texto: `mudou a etapa para ${rotuloStatusConteudo(etapa)}` });
  avisar(`Etapa: ${rotuloStatusConteudo(etapa)}.`, "ok", { desfazer: () => atualizar("tarefas", t.id, antes) });
}
/** Próxima etapa do post (ideia → produção → aprovação → aprovado → agendado → publicado). */
export const proximaEtapa = (t) => { const i = STATUS_CONTEUDO.findIndex(([v]) => v === (t.statusConteudo || "ideia")); return STATUS_CONTEUDO[i + 1]?.[0] || null; };

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
  registrarAtividade(t.id, { texto: concluir ? (post ? "marcou como publicado" : "concluiu") : "reabriu" });
  if (concluir) avisar(lancamentoDe(t) && pode("financeiro") ? "Concluída! Mensalidade marcada como paga ✓" : "Concluída! ✓", "ok", {
    desfazer: async () => {
      await quitarCobranca(t, false);
      await atualizar("tarefas", t.id, { status: t.status || "a_fazer", concluidoEm: t.concluidoEm || null, checklist: t.checklist || [], ...(post ? { statusConteudo: t.statusConteudo || "ideia" } : {}) });
    }
  });
}

/** "▣ 3/8 posts" no card do Produzir semana. */
function progressoProducao(t) {
  const posts = postsDaProducao(t);
  if (!posts.length) return null;
  const feitos = posts.filter((p) => p.produzido).length;
  return el("span", { class: `progresso-mini ${feitos === posts.length ? "completo" : ""}`, title: "Posts produzidos" }, `▣ ${feitos}/${posts.length} posts`);
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
        t.campanhaId && porId("campanhas", t.campanhaId) ? el("span", { class: "etiqueta campanha", title: "Campanha" }, `◆ ${porId("campanhas", t.campanhaId).nome}`) : null,
        t.status === "andamento" ? el("span", { class: "etiqueta andamento" }, "Em andamento") : null,
        total ? el("span", { class: "progresso-mini" }, `☑ ${feitos}/${total}`) : null,
        t.semanaInicio ? progressoProducao(t) : null,
        t.semanaInicio && t.status !== "concluido" && postsAtrasando(t, hojeISO()).length
          ? el("span", { class: "etiqueta atrasado", title: "Posts que publicam em até 2 dias e não foram produzidos" }, `⚠ ${postsAtrasando(t, hojeISO()).length} perto da data`) : null,
        t.qtdComentarios ? el("span", { class: "progresso-mini", title: "Comentários" }, `💬 ${t.qtdComentarios}`) : null,
        ehConteudo(t) ? seloResposta(t) : null,
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

/** Tarefas e calendário são uma tela só com quatro visões (o estado/filtros é o mesmo nas duas rotas). */
export function visoesTarefas(estado, renderizar) {
  const noCalendario = location.hash.startsWith("#/calendario");
  const atual = noCalendario ? "calendario" : estado.visao && estado.visao !== "calendario" ? estado.visao : "quadro";
  return el("div", { class: "visoes-tarefas" }, abas([["calendario", "▦ Calendário"], ["quadro", "▥ Quadro"], ["lista", "☰ Lista"], ["equipe", "☺ Equipe"]], atual, (v) => {
    estado.visao = v;
    if (v === "equipe") estado.responsavel = "";
    const destino = v === "calendario" ? "#/calendario" : "#/tarefas";
    if (location.hash.split("/").slice(0, 2).join("/") === destino) renderizar(); else location.hash = destino;
  }));
}
/** Filtro de responsável compartilhado por calendário e tarefas. */
export function seletorResponsavel(estado, renderizar) {
  return el("select", { onChange: (e) => { estado.responsavel = e.target.value; renderizar(); }, "aria-label": "Responsável" },
    el("option", { value: "" }, "Todos os responsáveis"),
    [...new Set([...opcoesResponsaveis(), ...dados.tarefas.map((t) => t.responsavel).filter(Boolean)])].map((r) => el("option", { value: r, selected: r === estado.responsavel }, r)));
}

export function abas(itens, ativo, aoTrocar) {
  return el("div", { class: "abas", role: "tablist" }, itens.map(([v, r]) =>
    el("button", { role: "tab", "aria-selected": String(v === ativo), class: v === ativo ? "ativa" : "", onClick: () => aoTrocar(v) }, r)));
}
