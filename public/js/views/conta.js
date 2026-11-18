// Minha conta (clique no seu nome no menu): foto, nome, o que você pode ver, pedido de mais acesso
// e as suas conexões pessoais (Google Agenda). Vale para todos, administradores ou não.
import { el, avisar, confirmar } from "../ui.js";
import { dados, porId, atualizarMeuCadastro } from "../db.js";
import { cabecalho, avatar } from "./componentes.js";
import { eu, ehAdmin, AREAS, rotuloArea, clientesRestritos } from "../permissoes.js";
import { configAgenda, conectarAgenda, desconectarAgenda, sincronizar } from "../agenda.js";
import { comprimirImagem } from "../arquivos.js";
import { avisarAdmins } from "../emails.js";
import { metaDisponivel, metaConectada, conectarMeta, desconectarMeta, contaMeta } from "../meta.js";

const meuCadastro = () => dados.membros.find((m) => m.id === eu.uid) || eu;
/** Nomes de todos os clientes ativos (config/clientes): quem vê só alguns usa para pedir outros. */
export const nomesClientes = () => dados.config.find((c) => c.id === "clientes")?.lista || dados.clientes.map((c) => ({ id: c.id, nome: c.nome }));
const nomeDoCliente = (id) => nomesClientes().find((c) => c.id === id)?.nome || porId("clientes", id)?.nome || "cliente removido";

/** Texto do pedido (usado aqui, em Usuários e no e-mail aos administradores). */
export function descreverPedido(p = {}) {
  return [
    p.admin ? "Administração (tudo)" : null,
    p.areas?.length ? `Áreas: ${p.areas.map(rotuloArea).join(", ")}` : null,
    p.todosClientes ? "Todos os clientes" : p.clientes?.length ? `Clientes: ${p.clientes.map(nomeDoCliente).join(", ")}` : null,
    p.clientesTexto ? `Clientes: ${p.clientesTexto}` : null,
    p.mensagem ? `Mensagem: ${p.mensagem}` : null
  ].filter(Boolean).join(" · ");
}

function blocoPerfil(m) {
  const nome = el("input", { id: "conta-nome", type: "text", value: m.nome || "" });
  const arquivo = el("input", { type: "file", accept: "image/*", hidden: true });
  arquivo.addEventListener("change", async () => {
    if (!arquivo.files[0]) return;
    try {
      const foto = await comprimirImagem(arquivo.files[0], { maxLado: 256, qualidade: 0.8 });
      await atualizarMeuCadastro({ foto });
      avisar("Foto atualizada.");
    } catch (e) { avisar("Não consegui usar essa foto: " + e.message, "erro"); }
  });
  return el("section", { class: "bloco conta-perfil" },
    el("div", { class: "conta-foto" },
      avatar(m, { grande: true }),
      el("div", { class: "acoes" },
        el("label", { class: "botao-link secundario mini" }, "Trocar foto", arquivo),
        m.foto ? el("button", { class: "link", onClick: async () => { await atualizarMeuCadastro({ foto: "" }); avisar("Foto removida."); } }, "Remover") : null)),
    el("div", { class: "conta-dados" },
      el("label", { class: "campo", for: "conta-nome" }, el("span", {}, "Seu nome (aparece nas tarefas e reuniões)"), nome),
      el("p", { class: "subtitulo" }, `Conta Google: ${eu.email}`),
      el("label", { class: "check-inline" },
        el("input", { type: "checkbox", checked: m.resumoDiario !== false, onChange: async (e) => {
          await atualizarMeuCadastro({ resumoDiario: e.target.checked });
          avisar(e.target.checked ? "Você vai receber o resumo do dia às 8h." : "Resumo diário desligado.");
        } }), "Receber o resumo do dia por e-mail às 8h (o que vence, o que está atrasado e as reuniões)"),
      el("div", { class: "acoes" }, el("button", { onClick: async () => {
        if (!nome.value.trim()) { avisar("Digite seu nome.", "erro"); return; }
        await atualizarMeuCadastro({ nome: nome.value.trim() });
        avisar("Nome salvo.");
      } }, "Salvar nome"))));
}

