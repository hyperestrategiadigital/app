// Usuários e equipe (só administradores; qualquer administrador gerencia): pedidos de acesso,
// convites por e-mail, quem está no espaço, o que cada um pode ver (áreas e clientes) e a equipe sem conta.
// Toda pessoa entra como "básico"; pelo convite, já entra com o acesso definido aqui.
import { el, avisar, confirmar, hojeISO, vazio, formulario } from "../ui.js";
import { dados, atualizar, excluir, espacoInfo, salvarComId, listarConvites, salvarConvite, excluirConvite, gravarEmLote, carregarArquivo } from "../db.js";
import { cabecalho, avatar, opcoesResponsaveis } from "./componentes.js";
import { AREAS, eu, rotuloArea } from "../permissoes.js";
import { descreverPedido } from "./conta.js";
import { emailConvite, emailLiberado, emailMaisAcesso, emailAtivo, sincronizarAdmins } from "../emails.js";

const clientesOrdenados = () => [...dados.clientes].filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
const nomesDe = (ids = []) => ids.map((id) => dados.clientes.find((c) => c.id === id)?.nome).filter(Boolean);

/** Controles de acesso (administrador, áreas, clientes) reaproveitados no cartão e no convite. */
function editorAcesso(inicial, { travarAdmin = false } = {}) {
  let admin = inicial.papel === "admin";
  const marcado = new Set(inicial.permissoes || []);
  const checks = AREAS.map(([v, r, desc]) => {
    const c = el("input", { type: "checkbox", value: v, checked: admin || marcado.has(v), disabled: admin });
    return el("label", { class: "chip-check", title: desc }, c, r);
  });
  const caixaAdmin = el("input", { type: "checkbox", checked: admin, disabled: travarAdmin });
  const modo = el("select", { "aria-label": "Clientes" },
    el("option", { value: "todos", selected: (inicial.acessoClientes || "todos") !== "alguns" }, "Todos os clientes"),
    el("option", { value: "alguns", selected: inicial.acessoClientes === "alguns" }, "Só alguns clientes"));
  const escolhidos = new Set(inicial.clientes || []);
  const listaClientes = el("div", { class: "multi lista-clientes-acesso" }, clientesOrdenados().map((c) =>
    el("label", { class: "chip-check" }, el("input", { type: "checkbox", value: c.id, checked: escolhidos.has(c.id) }), c.nome)));
  const blocoClientes = el("div", { class: "campo" }, el("span", {}, "Clientes que pode ver"), modo, listaClientes);
  const atualizarVisao = () => {
    checks.forEach((l) => { const i = l.querySelector("input"); i.disabled = admin; if (admin) i.checked = true; });
    blocoClientes.hidden = admin;
    listaClientes.hidden = modo.value !== "alguns";
  };
  caixaAdmin.addEventListener("change", () => { admin = caixaAdmin.checked; atualizarVisao(); });
  modo.addEventListener("change", atualizarVisao);
  atualizarVisao();
  return {
    elemento: el("div", { class: "membro-acessos" },
      el("label", { class: "chip-check destaque-admin" }, caixaAdmin, "Administrador (tudo, inclusive usuários)"),
      el("div", { class: "multi" }, checks),
      blocoClientes),
    ler: () => {
      if (admin) return { papel: "admin", permissoes: AREAS.map(([v]) => v), acessoClientes: "todos", clientes: [] };
      const alguns = modo.value === "alguns";
      return {
        papel: "basico",
        permissoes: checks.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value),
        acessoClientes: alguns ? "alguns" : "todos",
        clientes: alguns ? [...listaClientes.querySelectorAll("input:checked")].map((i) => i.value) : []
      };
    }
  };
}

/** Junta ao acesso atual o que a pessoa pediu (para o administrador só conferir e salvar). */
function comPedido(m) {
  const p = m.pedido || {};
  if (p.admin) return { ...m, papel: "admin" };
  return {
    ...m,
    permissoes: [...new Set([...(m.permissoes || []), ...(p.areas || [])])],
    acessoClientes: p.todosClientes ? "todos" : m.acessoClientes,
    clientes: [...new Set([...(m.clientes || []), ...(p.clientes || [])])]
  };
}

