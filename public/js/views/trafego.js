// Tráfego pago: contas de anúncio por cliente, verba e diário de manutenções.
import { el, formulario, confirmar, avisar, hojeISO, addDias, fmtData, fmtMoeda, diasAte, linkExterno, vazio, fecharModais } from "../ui.js";
import { dados, criar, atualizar, excluir, opcoesClientes, clientesAtivos, marcasDo, porId } from "../db.js";
import { cabecalho, seloCliente, corCliente } from "./componentes.js";
import { PLATAFORMAS } from "../constantes.js";
import { metaDisponivel, metaConectada, conectarMeta, anuncios, somarAnuncios } from "../meta.js";

/** Dias sem manutenção para virar aviso (no Hoje e no cartão do cliente). */
export const DIAS_MANUTENCAO = 7;
/** Clientes ativos com conta de anúncio ativa e sem manutenção há mais de DIAS_MANUTENCAO dias: [{ c, dias }] (dias null = nunca). */
export function manutencoesAtrasadas() {
  const ids = new Set(dados.contasAds.filter((x) => x.ativo !== false).map((x) => x.clienteId));
  return clientesAtivos().filter((c) => ids.has(c.id)).map((c) => {
    const u = dados.manutencoes.filter((m) => m.clienteId === c.id).map((m) => m.data).sort().pop();
    return { c, dias: u ? -diasAte(u) : null };
  }).filter((x) => x.dias === null || x.dias > DIAS_MANUTENCAO).sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999));
}

const fmtNumero = (n) => Number(n || 0).toLocaleString("pt-BR");
/** Números dos anúncios da Meta de várias contas, no período. Carrega depois; sem conexão, mostra o botão de conectar. */
export function numerosAnuncios(contas, de, ate, renderizar, { titulo = "" } = {}) {
  const meta = contas.filter((x) => x.plataforma === "Meta Ads" && x.ativo !== false);
  if (!meta.length || !metaDisponivel()) return null;
  if (!metaConectada()) return el("div", { class: "numeros-anuncios vazio-meta" },
    el("span", { class: "subtitulo" }, "Conecte o Facebook para ver investimento, leads e custo por lead."),
    el("button", { class: "secundario mini", onClick: async (e) => {
      e.currentTarget.disabled = true;
      try { await conectarMeta(); renderizar?.(); } catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
    } }, "Conectar Facebook"));
  const caixa = el("div", { class: "numeros-anuncios" }, el("span", { class: "subtitulo" }, "Carregando números da Meta…"));
  Promise.allSettled(meta.map((x) => anuncios(x.idConta, de, ate))).then((r) => {
    const ok = r.filter((x) => x.status === "fulfilled").map((x) => x.value);
    const erro = r.find((x) => x.status === "rejected")?.reason;
    if (!ok.length) { caixa.replaceChildren(el("span", { class: "subtitulo" }, `Não consegui ler os anúncios: ${erro?.message || "sem resposta da Meta"}`)); return; }
    const t = somarAnuncios(ok);
    const item = (rotulo, valor) => el("div", { class: "numero-anuncio" }, el("strong", {}, valor), el("span", {}, rotulo));
    caixa.replaceChildren(...[
      titulo ? el("span", { class: "rotulo-anuncios" }, titulo) : null,
      item("Investido", fmtMoeda(t.investido)),
      item("Leads", fmtNumero(t.leads)),
      item("Custo por lead", t.custoLead == null ? "—" : fmtMoeda(t.custoLead)),
      t.conversas ? item("Conversas", fmtNumero(t.conversas)) : null,
      t.conversas ? item("Custo por conversa", fmtMoeda(t.custoConversa)) : null,
      item("Alcance", fmtNumero(t.alcance)),
      item("Cliques", fmtNumero(t.cliques)),
      erro ? el("span", { class: "subtitulo" }, `Uma das contas não respondeu: ${erro.message}`) : null].filter(Boolean));
  });
  return caixa;
}

