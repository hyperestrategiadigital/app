// Minha conta (clique no seu nome no menu): foto, nome, o que você pode ver, pedido de mais acesso
// e as suas conexões pessoais (Google Agenda). Vale para todos, administradores ou não.
import { el, avisar, confirmar, hojeISO } from "../ui.js";
import { dados, porId, atualizarMeuCadastro } from "../db.js";
import { cabecalho, avatar } from "./componentes.js";
import { eu, ehAdmin, AREAS, rotuloArea, clientesRestritos } from "../permissoes.js";
import { configAgenda, agendaConectada } from "../agenda.js";
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

function blocoAgenda(m) {
  const status = configAgenda();
  const email = el("input", { id: "conta-email-agenda", type: "email", value: m.emailAgenda || "", placeholder: m.email || eu.email });
  const meus = dados.compromissos.filter((c) => c.sincronizar && (c.participantes || []).includes(m.nome) && (c.data || "") >= hojeISO()).length;
  return el("div", { class: "conexao" },
    el("div", { class: "com-acao" }, el("h3", {}, "Google Agenda"),
      agendaConectada() ? el("span", { class: "etiqueta ok" }, "Automática") : el("span", { class: "etiqueta" }, "Aguardando as automações")),
    el("p", {}, "Os compromissos em que você participa chegam como convite na sua agenda, com lembretes no celular. Não precisa conectar nada: o app da Hyper manda o convite para o e-mail abaixo. Posts de conteúdo nunca vão para a agenda."),
    el("label", { class: "campo", for: "conta-email-agenda" }, el("span", {}, "E-mail da agenda que recebe os convites (deixe vazio para usar o do login)"), email),
    el("div", { class: "acoes" }, el("button", { onClick: async () => {
      const v = email.value.trim().toLowerCase();
      if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { avisar("Esse e-mail não parece certo.", "erro"); return; }
      await atualizarMeuCadastro({ emailAgenda: v });
      avisar(`Convites vão para ${v || m.email || eu.email}.`);
    } }, "Salvar e-mail da agenda")),
    el("p", { class: "subtitulo" }, agendaConectada()
      ? `${meus} compromisso(s) seus marcados para a agenda. Última sincronização: ${new Date(status.ultimo).toLocaleString("pt-BR")}.`
      : "A sincronização começa quando um administrador ligar as automações em Ajustes → E-mails e automações."),
    el("details", { class: "prompt-final" }, el("summary", {}, "Usa iPhone com iCloud?"),
      el("p", {}, "Se a agenda do seu iPhone é a do Google, os convites aparecem sozinhos. Se for a do iCloud, coloque aqui o e-mail do iCloud: o convite chega por e-mail e você toca em Aceitar.")));
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
      blocoAgenda(m),
      blocoMeta()));
}
