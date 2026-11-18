// Clientes: lista com indicadores e ficha completa de cada cliente.
import { linkPlano } from "./planejamento.js";
import { el, formulario, confirmar, avisar, fmtMoeda, fmtData, linkExterno, vazio, hojeISO, fecharModais } from "../ui.js";
import { dados, criar, atualizar, excluir, porId, contrato, salvarComId } from "../db.js";
import { pode, ehAdmin, tarefaVisivel } from "../permissoes.js";
import { cartaoTarefa, atrasada, abrirTarefa, cabecalho, abas, corCliente } from "./componentes.js";
import { SERVICOS, rotuloStatusConteudo } from "../constantes.js";
import { novoPost } from "./calendario.js";
import { dataPost } from "../exportacao.js";
import { TIPO_CONTEUDO } from "../constantes.js";
import { abrirConta, abrirManutencao } from "./trafego.js";
import { abaMarca } from "./marca.js";
import { abaContas, linkGoogleAds, linkGerenciadorMeta } from "./contas.js";

const podeEditar = () => ehAdmin() || pode("conteudo") || pode("trafego");
const CORES = ["#4E2CA3", "#592C85", "#16626A", "#606060", "#C98A00", "#2D6CDF", "#B4415A", "#2E8B57"];

export function abrirCliente(cliente = {}) {
  const editando = !!cliente.id;
  const valores = { ...cliente, ...contrato(cliente.id), id: cliente.id };
  const fin = pode("financeiro");
  // Só cadastro, contato e contrato. Identidade (cores, fontes, tom de voz…) fica na aba Marca;
  // redes sociais na aba Contas; contas de anúncio na aba Tráfego pago.
  return formulario(editando ? `Editar ${cliente.nome}` : "Novo cliente", [
    { nome: "nome", rotulo: "Nome do cliente", obrigatorio: true, largura: "metade" },
    { nome: "segmento", rotulo: "Segmento", dica: "Ex.: clínica, academia, escola", largura: "metade" },
    { nome: "servicos", rotulo: "Serviços contratados", tipo: "multi", opcoes: SERVICOS },
    { tipo: "secao", rotulo: "Contato" },
    { nome: "contato", rotulo: "Pessoa de contato", largura: "metade" },
    { nome: "whatsapp", rotulo: "WhatsApp", dica: "(11) 99999-9999", largura: "metade" },
    { nome: "email", rotulo: "E-mail", tipo: "email", largura: "metade" },
    ...(fin ? [
      { tipo: "secao", rotulo: "Contrato (só quem tem acesso ao financeiro vê)" },
      { nome: "mensalidade", rotulo: "Mensalidade (R$)", tipo: "number", largura: "metade" },
      { nome: "diaVencimento", rotulo: "Dia de vencimento", tipo: "number", dica: "10", largura: "metade" }] : []),
    { tipo: "secao", rotulo: "Outros" },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", linhas: 3 },
    { nome: "ativo", rotulo: "Cliente ativo", tipo: "checkbox", padrao: true }
  ], valores, {
    largo: true,
    extras: editando ? [el("button", {
      type: "button", class: "perigo-texto", onClick: async () => {
        if (await confirmar(`Excluir o cliente "${cliente.nome}"? As tarefas e conteúdos dele continuam salvos, mas ficam sem cliente. Para só esconder, desmarque "Cliente ativo".`)) {
          await excluir("clientes", cliente.id);
          fecharModais();
          location.hash = "#/clientes";
        }
      }
    }, "Excluir")] : [],
    aoSalvar: async (v) => {
      // Cliente novo já nasce com uma cor (dá para trocar na aba Marca)
      if (!editando) { const cor = CORES[dados.clientes.length % CORES.length]; v.cor = cor; v.paleta = [cor]; }
      delete v.id;
      // Valores do contrato ficam em "contratos" (protegidos), nunca na ficha
      const dadosContrato = fin ? { mensalidade: v.mensalidade, diaVencimento: v.diaVencimento } : null;
      delete v.mensalidade; delete v.diaVencimento;
      let id = cliente.id;
      if (editando) await atualizar("clientes", cliente.id, v);
      else id = (await criar("clientes", v)).id;
      if (dadosContrato) await salvarComId("contratos", id, { clienteId: id, ...dadosContrato });
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
  const receitaMensal = dados.clientes.filter((c) => c.ativo !== false).reduce((s, c) => s + (Number(contrato(c.id).mensalidade) || 0), 0);

  return el("div", { class: "tela" },
    cabecalho("Clientes", `${dados.clientes.filter((c) => c.ativo !== false).length} ativos${pode("financeiro") ? ` · ${fmtMoeda(receitaMensal)}/mês em mensalidades` : ""}`,
      el("label", { class: "check-inline" }, el("input", { type: "checkbox", checked: estado.mostrarInativos, onChange: (e) => { estado.mostrarInativos = e.target.checked; renderizar(); } }), "Mostrar inativos"),
      podeEditar() ? el("button", { class: "destaque", onClick: () => abrirCliente() }, "+ Novo cliente") : null),
    lista.length ? el("div", { class: "grade-clientes" }, lista.map(({ c, abertas, atrasadas, total }) =>
      el("a", { class: `cartao-cliente ${c.ativo === false ? "inativo" : ""}`, href: `#/clientes/${c.id}`, style: { "--selo": corCliente(c) } },
        el("h3", {}, c.nome),
        el("div", { class: "cartao-meta" }, (c.servicos || []).map((s) => el("span", { class: "etiqueta" }, s))),
        el("div", { class: "numeros-cliente" },
          el("span", {}, el("strong", {}, abertas), " abertas"),
          atrasadas ? el("span", { class: "alerta" }, el("strong", {}, atrasadas), " atrasadas") : null,
          el("span", {}, el("strong", {}, total), " no total")),
        contrato(c.id).mensalidade ? el("div", { class: "mensalidade" }, `${fmtMoeda(contrato(c.id).mensalidade)}/mês`) : null)))
      : vazio("Nenhum cliente ainda. Cadastre os clientes ou importe sua planilha em Ajustes.",
        el("a", { href: "#/config", class: "link" }, "Importar planilha →")));
}

function ficha(id, estado, renderizar) {
  const c = porId("clientes", id);
  if (!c) return el("div", { class: "tela" }, vazio("Cliente não encontrado.", el("a", { href: "#/clientes", class: "link" }, "← Voltar")));
  const abasPermitidas = [["tarefas", "Tarefas"],
    ...(pode("conteudo") ? [["conteudo", "Conteúdo"], ["marca", "Marca"]] : []),
    ...(pode("conteudo") || pode("trafego") ? [["contas", "Contas"]] : []),
    ...(pode("trafego") ? [["trafego", "Tráfego pago"]] : []),
    ...(pode("financeiro") ? [["financeiro", "Financeiro"]] : [])];
  if (!abasPermitidas.some(([v]) => v === estado.aba)) estado.aba = "tarefas";
  const ts = dados.tarefas.filter((t) => t.clienteId === id && tarefaVisivel(t));
  const abertas = ts.filter((t) => t.status !== "concluido").sort((a, b) => (a.prazo || "9").localeCompare(b.prazo || "9"));
  const feitas = ts.filter((t) => t.status === "concluido").sort((a, b) => (b.concluidoEm || b.prazo || "").localeCompare(a.concluidoEm || a.prazo || ""));
  const conts = ts.filter((x) => x.tipo === TIPO_CONTEUDO).sort((a, b) => dataPost(b).localeCompare(dataPost(a)));
  const contas = dados.contasAds.filter((x) => x.clienteId === id);
  const mans = dados.manutencoes.filter((x) => x.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const fins = dados.financeiro.filter((x) => x.clienteId === id).sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || ""));

  const info = (rotulo, valor) => valor ? el("div", { class: "info" }, el("span", {}, rotulo), el("strong", {}, valor)) : null;
  const zap = c.whatsapp ? linkExterno(`https://wa.me/55${c.whatsapp.replace(/\D/g, "").replace(/^55/, "")}`, c.whatsapp) : null;
  const insta = c.instagram ? linkExterno(`https://instagram.com/${c.instagram.replace(/^@/, "")}`, c.instagram) : null;

  const conteudoAba = {
    marca: () => abaMarca(c),
    contas: () => abaContas(c),
    tarefas: () => [
      el("div", { class: "com-acao" }, el("h2", {}, `Abertas (${abertas.length})`),
        el("button", { onClick: () => abrirTarefa({ clienteId: id, prazo: hojeISO() }) }, "+ Tarefa")),
      abertas.length ? abertas.map((t) => cartaoTarefa(t, { mostrarCliente: false })) : vazio("Nenhuma tarefa aberta."),
      el("h2", {}, `Concluídas (${feitas.length})`),
      feitas.slice(0, 50).map((t) => cartaoTarefa(t, { mostrarCliente: false })),
      feitas.length > 50 ? el("p", { class: "subtitulo" }, `Mostrando as 50 mais recentes. Use a tela Tarefas para ver todas.`) : null],
    conteudo: () => [
      el("div", { class: "com-acao" }, el("h2", {}, `Conteúdos (${conts.length})`),
        el("div", { class: "tela-acoes" },
          el("a", { class: "botao-link secundario mini", href: linkPlano(id, hojeISO().slice(0, 7)) }, "☷ Planejar mês"),
          el("button", { class: "mini", onClick: () => novoPost({ clienteId: id }) }, "+ Post"))),
      conts.length ? conts.slice(0, 60).map((x) => el("div", { class: "linha-tabela", onClick: () => abrirTarefa(x) },
        el("span", { class: "data-mini" }, fmtData(dataPost(x), true)), el("strong", {}, x.titulo),
        el("span", { class: "etiqueta" }, x.formato || "Post"), el("span", { class: `etiqueta st-${x.statusConteudo || "ideia"}` }, rotuloStatusConteudo(x.statusConteudo || "ideia"))))
        : vazio("Nenhum conteúdo programado.")],
    trafego: () => [
      el("div", { class: "com-acao" }, el("h2", {}, "Contas de anúncio"),
        el("button", { onClick: () => abrirConta({ clienteId: id }) }, "+ Conta")),
      contas.length ? contas.map((x) => el("div", { class: "linha-tabela", onClick: () => abrirConta(x) },
        el("strong", {}, x.plataforma), el("span", {}, x.idConta || ""), el("span", {}, x.verbaMensal ? `${fmtMoeda(x.verbaMensal)}/mês` : ""), el("span", {}, x.objetivo || ""),
        el("a", { href: x.plataforma === "Google Ads" ? linkGoogleAds() : linkGerenciadorMeta(x), target: "_blank", rel: "noopener", class: "link", onClick: (e) => e.stopPropagation() }, "gerenciador ↗")))
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
    el("header", { class: "tela-topo ficha-topo", style: { "--selo": corCliente(c) } },
      el("div", {},
        el("h1", {}, c.nome, c.ativo === false ? el("span", { class: "etiqueta" }, "Inativo") : null),
        el("div", { class: "cartao-meta" }, (c.servicos || []).map((s) => el("span", { class: "etiqueta" }, s)))),
      el("div", { class: "tela-acoes" }, podeEditar() ? el("button", { class: "secundario", onClick: () => abrirCliente(c) }, "Editar") : null)),
    el("div", { class: "ficha" },
      el("aside", { class: "bloco lateral" },
        info("Contato", c.contato), c.whatsapp ? el("div", { class: "info" }, el("span", {}, "WhatsApp"), zap) : null,
        info("E-mail", c.email), c.instagram ? el("div", { class: "info" }, el("span", {}, "Instagram"), insta) : null,
        el("div", { class: "links-cliente" }, linkExterno(c.linkDrive, "📁 Drive"), linkExterno(c.linkCanva, "🎨 Canva")),
        info("Mensalidade", contrato(c.id).mensalidade ? `${fmtMoeda(contrato(c.id).mensalidade)} · dia ${contrato(c.id).diaVencimento || "—"}` : null),
        info("Segmento", c.segmento), info("Observações", c.observacoes),
        !c.contato ? el("p", { class: "subtitulo" }, "Complete o contato em Editar. Cores, fontes e tom de voz ficam na aba Marca.") : null),
      el("section", { class: "bloco" },
        abas(abasPermitidas, estado.aba, (a) => { estado.aba = a; renderizar(); }),
        conteudoAba[estado.aba]())));
}