function cartaoMembro(m) {
  const ehDono = m.id === espacoInfo.dono;
  const souEu = m.id === eu.uid;
  const pendente = m.status === "pendente";
  const temPedido = !!m.pedido;
  // Pedido de mais acesso: já vem marcado com o que foi pedido
  const editor = editorAcesso(temPedido ? comPedido(m) : m, { travarAdmin: ehDono });
  const salvar = async (botao, { aprovarPedido = false } = {}) => {
    botao.disabled = true;
    const acesso = editor.ler();
    if (acesso.acessoClientes === "alguns" && !acesso.clientes.length && !(await confirmar("Nenhum cliente marcado: a pessoa não vai ver nenhum cliente. Salvar assim?"))) { botao.disabled = false; return; }
    try {
      await atualizar("membros", m.id, { ...acesso, status: "ativo", liberadoPor: eu.email, liberadoEm: hojeISO(), ...(aprovarPedido || pendente ? { pedido: null } : {}) });
      const dados_ = { ...m, ...acesso, nomesClientes: nomesDe(acesso.clientes) };
      let enviado = false;
      if (pendente) enviado = await emailLiberado(dados_).catch((e) => { avisar(e.message, "erro"); return false; });
      else if (aprovarPedido) enviado = await emailMaisAcesso(dados_, true).catch(() => false);
      avisar(`${pendente ? "Acesso liberado" : aprovarPedido ? "Pedido aprovado" : "Acessos salvos"} para ${m.nome || m.email}.${enviado ? " Avisamos por e-mail." : ""}`);
    } catch (e) { avisar(e.message, "erro"); }
    botao.disabled = false;
  };
  const etiqueta = pendente ? ["alerta", "Aguardando liberação"] : temPedido ? ["alerta", "Pediu mais acesso"]
    : m.papel === "admin" || ehDono ? ["compromisso", "Administrador"]
    : ["ok", [(m.permissoes || []).length ? m.permissoes.map(rotuloArea).join(" · ") : "Básico", m.acessoClientes === "alguns" ? `${(m.clientes || []).length} cliente(s)` : null].filter(Boolean).join(" · ")];
  return el("article", { class: `cartao-membro ${pendente || temPedido ? "pendente" : ""}` },
    el("div", { class: "membro-topo" },
      avatar(m, { grande: true }),
      el("div", {},
        el("strong", {}, m.nome || "(sem nome)", souEu ? " (você)" : "", ehDono ? " · dono do espaço" : ""),
        el("div", { class: "subtitulo" }, m.email),
        m.pedido ? el("div", { class: "pedido-texto" }, el("strong", {}, pendente ? "Pediu: " : "Pede agora: "), descreverPedido(m.pedido)) : null,
        !m.pedido && m.funcoesPedidas?.length ? el("div", { class: "subtitulo" }, "Pediu: ", m.funcoesPedidas.map((f) => f === "admin" ? "Administração" : rotuloArea(f)).join(", ")) : null),
      el("span", { class: `etiqueta ${etiqueta[0]}` }, etiqueta[1])),
    ehDono ? el("p", { class: "subtitulo" }, "O dono do espaço é sempre administrador.") : editor.elemento,
    el("div", { class: "acoes" },
      ehDono ? null : pendente
        ? el("button", { class: "destaque", onClick: (e) => salvar(e.currentTarget) }, "Liberar acesso")
        : temPedido
          ? [el("button", { class: "destaque", onClick: (e) => salvar(e.currentTarget, { aprovarPedido: true }) }, "Aprovar pedido"),
            el("button", { class: "secundario", onClick: async () => {
              await atualizar("membros", m.id, { pedido: null });
              await emailMaisAcesso(m, false).catch(() => {});
              avisar("Pedido recusado.");
            } }, "Recusar pedido")]
          : el("button", { onClick: (e) => salvar(e.currentTarget) }, "Salvar acessos"),
      el("span", { class: "espaco" }),
      !ehDono && !souEu ? el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar(pendente ? `Recusar o pedido de ${m.nome || m.email}?` : `Remover ${m.nome || m.email} do espaço? A pessoa perde o acesso na hora (os dados continuam).`)) {
          await excluir("membros", m.id); avisar(pendente ? "Pedido recusado." : "Usuário removido.");
        }
      } }, pendente ? "Recusar" : "Remover do espaço") : null));
}

/* ---------------- Convites ---------------- */

let convites = null; // carregados sob demanda (não ficam ouvindo)
async function recarregarConvites(renderizar) {
  try { convites = await listarConvites(); } catch (e) { convites = []; console.warn("Convites:", e.message); }
  renderizar();
}

