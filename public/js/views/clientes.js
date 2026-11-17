// Clientes: lista com indicadores e ficha completa de cada cliente.
import { el, formulario, confirmar, avisar, fmtMoeda, fmtData, linkExterno, vazio, hojeISO } from "../ui.js";
import { dados, criar, atualizar, excluir, porId } from "../db.js";
import { cartaoTarefa, atrasada, abrirTarefa, cabecalho, abas } from "./componentes.js";
import { SERVICOS, rotuloStatusConteudo } from "../constantes.js";
import { abrirConteudo } from "./calendario.js";
import { abrirConta, abrirManutencao } from "./trafego.js";

const CORES = ["#4E2CA3", "#592C85", "#16626A", "#606060", "#C98A00", "#2D6CDF", "#B4415A", "#2E8B57"];

export function abrirCliente(cliente = {}) {
  const editando = !!cliente.id;
  return formulario(editando ? `Editar ${cliente.nome}` : "Novo cliente", [
    { nome: "nome", rotulo: "Nome do cliente", obrigatorio: true, largura: "metade" },
    { nome: "cor", rotulo: "Cor de identificação", tipo: "select", opcoes: CORES.map((c) => [c, c]), padrao: CORES[dados.clientes.length % CORES.length], largura: "metade" },
    { nome: "servicos", rotulo: "Serviços contratados", tipo: "multi", opcoes: SERVICOS },
    { tipo: "secao", rotulo: "Contato" },
    { nome: "contato", rotulo: "Pessoa de contato", largura: "metade" },
    { nome: "whatsapp", rotulo: "WhatsApp", dica: "(11) 99999-9999", largura: "metade" },
    { nome: "email", rotulo: "E-mail", tipo: "email", largura: "metade" },
    { nome: "instagram", rotulo: "Instagram", dica: "@perfil", largura: "metade" },
    { tipo: "secao", rotulo: "Links" },
    { nome: "linkDrive", rotulo: "Pasta no Drive", largura: "metade" },
    { nome: "linkCanva", rotulo: "Pasta/Brand kit no Canva", largura: "metade" },
    { tipo: "secao", rotulo: "Contrato" },
    { nome: "mensalidade", rotulo: "Mensalidade (R$)", tipo: "number", largura: "metade" },
    { nome: "diaVencimento", rotulo: "Dia de vencimento", tipo: "number", dica: "10", largura: "metade" },
    { tipo: "secao", rotulo: "Para criar copy" },
    { nome: "tomDeVoz", rotulo: "Tom de voz da marca", tipo: "textarea", linhas: 2, dica: "Ex.: próximo, bem-humorado, sem gírias, usa emojis com moderação" },
    { nome: "publico", rotulo: "Público-alvo", tipo: "textarea", linhas: 2, dica: "Ex.: mulheres 25-45, região de Sorocaba, classe B" },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", linhas: 3 },
    { nome: "ativo", rotulo: "Cliente ativo", tipo: "checkbox", padrao: true }
  ], cliente, {
    largo: true,
    extras: editando ? [el("button", {
      type: "button", class: "perigo-texto", onClick: async () => {
        if (await confirmar(`Excluir o cliente "${cliente.nome}"? As tarefas e conteúdos dele continuam salvos, mas ficam sem cliente. Para só esconder, desmarque "Cliente ativo".`)) {
          await excluir("clientes", cliente.id);
          document.querySelector(".modal-fundo")?.remove();
          location.hash = "#/clientes";
        }
      }
    }, "Excluir")] : [],
    aoSalvar: async (v) => {
      if (editando) await atualizar("clientes", cliente.id, v);
      else await criar("clientes", v);
      avisar(editando ? "Cliente atualizado." : "Cliente criado.");
    }
  });
}

