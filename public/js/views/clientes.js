// Clientes: lista com indicadores e ficha completa de cada cliente.
import { textoVencimento } from "../comercial.js";
import { el, formulario, confirmar, avisar, fmtMoeda, fmtData, linkExterno, vazio, hojeISO, fecharModais } from "../ui.js";
import { dados, criar, atualizar, excluir, porId, contrato, salvarComId, marcasDo } from "../db.js";
import { pode, ehAdmin, tarefaVisivel } from "../permissoes.js";
import { atrasada, cabecalho, abas, corCliente } from "./componentes.js";
import { abrirConta, abrirManutencao } from "./trafego.js";
import { abaMarca, abrirMarca, juntarClientes, GRUPO } from "./marca.js";
import { abaResultados } from "./resultados.js";
import { abaCampanhas } from "./campanhas.js";
import { abaEscopo } from "./escopo.js";
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
    { tipo: "secao", rotulo: "Contato" },
    { nome: "contato", rotulo: "Pessoa de contato", largura: "metade" },
    { nome: "whatsapp", rotulo: "WhatsApp", dica: "(11) 99999-9999", largura: "metade" },
    { nome: "email", rotulo: "E-mail", tipo: "email", largura: "metade" },
    ...(fin ? [
      { tipo: "secao", rotulo: "Contrato (só quem tem acesso ao financeiro vê)" },
      { nome: "mensalidade", rotulo: "Mensalidade (R$)", tipo: "number", largura: "metade" },
      { nome: "diaVencimento", rotulo: "Dia de vencimento", tipo: "number", dica: "10", largura: "metade" },
      { nome: "vencimentoUtil", rotulo: "Contar em dias úteis (ex.: 5º dia útil)", tipo: "checkbox", largura: "metade" },
      { nome: "pagamento", rotulo: "Pagamento", tipo: "select", opcoes: [["", "—"], ["pos", "Pós-pago"], ["pre", "Pré-pago"]], largura: "metade" },
      { nome: "verbaAnuncios", rotulo: "Verba de anúncios (anotação)", dica: "Ex.: R$ 600/mês", largura: "metade" }] : []),
    { tipo: "secao", rotulo: "Outros" },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", linhas: 3, dica: "Quem tiver acesso de cliente também lê estas observações." },
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
      const CAMPOS = ["mensalidade", "diaVencimento", "vencimentoUtil", "pagamento", "verbaAnuncios"];
      const dadosContrato = fin ? Object.fromEntries(CAMPOS.map((k) => [k, v[k] ?? null])) : null;
      for (const k of CAMPOS) delete v[k];
      let id = cliente.id;
      if (editando) await atualizar("clientes", cliente.id, v);
      else id = (await criar("clientes", v)).id;
      if (dadosContrato) await salvarComId("contratos", id, { clienteId: id, ...dadosContrato });
      avisar(editando ? "Cliente atualizado." : "Cliente criado.");
    }
  });
}

export function render({ params, estado, renderizar }) {
  if (params[0]) {
    // Cada cliente guarda a própria aba e marca escolhidas
    estado.fichas ??= {};
    estado.fichas[params[0]] ??= {};
    return ficha(params[0], estado.fichas[params[0]], renderizar, params.slice(1));
  }

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
        el("div", { class: "cartao-meta" }, (c.servicos || []).map((s) => el("span", { class: "etiqueta" }, s)),
          null),
        marcasDo(c.id).length ? el("div", { class: "marcas-cartao", title: "Grupo: marcas" },
          marcasDo(c.id).map((m) => el("span", { class: "etiqueta", style: { "--selo": corCliente(m) } }, m.nome))) : null,
        el("div", { class: "numeros-cliente" },
          el("span", {}, el("strong", {}, abertas), " abertas"),
          atrasadas ? el("span", { class: "alerta" }, el("strong", {}, atrasadas), " atrasadas") : null,
          el("span", {}, el("strong", {}, total), " no total")),
        contrato(c.id).mensalidade ? el("div", { class: "mensalidade" }, `${fmtMoeda(contrato(c.id).mensalidade)}/mês`) : null)))
      : vazio("Nenhum cliente ainda. Clique em + Novo cliente para cadastrar."));
}

