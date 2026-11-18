// Usuários (só administradores): quem pediu acesso, quem já está no espaço e o que cada um pode ver.
// Toda pessoa entra como "básico" e o administrador libera as áreas aqui.
import { el, avisar, confirmar, hojeISO, vazio } from "../ui.js";
import { dados, atualizar, excluir, espacoInfo, salvarComId } from "../db.js";
import { cabecalho, iniciais } from "./componentes.js";
import { AREAS, eu, rotuloArea } from "../permissoes.js";

function cartaoMembro(m) {
  const ehDono = m.id === espacoInfo.dono;
  const souEu = m.id === eu.uid;
  const marcado = new Set(m.permissoes || []);
  let admin = m.papel === "admin";
  const checks = AREAS.map(([v, r, desc]) => {
    const c = el("input", { type: "checkbox", value: v, checked: admin || marcado.has(v), disabled: admin });
    return el("label", { class: "chip-check", title: desc }, c, r);
  });
  const caixaAdmin = el("input", { type: "checkbox", checked: admin, disabled: ehDono });
  caixaAdmin.addEventListener("change", () => {
    admin = caixaAdmin.checked;
    checks.forEach((l) => { const i = l.querySelector("input"); i.disabled = admin; if (admin) i.checked = true; });
  });
  const salvar = async (botao) => {
    botao.disabled = true;
    const permissoes = admin ? AREAS.map(([v]) => v) : checks.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
    try {
      await atualizar("membros", m.id, { papel: admin ? "admin" : "basico", permissoes, status: "ativo", liberadoPor: eu.email, liberadoEm: hojeISO() });
      avisar(`Acessos de ${m.nome || m.email} salvos.`);
    } catch (e) { avisar(e.message, "erro"); }
    botao.disabled = false;
  };
  const pendente = m.status === "pendente";
  return el("article", { class: `cartao-membro ${pendente ? "pendente" : ""}` },
    el("div", { class: "membro-topo" },
      el("span", { class: "avatar grande" }, iniciais(m.nome || m.email)),
      el("div", {},
        el("strong", {}, m.nome || "(sem nome)", souEu ? " (você)" : "", ehDono ? " · dono do espaço" : ""),
        el("div", { class: "subtitulo" }, m.email),
        pendente && m.funcoesPedidas?.length ? el("div", { class: "subtitulo" }, "Pediu: ", m.funcoesPedidas.map((f) => f === "admin" ? "Administração" : rotuloArea(f)).join(", ")) : null),
      el("span", { class: `etiqueta ${pendente ? "alerta" : admin ? "compromisso" : "ok"}` },
        pendente ? "Aguardando liberação" : admin ? "Administrador" : (m.permissoes || []).length ? (m.permissoes || []).map(rotuloArea).join(" · ") : "Básico")),
    el("div", { class: "membro-acessos" },
      el("label", { class: "chip-check destaque-admin" }, caixaAdmin, "Administrador (tudo, inclusive usuários)"),
      el("div", { class: "multi" }, checks)),
    el("div", { class: "acoes" },
      el("button", { class: pendente ? "destaque" : "", onClick: (e) => salvar(e.currentTarget) }, pendente ? "Liberar acesso" : "Salvar acessos"),
      el("span", { class: "espaco" }),
      !ehDono && !souEu ? el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar(`Remover ${m.nome || m.email} do espaço? A pessoa perde o acesso na hora (os dados continuam).`)) {
          await excluir("membros", m.id); avisar("Usuário removido.");
        }
      } }, "Remover do espaço") : null));
}

export function render() {
  const membros = [...dados.membros].sort((a, b) => (a.status === "pendente" ? 0 : 1) - (b.status === "pendente" ? 0 : 1) || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const pendentes = membros.filter((m) => m.status === "pendente").length;
  return el("div", { class: "tela" },
    cabecalho("Usuários e equipe", pendentes ? `${pendentes} pedido(s) de acesso aguardando você` : `${membros.length} pessoa(s) no espaço da Hyper`),
    el("div", { class: "explica-rotinas" },
      el("strong", {}, "Como funciona: "), "a pessoa abre o app, entra com o Google dela e pede acesso. Ela não vê nada até você clicar em Liberar. Liberada sem áreas, fica com o acesso básico (Hoje, Tarefas, compromissos e lista de clientes). As áreas são: ",
      el("strong", {}, "Conteúdo"), " (posts, planejamento, criar, marca), ", el("strong", {}, "Tráfego pago"), " (contas, verbas, manutenções) e ",
      el("strong", {}, "Financeiro"), " (mensalidades, cobranças, orçamentos). Valores dos clientes só aparecem para quem tem Financeiro."),
    el("p", { class: "subtitulo" }, "Link para mandar para a pessoa: ", el("a", { href: location.origin, target: "_blank", rel: "noopener" }, location.origin)),
    membros.length ? el("div", { class: "lista-membros" }, membros.map(cartaoMembro)) : vazio("Ninguém ainda."),
    blocoEquipe());
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