const linkGerenciador = (conta) => {
  const id = (conta.idConta || "").replace(/\D/g, "");
  if (!id) return null;
  if (conta.plataforma === "Meta Ads") return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${id}`;
  if (conta.plataforma === "Google Ads") return "https://ads.google.com/aw/overview";
  return null;
};

function botaoExcluir(col, item, msg) {
  return el("button", {
    type: "button", class: "perigo-texto", onClick: async () => {
      if (await confirmar(msg)) { await excluir(col, item.id); fecharModais(); }
    }
  }, "Excluir");
}

export function abrirConta(conta = {}) {
  const editando = !!conta.id;
  return formulario(editando ? "Editar conta de anúncio" : "Nova conta de anúncio", [
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientes(false), obrigatorio: true, largura: "metade" },
    // Grupo: de qual marca é a conta (vazio = do grupo todo)
    { nome: "marcaId", rotulo: "Marca", tipo: "select", largura: "metade",
      opcoesDe: (v) => [["", "Do grupo todo"], ...marcasDo(v.clienteId).map((m) => [m.id, m.nome])], mostrarSe: (v) => marcasDo(v.clienteId).length > 0 },
    { nome: "plataforma", rotulo: "Plataforma", tipo: "select", opcoes: PLATAFORMAS, largura: "metade" },
    { nome: "idConta", rotulo: "ID da conta", dica: "Meta: act_123... · Google: 123-456-7890", largura: "metade" },
    { nome: "verbaMensal", rotulo: "Verba mensal (R$)", tipo: "number", largura: "metade" },
    { nome: "objetivo", rotulo: "Objetivo principal", dica: "Ex.: leads no WhatsApp, vendas, matrículas" },
    { nome: "observacoes", rotulo: "Observações", tipo: "textarea", linhas: 3, dica: "Públicos, pixel, acessos, particularidades..." },
    { nome: "ativo", rotulo: "Conta ativa", tipo: "checkbox", padrao: true }
  ], conta, {
    extras: editando ? [botaoExcluir("contasAds", conta, "Excluir esta conta de anúncio?")] : [],
    aoSalvar: async (v) => {
      if (!marcasDo(v.clienteId).some((m) => m.id === v.marcaId)) v.marcaId = "";
      editando ? await atualizar("contasAds", conta.id, v) : await criar("contasAds", v); avisar("Conta salva.");
    }
  });
}

export function abrirManutencao(m = {}) {
  const editando = !!m.id;
  return formulario(editando ? "Editar manutenção" : "Registrar manutenção", [
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientes(false), obrigatorio: true, largura: "metade" },
    { nome: "plataforma", rotulo: "Plataforma", tipo: "select", opcoes: PLATAFORMAS, largura: "metade" },
    { nome: "data", rotulo: "Data", tipo: "date", padrao: hojeISO(), largura: "metade" },
    { nome: "investimento", rotulo: "Investido no período (R$)", tipo: "number", largura: "metade" },
    { nome: "resultados", rotulo: "Resultados", dica: "Ex.: 42 leads · CPL R$ 8,50 · CTR 1,9%" },
    { nome: "acoes", rotulo: "O que foi feito", tipo: "textarea", linhas: 4, dica: "Pausei conjunto X, subi 3 criativos novos, aumentei verba..." },
    { nome: "proximosPassos", rotulo: "Próximos passos", tipo: "textarea", linhas: 2 }
  ], m, {
    largo: true,
    extras: editando ? [botaoExcluir("manutencoes", m, "Excluir este registro?")] : [],
    aoSalvar: async (v) => {
      if (editando) await atualizar("manutencoes", m.id, v);
      else {
        await criar("manutencoes", v);
        // Conclui a tarefa "Manutenção TP" aberta do cliente, se houver uma vencendo até hoje.
        const t = dados.tarefas.find((x) => x.clienteId === v.clienteId && x.status !== "concluido" && x.tipo === "Tráfego pago" && (!x.prazo || x.prazo <= v.data));
        if (t) await atualizar("tarefas", t.id, { status: "concluido", concluidoEm: v.data });
      }
      avisar("Manutenção registrada.");
    }
  });
}

export function render({ params, estado, renderizar } = {}) {
  estado ??= {};
  // #/trafego/<cliente> (vem da ficha do cliente): já abre filtrado nele
  if (params?.[0] && estado.paramsTp !== params[0]) { estado.paramsTp = params[0]; estado.cliente = params[0]; }
  const doFiltro = (x) => !estado.cliente || x.clienteId === estado.cliente;
  const contas = dados.contasAds.filter((c) => c.ativo !== false);
  const verbaTotal = contas.reduce((s, c) => s + (c.verbaMensal || 0), 0);
  const clientesTP = clientesAtivos().filter((c) => (c.servicos || []).some((s) => s.includes("Ads")) || contas.some((x) => x.clienteId === c.id));
  // Com um cliente escolhido, o cartão dele aparece mesmo sem conta (para cadastrar a primeira)
  const cartoes = estado.cliente ? [porId("clientes", estado.cliente)].filter(Boolean) : clientesTP;
  const ultima = (id) => dados.manutencoes.filter((m) => m.clienteId === id).sort((a, b) => b.data.localeCompare(a.data))[0];
  const manutencoes = dados.manutencoes.filter(doFiltro).sort((a, b) => b.data.localeCompare(a.data)).slice(0, estado.cliente ? 100 : 40);

  return el("div", { class: "tela" },
    cabecalho("Tráfego pago", `${contas.length} contas ativas · ${fmtMoeda(verbaTotal)}/mês em verba`,
      el("button", { class: "secundario", onClick: () => abrirConta() }, "+ Conta de anúncio"),
      el("button", { class: "destaque", onClick: () => abrirManutencao({ data: hojeISO() }) }, "+ Registrar manutenção")),

    el("div", { class: "filtros" },
      el("select", { "aria-label": "Cliente", onChange: (e) => { estado.cliente = e.target.value; renderizar?.(); } },
        opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === (estado.cliente || "") }, v ? r : "Todos os clientes")))),
    el("h2", {}, "Clientes com tráfego"),
    cartoes.length ? el("div", { class: "grade-clientes" }, cartoes.map((c) => {
      const u = ultima(c.id);
      const dias = u ? -diasAte(u.data) : null;
      const suas = contas.filter((x) => x.clienteId === c.id);
      return el("div", { class: "cartao-cliente", style: { "--selo": corCliente(c) } },
        el("h3", {}, el("a", { href: `#/clientes/${c.id}` }, c.nome)),
        suas.length ? suas.map((x) => el("div", { class: "linha-conta" },
          el("button", { class: "link", onClick: () => abrirConta(x) }, x.plataforma, x.marcaId ? ` · ${porId("marcas", x.marcaId)?.nome || ""}` : ""),
          el("span", {}, x.verbaMensal ? `${fmtMoeda(x.verbaMensal)}/mês` : ""),
          linkExterno(linkGerenciador(x), "abrir ↗")))
          : el("button", { class: "link", onClick: () => abrirConta({ clienteId: c.id }) }, "+ cadastrar conta"),
        numerosAnuncios(suas, addDias(hojeISO(), -30), addDias(hojeISO(), -1), renderizar, { titulo: "Últimos 30 dias" }),
        el("div", { class: `ultima-manutencao ${dias === null || dias > DIAS_MANUTENCAO ? "alerta" : "ok"}` },
          u ? `Última manutenção: ${fmtData(u.data, true)} (${dias === 0 ? "hoje" : `${dias} dia(s)`})` : "Nenhuma manutenção registrada"),
        el("button", { class: "mini", onClick: () => abrirManutencao({ clienteId: c.id, data: hojeISO(), plataforma: suas[0]?.plataforma }) }, "Registrar manutenção"));
    })) : vazio("Marque o serviço Meta Ads ou Google Ads na ficha dos clientes, ou cadastre uma conta de anúncio."),

    el("h2", {}, "Diário de manutenções"),
    manutencoes.length ? el("div", { class: "lista" }, manutencoes.map((m) =>
      el("div", { class: "linha-tabela", onClick: () => abrirManutencao(m) },
        el("span", { class: "data-mini" }, fmtData(m.data, true)), seloCliente(m.clienteId),
        el("span", { class: "etiqueta" }, m.plataforma),
        el("span", { class: "resumo-texto" }, m.resultados || m.acoes || ""),
        m.investimento ? el("span", {}, fmtMoeda(m.investimento)) : null)))
      : vazio("Os registros de manutenção aparecem aqui. Registrar uma manutenção conclui a tarefa de tráfego pago do cliente."),
    el("p", { class: "nota" }, "Os números da Meta vêm direto do Gerenciador de Anúncios (permissão ads_read do Facebook conectado em Minha conta). Google Ads entra numa próxima etapa."));
}
