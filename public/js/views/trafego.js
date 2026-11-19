// Tráfego pago: contas de anúncio por cliente, verba e diário de manutenções.
import { el, formulario, confirmar, avisar, hojeISO, fmtData, fmtMoeda, diasAte, linkExterno, vazio, fecharModais } from "../ui.js";
import { dados, criar, atualizar, excluir, opcoesClientes, clientesAtivos, marcasDo } from "../db.js";
import { cabecalho, seloCliente, corCliente } from "./componentes.js";
import { PLATAFORMAS } from "../constantes.js";

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

export function render() {
  const contas = dados.contasAds.filter((c) => c.ativo !== false);
  const verbaTotal = contas.reduce((s, c) => s + (c.verbaMensal || 0), 0);
  const clientesTP = clientesAtivos().filter((c) => (c.servicos || []).some((s) => s.includes("Ads")) || contas.some((x) => x.clienteId === c.id));
  const ultima = (id) => dados.manutencoes.filter((m) => m.clienteId === id).sort((a, b) => b.data.localeCompare(a.data))[0];
  const manutencoes = [...dados.manutencoes].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 40);

  return el("div", { class: "tela" },
    cabecalho("Tráfego pago", `${contas.length} contas ativas · ${fmtMoeda(verbaTotal)}/mês em verba`,
      el("button", { class: "secundario", onClick: () => abrirConta() }, "+ Conta de anúncio"),
      el("button", { class: "destaque", onClick: () => abrirManutencao({ data: hojeISO() }) }, "+ Registrar manutenção")),

    el("h2", {}, "Clientes com tráfego"),
    clientesTP.length ? el("div", { class: "grade-clientes" }, clientesTP.map((c) => {
      const u = ultima(c.id);
      const dias = u ? -diasAte(u.data) : null;
      const suas = contas.filter((x) => x.clienteId === c.id);
      return el("div", { class: "cartao-cliente", style: { "--selo": corCliente(c) } },
        el("h3", {}, el("a", { href: `#/clientes/${c.id}` }, c.nome)),
        suas.length ? suas.map((x) => el("div", { class: "linha-conta" },
          el("button", { class: "link", onClick: () => abrirConta(x) }, x.plataforma),
          el("span", {}, x.verbaMensal ? `${fmtMoeda(x.verbaMensal)}/mês` : ""),
          linkExterno(linkGerenciador(x), "abrir ↗")))
          : el("button", { class: "link", onClick: () => abrirConta({ clienteId: c.id }) }, "+ cadastrar conta"),
        el("div", { class: `ultima-manutencao ${dias === null || dias > 7 ? "alerta" : "ok"}` },
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
    el("p", { class: "nota" }, "Métricas automáticas do Meta e do Google Ads (investimento, leads, CPL) entram numa próxima etapa, com a integração das APIs."));
}