function abrirConvite(renderizar, inicial = {}) {
  const editor = editorAcesso(inicial);
  return formulario(inicial.email ? `Convite · ${inicial.nome || inicial.email}` : "Adicionar usuário", [
    { nome: "nome", rotulo: "Nome", obrigatorio: true, largura: "metade" },
    { nome: "email", rotulo: "E-mail (conta Google da pessoa)", tipo: "email", obrigatorio: true, largura: "metade", dica: "nome@gmail.com" }
  ], inicial, {
    largo: true, rotuloSalvar: emailAtivo() ? "Adicionar e enviar e-mail" : "Adicionar",
    depois: el("div", { class: "campo" }, el("span", {}, "Acesso"), editor.elemento),
    aoSalvar: async (v) => {
      const email = v.email.trim().toLowerCase();
      if (dados.membros.some((m) => (m.email || "").toLowerCase() === email)) throw new Error("Esse e-mail já está no espaço. Ajuste o acesso no cartão da pessoa.");
      const convite = { nome: v.nome, email, ...editor.ler() };
      await salvarConvite(convite);
      if (inicial.email && inicial.email !== email) await excluirConvite(inicial.email);
      const enviado = await emailConvite({ ...convite, nomesClientes: nomesDe(convite.clientes) }).catch((e) => { avisar("Convite salvo, mas o e-mail falhou: " + e.message, "erro"); return null; });
      if (enviado !== null) avisar(enviado ? `Convite enviado para ${email}.` : `${v.nome} adicionado. Avise para entrar com ${email} (e-mails automáticos estão desligados em Ajustes).`);
      recarregarConvites(renderizar);
    }
  });
}

function blocoConvites(renderizar) {
  if (convites === null) { recarregarConvites(renderizar); return null; }
  if (!convites.length) return null;
  return el("section", { class: "bloco" },
    el("h2", {}, `Convites aguardando o primeiro acesso (${convites.length})`),
    el("p", { class: "subtitulo" }, "Quando a pessoa entrar com esse e-mail, ela já entra com o acesso definido."),
    convites.map((c) => el("div", { class: "linha-tabela" },
      el("strong", {}, c.nome || c.email), el("span", {}, c.email),
      el("span", { class: "etiqueta" }, c.papel === "admin" ? "Administrador" : [(c.permissoes || []).map(rotuloArea).join(", ") || "Básico", c.acessoClientes === "alguns" ? `${(c.clientes || []).length} cliente(s)` : null].filter(Boolean).join(" · ")),
      el("span", { class: "espaco" }),
      emailAtivo() ? el("button", { class: "link", onClick: async () => {
        try { await emailConvite({ ...c, nomesClientes: nomesDe(c.clientes) }); avisar("E-mail reenviado."); } catch (e) { avisar(e.message, "erro"); }
      } }, "Reenviar e-mail") : null,
      el("button", { class: "link", onClick: () => abrirConvite(renderizar, c) }, "Editar"),
      el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar(`Cancelar o convite de ${c.email}?`)) { await excluirConvite(c.email); recarregarConvites(renderizar); }
      } }, "Cancelar"))));
}