function blocoAcesso(m) {
  const restrito = clientesRestritos();
  return el("section", { class: "bloco" },
    el("h2", {}, "Seu acesso"),
    el("div", { class: "cartao-meta" },
      ehAdmin() ? el("span", { class: "etiqueta compromisso" }, eu.dono ? "Dono do espaço · Administrador" : "Administrador")
        : (m.permissoes || []).length ? m.permissoes.map((a) => el("span", { class: "etiqueta ok" }, rotuloArea(a)))
        : el("span", { class: "etiqueta" }, "Acesso básico")),
    el("p", { class: "subtitulo" }, ehAdmin() || !restrito ? "Você vê todos os clientes."
      : `Você vê só estes clientes: ${(m.clientes || []).map(nomeDoCliente).join(", ") || "nenhum ainda"}.`),
    ehAdmin() ? null : blocoPedido(m, restrito));
}

function blocoPedido(m, restrito) {
  if (m.pedido) return el("div", { class: "faixa-aviso" },
    el("strong", {}, "Pedido enviado: "), descreverPedido(m.pedido), ". Aguardando um administrador. ",
    el("button", { class: "link", onClick: async () => {
      if (await confirmar("Cancelar o seu pedido?")) { await atualizarMeuCadastro({ pedido: null }); avisar("Pedido cancelado."); }
    } }, "Cancelar pedido"));
  const temArea = new Set(m.permissoes || []);
  const areas = el("div", { class: "multi" },
    [...AREAS.filter(([v]) => !temArea.has(v)).map(([v, r]) => [v, r]), ["admin", "Administração (tudo)"]].map(([v, r]) =>
      el("label", { class: "chip-check" }, el("input", { type: "checkbox", value: v }), r)));
  const meus = new Set(m.clientes || []);
  const outros = restrito ? nomesClientes().filter((c) => !meus.has(c.id)) : [];
  const clientes = el("div", { class: "multi" }, outros.map((c) => el("label", { class: "chip-check" }, el("input", { type: "checkbox", value: c.id }), c.nome)));
  const mensagem = el("textarea", { id: "pedido-mensagem", rows: 2, placeholder: "Ex.: vou assumir as redes desse cliente a partir de dezembro" });
  return el("details", { class: "pedir-acesso" },
    el("summary", {}, "Pedir mais acesso"),
    el("div", { class: "campo" }, el("span", {}, "Áreas"), areas),
    restrito ? el("div", { class: "campo" }, el("span", {}, "Clientes"), outros.length ? clientes : el("p", { class: "subtitulo" }, "Você já tem todos os clientes cadastrados.")) : null,
    el("label", { class: "campo", for: "pedido-mensagem" }, el("span", {}, "Mensagem para o administrador (opcional)"), mensagem),
    el("div", { class: "acoes" }, el("button", { class: "destaque", onClick: async (e) => {
      const marcados = (caixa) => [...caixa.querySelectorAll("input:checked")].map((i) => i.value);
      const escolhidas = marcados(areas);
      const pedido = { areas: escolhidas.filter((a) => a !== "admin"), admin: escolhidas.includes("admin"), clientes: marcados(clientes), mensagem: mensagem.value.trim(), em: Date.now() };
      if (!pedido.areas.length && !pedido.admin && !pedido.clientes.length) { avisar("Marque o que você quer pedir.", "erro"); return; }
      e.currentTarget.disabled = true;
      try {
        await atualizarMeuCadastro({ pedido });
        avisarAdmins({ nome: eu.nome, email: eu.email, detalhe: `Pedido de mais acesso. ${descreverPedido(pedido)}` });
        avisar("Pedido enviado para os administradores.");
      } catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
    } }, "Enviar pedido")));
}