/** Grupo: antes de abrir a ficha, escolher a marca (ou o geral do grupo). */
function escolherMarca(c) {
  const marcas = marcasDo(c.id);
  const inativas = (dados.marcas || []).filter((m) => m.clienteId === c.id && m.ativo === false);
  const abertasDe = (mid) => dados.tarefas.filter((t) => t.clienteId === c.id && tarefaVisivel(t) && t.status !== "concluido" && (t.marcaId || "") === mid).length;
  const cartao = (m) => el("a", { class: `cartao-cliente cartao-marca ${m.ativo === false ? "inativo" : ""}`, href: `#/clientes/${c.id}/marca/${m.id}`, style: { "--selo": corCliente(m) } },
    el("div", { class: "ficha-titulo" }, m.logo ? el("img", { class: "logo-chip", src: m.logo, alt: "" }) : null, el("h3", {}, m.nome, m.ativo === false ? " (inativa)" : "")),
    m.instagram ? el("p", { class: "subtitulo" }, `@${String(m.instagram).replace(/^@/, "")}`) : null,
    el("div", { class: "numeros-cliente" }, el("span", {}, el("strong", {}, abertasDe(m.id)), " abertas")));
  const podeGerir = ehAdmin() || pode("conteudo");
  return el("div", { class: "tela" },
    el("a", { href: "#/clientes", class: "voltar" }, "← Clientes"),
    cabecalho(c.nome, "É um grupo. Qual marca você quer abrir?",
      podeGerir ? el("button", { class: "secundario", onClick: () => abrirMarca(c.id) }, "+ Marca") : null,
      podeEditar() ? el("button", { class: "secundario", onClick: () => abrirCliente(c) }, "Editar grupo") : null),
    el("div", { class: "grade-clientes" },
      marcas.map(cartao),
      el("a", { class: "cartao-cliente cartao-marca cartao-geral", href: `#/clientes/${c.id}/marca/grupo`, style: { "--selo": corCliente(c) } },
        el("h3", {}, `${c.nome} · geral`),
        el("p", { class: "subtitulo" }, "Posts institucionais do grupo, contrato, tráfego pago e financeiro."),
        el("div", { class: "numeros-cliente" }, el("span", {}, el("strong", {}, abertasDe("")), " abertas")))),
    inativas.length ? [el("h2", {}, "Marcas inativas"), el("div", { class: "grade-clientes" }, inativas.map(cartao))] : null,
    ehAdmin() ? el("p", {}, el("button", { class: "link", onClick: () => juntarClientes(c) }, "Juntar outros clientes como marcas deste grupo…")) : null);
}