export function render({ renderizar }) {
  sincronizarAdmins().catch((e) => console.warn("Admins no script de e-mail:", e.message));
  const ordem = (m) => (m.status === "pendente" ? 0 : m.pedido ? 1 : 2);
  const membros = [...dados.membros].sort((a, b) => ordem(a) - ordem(b) || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const pendentes = membros.filter((m) => m.status === "pendente" || m.pedido).length;
  return el("div", { class: "tela" },
    cabecalho("Usuários e equipe", pendentes ? `${pendentes} pedido(s) aguardando um administrador` : `${membros.length} pessoa(s) no espaço da Hyper`,
      el("button", { class: "destaque", onClick: () => abrirConvite(renderizar) }, "+ Adicionar usuário")),
    el("div", { class: "explica-rotinas" },
      el("strong", {}, "Como funciona: "), "adicione a pessoa pelo e-mail da conta Google dela (ela recebe um convite e já entra liberada) ou peça para ela abrir o app e pedir acesso: o pedido aparece aqui para qualquer administrador aprovar. ",
      "Áreas: ", el("strong", {}, "Conteúdo"), " (posts, planejamento, criar arte, marca), ", el("strong", {}, "Tráfego pago"), " (contas, verbas, manutenções) e ",
      el("strong", {}, "Financeiro"), " (mensalidades, cobranças, orçamentos). Em ", el("strong", {}, "Clientes que pode ver"), " você limita a pessoa a alguns clientes: ela não vê os outros nem no banco."),
    !emailAtivo() ? el("p", { class: "faixa-aviso" }, "E-mails automáticos desligados: convites e liberações não avisam por e-mail. ", el("a", { href: "#/config" }, "Ligar em Ajustes →")) : null,
    el("p", { class: "subtitulo" }, "Link do app: ", el("a", { href: location.origin, target: "_blank", rel: "noopener" }, location.origin)),
    blocoConvites(renderizar),
    membros.length ? el("div", { class: "lista-membros" }, membros.map(cartaoMembro)) : vazio("Ninguém ainda."),
    blocoEquipe(),
    blocoPassarTarefas(renderizar));
}

const SEM = "__sem";
/** Passa todas as tarefas de uma pessoa (ou as sem responsável) para outra, de uma vez. */
function blocoPassarTarefas(renderizar) {
  const todas = () => [...dados.tarefas.map((t) => ["tarefas", t]), ...(dados.tarefasArquivo || []).map((t) => ["tarefasArquivo", t])];
  const contagem = {};
  for (const [, t] of todas()) { const k = t.responsavel || SEM; contagem[k] = (contagem[k] || 0) + 1; }
  const quem = Object.keys(contagem).sort((a, b) => (a === SEM ? -1 : b === SEM ? 1 : a.localeCompare(b, "pt-BR")));
  const de = el("select", { id: "passar-de" }, el("option", { value: "*" }, `Todas, de qualquer pessoa (${todas().length})`),
    ...quem.map((k) => el("option", { value: k }, `${k === SEM ? "Sem responsável" : k} (${contagem[k]})`)));
  const para = el("select", { id: "passar-para" }, ...opcoesResponsaveis().map((n) => el("option", { value: n }, n)));
  return el("section", { class: "bloco" },
    el("h2", {}, "Passar tarefas para outra pessoa"),
    el("p", { class: "subtitulo" }, "Muda o responsável de várias tarefas e posts de uma vez, inclusive as concluídas. Útil quando alguém sai da equipe ou para assumir tudo que está sem responsável."),
    el("div", { class: "form-grade" },
      el("label", { class: "campo metade", for: "passar-de" }, el("span", {}, "Tarefas de"), de),
      el("label", { class: "campo metade", for: "passar-para" }, el("span", {}, "Passar para"), para)),
    el("div", { class: "acoes" }, el("button", { onClick: async (e) => {
      const botao = e.currentTarget;
      await carregarArquivo();
      const alvo = todas().filter(([, t]) => (de.value === "*" || (t.responsavel || SEM) === de.value) && (t.responsavel || "") !== para.value);
      if (!alvo.length) { avisar(`Nada para mudar: já está tudo com ${para.value}.`); return; }
      if (!(await confirmar(`Passar ${alvo.length} tarefa(s) para ${para.value}?`))) return;
      botao.disabled = true;
      try {
        for (const col of ["tarefas", "tarefasArquivo"]) {
          await gravarEmLote(col, alvo.filter(([c]) => c === col).map(([, { arquivada, ...t }]) => ({ ...t, responsavel: para.value })));
        }
        avisar(`${alvo.length} tarefa(s) agora são de ${para.value}.`);
        renderizar();
      } catch (erro) { avisar(erro.message, "erro"); botao.disabled = false; }
    } }, "Passar tarefas")));
}

export function blocoEquipe() {
  const pessoas = (dados.config.find((c) => c.id === "equipe")?.pessoas || []).map((p) => ({ ...p }));
  const lista = el("div", { class: "lista-equipe" });
  const desenhar = () => lista.replaceChildren(...pessoas.map((p, i) => el("div", { class: "pessoa" },
    (() => { const n = el("input", { type: "text", value: p.nome, placeholder: "Nome", "aria-label": "Nome" }); n.addEventListener("input", () => (p.nome = n.value)); return n; })(),
    (() => { const e = el("input", { type: "email", value: p.email, placeholder: "email@gmail.com", "aria-label": "E-mail" }); e.addEventListener("input", () => (p.email = e.value)); return e; })(),
    el("button", { class: "icone", "aria-label": "Remover", onClick: () => { pessoas.splice(i, 1); desenhar(); } }, "✕"))));
  desenhar();
  return el("section", { class: "bloco" },
    el("h2", {}, "Equipe sem conta no app"),
    el("p", { class: "subtitulo" }, "Quem tem conta no app já entra na equipe sozinho (lista acima). Aqui ficam pessoas sem conta que participam de reuniões ou recebem tarefas — o convite da agenda vai pelo e-mail daqui."),
    lista,
    el("div", { class: "acoes" },
      el("button", { class: "secundario mini", onClick: () => { pessoas.push({ nome: "", email: "" }); desenhar(); } }, "+ Pessoa"),
      el("button", { onClick: async () => {
        const validas = pessoas.map((p) => ({ nome: p.nome.trim(), email: p.email.trim() })).filter((p) => p.nome);
        await salvarComId("config", "equipe", { pessoas: validas });
        avisar("Equipe salva.");
      } }, "Salvar equipe")));
}