export function render({ params, estado, renderizar }) {
  if (params[0]) return ficha(params[0], estado, renderizar);

  estado.mostrarInativos ??= false;
  const lista = dados.clientes
    .filter((c) => estado.mostrarInativos || c.ativo !== false)
    .map((c) => {
      const ts = dados.tarefas.filter((t) => t.clienteId === c.id);
      return { c, abertas: ts.filter((t) => t.status !== "concluido").length, atrasadas: ts.filter(atrasada).length, total: ts.length };
    })
    .sort((a, b) => b.abertas - a.abertas || a.c.nome.localeCompare(b.c.nome, "pt-BR"));
  const receitaMensal = dados.clientes.filter((c) => c.ativo !== false).reduce((s, c) => s + (c.mensalidade || 0), 0);

  return el("div", { class: "tela" },
    cabecalho("Clientes", `${dados.clientes.filter((c) => c.ativo !== false).length} ativos · ${fmtMoeda(receitaMensal)}/mês em mensalidades`,
      el("label", { class: "check-inline" }, el("input", { type: "checkbox", checked: estado.mostrarInativos, onChange: (e) => { estado.mostrarInativos = e.target.checked; renderizar(); } }), "Mostrar inativos"),
      el("button", { class: "destaque", onClick: () => abrirCliente() }, "+ Novo cliente")),
    lista.length ? el("div", { class: "grade-clientes" }, lista.map(({ c, abertas, atrasadas, total }) =>
      el("a", { class: `cartao-cliente ${c.ativo === false ? "inativo" : ""}`, href: `#/clientes/${c.id}`, style: { "--selo": c.cor || "#4E2CA3" } },
        el("h3", {}, c.nome),
        el("div", { class: "cartao-meta" }, (c.servicos || []).map((s) => el("span", { class: "etiqueta" }, s))),
        el("div", { class: "numeros-cliente" },
          el("span", {}, el("strong", {}, abertas), " abertas"),
          atrasadas ? el("span", { class: "alerta" }, el("strong", {}, atrasadas), " atrasadas") : null,
          el("span", {}, el("strong", {}, total), " no total")),
        c.mensalidade ? el("div", { class: "mensalidade" }, `${fmtMoeda(c.mensalidade)}/mês`) : null)))
      : vazio("Nenhum cliente ainda. Cadastre os clientes ou importe sua planilha em Ajustes.",
        el("a", { href: "#/config", class: "link" }, "Importar planilha →")));
}