function blocoAgenda() {
  const cfg = configAgenda();
  const pendentes = dados.compromissos.filter((c) => c.sincronizar && !c.googleEventId);
  const conectar = async (botao) => {
    botao.disabled = true;
    try { const email = await conectarAgenda(); avisar(`Google Agenda conectada: ${email}`); }
    catch (e) { avisar("Não conectou: " + (e.code === "auth/popup-closed-by-user" ? "janela fechada." : e.message), "erro"); botao.disabled = false; }
  };
  return el("div", { class: "conexao" },
    el("div", { class: "com-acao" }, el("h3", {}, "Google Agenda"), cfg.email ? el("span", { class: "etiqueta ok" }, "Conectada") : el("span", { class: "etiqueta" }, "Não conectada")),
    el("p", {}, cfg.email
      ? ["Conectada à agenda de ", el("strong", {}, cfg.email), ". Os compromissos de que você participa e marca \"Enviar para a Google Agenda\" vão para lá, com lembretes no celular. Posts de conteúdo nunca vão."]
      : "Conecte a sua conta Google pessoal (pode ser outra, como a do celular) para os compromissos aparecerem na sua agenda e você receber os lembretes. Posts de conteúdo nunca vão para lá."),
    el("details", { class: "prompt-final" }, el("summary", {}, "Não conecta? (só na primeira vez da Hyper)"),
      el("ol", { class: "passos" },
        el("li", {}, "O administrador ativa a ", el("a", { href: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=hyper-9e023", target: "_blank", rel: "noopener" }, "Google Calendar API do projeto hyper-9e023"), " (uma vez só)."),
        el("li", {}, "Se aparecer \"O Google não verificou este app\", clique em Avançado → Acessar hyper-9e023. É o app da Hyper."))),
    el("div", { class: "acoes" },
      cfg.email
        ? [el("button", { class: "secundario", onClick: (e) => conectar(e.currentTarget) }, "Trocar de conta"),
          el("button", { class: "perigo-texto", onClick: async () => { await desconectarAgenda(); avisar("Agenda desconectada."); } }, "Desconectar")]
        : el("button", { onClick: (e) => conectar(e.currentTarget) }, "Conectar Google Agenda"),
      cfg.email && pendentes.length ? el("button", { class: "destaque", onClick: async (e) => {
        e.currentTarget.disabled = true;
        let ok = 0;
        for (const c of pendentes) { try { await sincronizar(c); ok++; } catch (erro) { avisar(erro.message, "erro"); break; } }
        if (ok) avisar(`${ok} compromisso(s) enviado(s) para a agenda.`);
      } }, `Enviar ${pendentes.length} pendente(s)`) : null),
    el("p", { class: "subtitulo" }, "O Google libera o acesso por cerca de 1 hora. Depois disso, ao salvar um compromisso, o app pede para conectar de novo."));
}

function blocoMeta() {
  if (!metaDisponivel()) return null;
  return el("div", { class: "conexao" },
    el("div", { class: "com-acao" }, el("h3", {}, "Facebook e Instagram (relatórios)"),
      metaConectada() ? el("span", { class: "etiqueta ok" }, "Conectado") : el("span", { class: "etiqueta" }, "Não conectado")),
    el("p", {}, metaConectada() ? ["Conectado como ", el("strong", {}, contaMeta()), ". Os números aparecem na aba Resultados de cada cliente."]
      : "Conecte o Facebook que administra as páginas dos clientes para ver os resultados. O acesso vale por algumas horas e fica só neste navegador."),
    el("div", { class: "acoes" }, metaConectada()
      ? el("button", { class: "perigo-texto", onClick: () => { desconectarMeta(); avisar("Facebook desconectado."); location.reload(); } }, "Desconectar")
      : el("button", { onClick: async (e) => {
        e.currentTarget.disabled = true;
        try { avisar(`Facebook conectado: ${await conectarMeta()}.`); location.reload(); } catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
      } }, "Conectar Facebook / Instagram")));
}

export function render() {
  const m = meuCadastro();
  return el("div", { class: "tela tela-estreita" },
    cabecalho("Minha conta", "Seu perfil, seu acesso e suas conexões"),
    blocoPerfil(m),
    blocoAcesso(m),
    el("section", { class: "bloco" },
      el("h2", {}, "Suas conexões"),
      el("p", { class: "subtitulo" }, "Contas que são só suas. Cada pessoa da equipe conecta as próprias."),
      blocoAgenda(),
      blocoMeta()));
}