function ficha(id, estado, renderizar, resto = []) {
  const c = porId("clientes", id);
  if (!c) return el("div", { class: "tela" }, vazio("Cliente não encontrado.", el("a", { href: "#/clientes", class: "link" }, "← Voltar")));
  // Grupo: primeiro escolhe a marca (#/clientes/<id>), depois a ficha abre igual à de um cliente comum
  // (#/clientes/<id>/marca/<marcaId>, ou /marca/grupo para o geral: contrato, tráfego, financeiro e institucional).
  const marcas = marcasDo(c.id);
  const grupo = marcas.length > 0;
  if (grupo && resto[0] !== "marca") return escolherMarca(c);
  const escolhida = grupo && resto[1] !== "grupo" ? porId("marcas", resto[1]) : null;
  if (grupo && resto[1] !== "grupo" && !escolhida) return escolherMarca(c);
  estado.marcaSel = !grupo ? "" : escolhida ? escolhida.id : GRUPO;
  const geral = !escolhida; // cliente comum ou o geral do grupo: tem contrato, tráfego e financeiro
  // A ficha é a configuração do cliente. Tarefas e posts ficam na tela Tarefas (filtrada pelo cliente/marca).
  const abasPermitidas = [
    ...(pode("conteudo") || pode("trafego") ? [["marca", "Marca"]] : []), // tráfego vê só o cadastro
    ...(pode("conteudo") || pode("trafego") ? [["campanhas", "Campanhas"]] : []),
    ...(geral ? [["escopo", "Escopo"]] : []),
    ...(pode("conteudo") || pode("trafego") ? [["contas", "Contas"]] : []),
    ...(pode("conteudo") || pode("trafego") ? [["resultados", "Resultados"]] : []),
    ...(pode("trafego") ? [["trafego", "Tráfego pago"]] : []),
    ...(geral && pode("financeiro") ? [["financeiro", "Financeiro"]] : [])];
  if (!abasPermitidas.some(([v]) => v === estado.aba)) estado.aba = abasPermitidas[0]?.[0] || "";
  const ts = dados.tarefas.filter((t) => t.clienteId === id && tarefaVisivel(t) && (!escolhida || t.marcaId === escolhida.id));
  const abertas = ts.filter((t) => t.status !== "concluido");
  const atrasadas = abertas.filter(atrasada).length;
  // Na ficha de uma marca, só as contas de anúncio dela; no geral do grupo, todas (com a marca indicada)
  const contas = dados.contasAds.filter((x) => x.clienteId === id && (!escolhida || x.marcaId === escolhida.id));
  const mans = dados.manutencoes.filter((x) => x.clienteId === id).sort((a, b) => b.data.localeCompare(a.data));
  const fins = dados.financeiro.filter((x) => x.clienteId === id).sort((a, b) => (b.vencimento || "").localeCompare(a.vencimento || ""));

  const info = (rotulo, valor) => valor ? el("div", { class: "info" }, el("span", {}, rotulo), el("strong", {}, valor)) : null;
  const zap = c.whatsapp ? linkExterno(`https://wa.me/55${c.whatsapp.replace(/\D/g, "").replace(/^55/, "")}`, c.whatsapp) : null;
  const insta = c.instagram ? linkExterno(`https://instagram.com/${c.instagram.replace(/^@/, "")}`, c.instagram) : null;

  const conteudoAba = {
    marca: () => abaMarca(c, estado, renderizar),
    contas: () => abaContas(c, estado),
    campanhas: () => abaCampanhas(c, escolhida),
    escopo: () => abaEscopo(c),
    resultados: () => abaResultados(c, estado, renderizar),
    trafego: () => [
      el("div", { class: "com-acao" }, el("h2", {}, "Contas de anúncio"),
        el("button", { onClick: () => abrirConta({ clienteId: id, marcaId: escolhida?.id || "" }) }, "+ Conta")),
      contas.length ? contas.map((x) => el("div", { class: "linha-tabela", onClick: () => abrirConta(x) },
        el("strong", {}, x.plataforma), !escolhida && x.marcaId ? el("span", { class: "etiqueta" }, porId("marcas", x.marcaId)?.nome || "") : null, el("span", {}, x.idConta || ""), el("span", {}, x.verbaMensal ? `${fmtMoeda(x.verbaMensal)}/mês` : ""), el("span", {}, x.objetivo || ""),
        el("a", { href: x.plataforma === "Google Ads" ? linkGoogleAds() : linkGerenciadorMeta(x), target: "_blank", rel: "noopener", class: "link", onClick: (e) => e.stopPropagation() }, "gerenciador ↗")))
        : vazio("Nenhuma conta cadastrada."),
      escolhida ? el("p", { class: "nota" }, `As manutenções ficam no geral do grupo ${c.nome}.`) : el("div", { class: "com-acao" }, el("h2", {}, "Manutenções"),
        el("button", { onClick: () => abrirManutencao({ clienteId: id, data: hojeISO() }) }, "+ Registro")),
      escolhida ? null : mans.length ? mans.slice(0, 30).map((m) => el("div", { class: "linha-tabela", onClick: () => abrirManutencao(m) },
        el("span", { class: "data-mini" }, fmtData(m.data, true)), el("strong", {}, m.plataforma), el("span", { class: "resumo-texto" }, m.acoes || "")))
        : vazio("Nenhuma manutenção registrada.")],
    financeiro: () => [
      el("h2", {}, "Lançamentos"),
      fins.length ? fins.slice(0, 40).map((x) => el("div", { class: "linha-tabela" },
        el("span", { class: "data-mini" }, fmtData(x.vencimento, true)), el("strong", {}, x.descricao), el("span", {}, fmtMoeda(x.valor)),
        el("span", { class: `etiqueta ${x.status === "pago" ? "ok" : x.vencimento < hojeISO() ? "alerta" : ""}` }, x.status === "pago" ? "Pago" : "Pendente")))
        : vazio("Nenhum lançamento. Gere as mensalidades na tela Financeiro.")]
  };

  const quem = escolhida || c;
  return el("div", { class: "tela" },
    el("a", { href: grupo ? `#/clientes/${id}` : "#/clientes", class: "voltar" }, grupo ? `← ${c.nome}: trocar marca` : "← Clientes"),
    el("header", { class: "tela-topo ficha-topo", style: { "--selo": corCliente(quem) } },
      el("div", { class: "ficha-titulo" },
        quem.logo ? el("img", { class: "logo-ficha", src: quem.logo, alt: "" }) : null,
        el("div", {},
          grupo ? el("p", { class: "sobre-titulo" }, escolhida ? `${c.nome} › marca` : "Geral do grupo: institucional, contrato e financeiro") : null,
          el("h1", {}, quem.nome, c.ativo === false ? el("span", { class: "etiqueta" }, "Inativo") : null),
          el("div", { class: "cartao-meta" }, (c.servicos || []).map((s) => el("span", { class: "etiqueta" }, s))))),
      el("div", { class: "tela-acoes" },
        el("a", { class: "botao-link secundario", href: `#/tarefas/${id}${escolhida ? `/${escolhida.id}` : ""}` }, `✓ Tarefas (${abertas.length} abertas${atrasadas ? `, ${atrasadas} atrasadas` : ""}) →`))),
    el("div", { class: "ficha" },
      el("aside", { class: "bloco lateral" },
        info("Contato", c.contato), c.whatsapp ? el("div", { class: "info" }, el("span", {}, "WhatsApp"), zap) : null,
        info("E-mail", c.email), c.instagram ? el("div", { class: "info" }, el("span", {}, "Instagram"), insta) : null,
        el("div", { class: "links-cliente" }, linkExterno(c.linkDrive, "📁 Drive"), linkExterno(c.linkCanva, "🎨 Canva")),
        info("Mensalidade", geral && contrato(c.id).mensalidade ? `${fmtMoeda(contrato(c.id).mensalidade)} · ${textoVencimento(contrato(c.id)).replace(" de cada mês", "")}` : null),
        info("Segmento", c.segmento), info("Observações", c.observacoes),
        !c.contato && geral ? el("p", { class: "subtitulo" }, "Complete o contato na aba Marca (Cadastro e contato), junto com cores, fontes e tom de voz.") : null),
      el("section", { class: "bloco" },
        abasPermitidas.length ? [abas(abasPermitidas, estado.aba, (a) => { estado.aba = a; renderizar(); }), conteudoAba[estado.aba]()]
          : el("p", { class: "subtitulo" }, "As tarefas deste cliente ficam na tela Tarefas."))));
}