function ficha(id, estado, renderizar) {
  const c = porId("clientes", id);
  if (!c) return el("div", { class: "tela" }, vazio("Cliente não encontrado.", el("a", { href: "#/clientes", class: "link" }, "← Voltar")));
  estado.aba ??= "tarefas";
  const ts = dados.tarefas.filter((t) => t.clienteId === id);
  const abertas = ts.filter((t) => t.status !== "concluido").sort((a, b) => (a.prazo || "9").localeCompare(b.prazo || "9"));
  const feitas = ts.filter((t) => t.status === "concluido").sort((a, b) => (b.concluidoEm || b.prazo || "").localeCompare(a.concluidoEm || a.prazo || ""));
  const conts = dados.conteudos.filter((x) => x.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const contas = dados.contasAds.filter((x) => x.clienteId === id);
  const mans = dados.manutencoes.filter((x) => x.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const fins = dados.financeiro.filter((x) => x.clienteId === id).sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || ""));

  const info = (rotulo, valor) => valor ? el("div", { class: "info" }, el("span", {}, rotulo), el("strong", {}, valor)) : null;
  const zap = c.whatsapp ? linkExterno(`https://wa.me/55${c.whatsapp.replace(/\D/g, "").replace(/^55/, "")}`, c.whatsapp) : null;
  const insta = c.instagram ? linkExterno(`https://instagram.com/${c.instagram.replace(/^@/, "")}`, c.instagram) : null;

  const conteudoAba = {
    tarefas: () => [
      el("div", { class: "com-acao" }, el("h2", {}, `Abertas (${abertas.length})`),
        el("button", { onClick: () => abrirTarefa({ clienteId: id, prazo: hojeISO() }) }, "+ Tarefa")),
      abertas.length ? abertas.map((t) => cartaoTarefa(t, { mostrarCliente: false })) : vazio("Nenhuma tarefa aberta."),
      el("h2", {}, `Concluídas (${feitas.length})`),
      feitas.slice(0, 50).map((t) => cartaoTarefa(t, { mostrarCliente: false })),
      feitas.length > 50 ? el("p", { class: "subtitulo" }, `Mostrando as 50 mais recentes. Use a tela Tarefas para ver todas.`) : null],
    conteudo: () => [
      el("div", { class: "com-acao" }, el("h2", {}, `Conteúdos (${conts.length})`),
        el("button", { onClick: () => abrirConteudo({ clienteId: id, data: hojeISO() }) }, "+ Conteúdo")),
      conts.length ? conts.slice(0, 60).map((x) => el("div", { class: "linha-tabela", onClick: () => abrirConteudo(x) },
        el("span", { class: "data-mini" }, fmtData(x.data, true)), el("strong", {}, x.titulo),
        el("span", { class: "etiqueta" }, x.formato), el("span", { class: `etiqueta st-${x.status}` }, rotuloStatusConteudo(x.status))))
        : vazio("Nenhum conteúdo programado.")],
    trafego: () => [
      el("div", { class: "com-acao" }, el("h2", {}, "Contas de anúncio"),
        el("button", { onClick: () => abrirConta({ clienteId: id }) }, "+ Conta")),
      contas.length ? contas.map((x) => el("div", { class: "linha-tabela", onClick: () => abrirConta(x) },
        el("strong", {}, x.plataforma), el("span", {}, x.idConta || ""), el("span", {}, x.verbaMensal ? `${fmtMoeda(x.verbaMensal)}/mês` : ""), el("span", {}, x.objetivo || "")))
        : vazio("Nenhuma conta cadastrada."),
      el("div", { class: "com-acao" }, el("h2", {}, "Manutenções"),
        el("button", { onClick: () => abrirManutencao({ clienteId: id, data: hojeISO() }) }, "+ Registro")),
      mans.length ? mans.slice(0, 30).map((m) => el("div", { class: "linha-tabela", onClick: () => abrirManutencao(m) },
        el("span", { class: "data-mini" }, fmtData(m.data, true)), el("strong", {}, m.plataforma), el("span", { class: "resumo-texto" }, m.acoes || "")))
        : vazio("Nenhuma manutenção registrada.")],
    financeiro: () => [
      el("h2", {}, "Lançamentos"),
      fins.length ? fins.slice(0, 40).map((x) => el("div", { class: "linha-tabela" },
        el("span", { class: "data-mini" }, fmtData(x.vencimento, true)), el("strong", {}, x.descricao), el("span", {}, fmtMoeda(x.valor)),
        el("span", { class: `etiqueta ${x.status === "pago" ? "ok" : x.vencimento < hojeISO() ? "alerta" : ""}` }, x.status === "pago" ? "Pago" : "Pendente")))
        : vazio("Nenhum lançamento. Gere as mensalidades na tela Financeiro.")]
  };

  return el("div", { class: "tela" },
    el("a", { href: "#/clientes", class: "voltar" }, "← Clientes"),
    el("header", { class: "tela-topo ficha-topo", style: { "--selo": c.cor || "#4E2CA3" } },
      el("div", {},
        el("h1", {}, c.nome, c.ativo === false ? el("span", { class: "etiqueta" }, "Inativo") : null),
        el("div", { class: "cartao-meta" }, (c.servicos || []).map((s) => el("span", { class: "etiqueta" }, s)))),
      el("div", { class: "tela-acoes" }, el("button", { class: "secundario", onClick: () => abrirCliente(c) }, "Editar"))),
    el("div", { class: "ficha" },
      el("aside", { class: "bloco lateral" },
        info("Contato", c.contato), c.whatsapp ? el("div", { class: "info" }, el("span", {}, "WhatsApp"), zap) : null,
        info("E-mail", c.email), c.instagram ? el("div", { class: "info" }, el("span", {}, "Instagram"), insta) : null,
        el("div", { class: "links-cliente" }, linkExterno(c.linkDrive, "📁 Drive"), linkExterno(c.linkCanva, "🎨 Canva")),
        info("Mensalidade", c.mensalidade ? `${fmtMoeda(c.mensalidade)} · dia ${c.diaVencimento || "—"}` : null),
        info("Tom de voz", c.tomDeVoz), info("Público", c.publico), info("Observações", c.observacoes),
        !c.contato && !c.tomDeVoz && !c.linkDrive ? el("p", { class: "subtitulo" }, "Complete a ficha (contato, links, tom de voz) em Editar. O tom de voz é usado para gerar copy.") : null),
      el("section", { class: "bloco" },
        abas([["tarefas", "Tarefas"], ["conteudo", "Conteúdo"], ["trafego", "Tráfego pago"], ["financeiro", "Financeiro"]], estado.aba, (a) => { estado.aba = a; renderizar(); }),
        conteudoAba[estado.aba]())));
}
