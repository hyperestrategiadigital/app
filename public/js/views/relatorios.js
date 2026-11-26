// Relatórios: o que foi entregue para cada cliente (ou para todos) num período,
// com exportação em PDF para enviar ao cliente ou guardar.
import { el, hojeISO, fmtData, fmtMoeda, vazio, avisar, esc } from "../ui.js";
import { dados, porId, opcoesClientes, nomeCliente, clientesAtivos, todasTarefas, garantirArquivo, carregarArquivo, limiteArquivo, marcasDo } from "../db.js";
import { cabecalho, abas, corCliente } from "./componentes.js";
import { pode } from "../permissoes.js";
import { abaResultados } from "./resultados.js";
import { GRUPO } from "./marca.js";
import { numerosAnuncios } from "./trafego.js";
import { TIPO_CONTEUDO } from "../constantes.js";
import { dataPost } from "../exportacao.js";
import { compromissosEntre } from "../agenda.js";

const contar = (lista, chave) => lista.reduce((m, x) => { const k = chave(x) || "Outro"; m[k] = (m[k] || 0) + 1; return m; }, {});
const soma = (l) => l.reduce((s, x) => s + (Number(x) || 0), 0);

/** Junta tudo o que aconteceu no período para um cliente ("" = todos). */
export function montarRelatorio(clienteId, de, ate) {
  const doCliente = (x) => !clienteId || x.clienteId === clienteId;
  const no = (d) => d && d >= de && d <= ate;
  garantirArquivo(de);
  const tarefas = todasTarefas();
  const posts = tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && doCliente(t) && no(dataPost(t)));
  const publicados = posts.filter((t) => t.statusConteudo === "publicado" || t.status === "concluido");
  const tarefasFeitas = tarefas.filter((t) => t.tipo !== TIPO_CONTEUDO && doCliente(t) && t.status === "concluido" && no(t.concluidoEm || t.prazo));
  const manutencoes = dados.manutencoes.filter((m) => doCliente(m) && no(m.data)).sort((a, b) => a.data.localeCompare(b.data));
  const reunioes = compromissosEntre(de, ate).filter(({ c }) => doCliente(c));
  const receitas = dados.financeiro.filter((f) => f.tipo === "receita" && doCliente(f) && no(f.vencimento));
  const despesas = clienteId ? [] : dados.financeiro.filter((f) => f.tipo === "despesa" && no(f.vencimento));
  return {
    posts, publicados, porFormato: contar(publicados, (t) => t.formato), pendentes: posts.filter((t) => !publicados.includes(t)),
    tarefasFeitas, porTipo: contar(tarefasFeitas, (t) => t.tipo),
    manutencoes, investimento: soma(manutencoes.map((m) => m.investimento)),
    reunioes,
    recebido: soma(receitas.filter((f) => f.status === "pago").map((f) => f.valor)),
    aReceber: soma(receitas.filter((f) => f.status !== "pago").map((f) => f.valor)),
    despesas: soma(despesas.filter((f) => f.status === "pago").map((f) => f.valor))
  };
}

function periodo(estado) {
  if (estado.periodo === "personalizado") return [estado.de || hojeISO().slice(0, 8) + "01", estado.ate || hojeISO()];
  const [a, m] = (estado.mes || hojeISO().slice(0, 7)).split("-").map(Number);
  return [`${estado.mes}-01`, hojeISO(new Date(a, m, 0))];
}

const numero = (rotulo, valor, classe = "") => el("div", { class: `numero ${classe}` }, el("strong", {}, valor), el("span", {}, rotulo));

export function render({ params, estado, renderizar }) {
  estado.mes ??= hojeISO().slice(0, 7);
  estado.periodo ??= "mes";
  estado.cliente ??= "";
  // #/relatorios/<cliente> (vem da ficha do cliente): já abre nele
  if (params?.[0] && estado.paramsRel !== params[0]) { estado.paramsRel = params[0]; estado.cliente = params[0]; }
  const fin = pode("financeiro");
  const tp = pode("trafego");
  const [de, ate] = periodo(estado);
  const r = montarRelatorio(estado.cliente, de, ate);
  const cliente = porId("clientes", estado.cliente);
  const set = (k) => (e) => { estado[k] = e.target.value; renderizar(); };

  const filtros = el("div", { class: "filtros" },
    el("select", { onChange: set("cliente"), "aria-label": "Cliente" },
      opcoesClientes().map(([v, rot]) => el("option", { value: v, selected: v === estado.cliente }, v ? rot : "Todos os clientes (visão geral)"))),
    abas([["mes", "Mês"], ["personalizado", "Período"]], estado.periodo, (p) => { estado.periodo = p; renderizar(); }),
    estado.periodo === "mes"
      ? el("input", { type: "month", value: estado.mes, onChange: set("mes"), "aria-label": "Mês" })
      : [el("input", { type: "date", value: de, onChange: set("de"), "aria-label": "De" }), el("span", {}, "até"), el("input", { type: "date", value: ate, onChange: set("ate"), "aria-label": "Até" })]);

  const formatos = Object.entries(r.porFormato).sort((a, b) => b[1] - a[1]);
  const tipos = Object.entries(r.porTipo).sort((a, b) => b[1] - a[1]);

  const porCliente = !estado.cliente ? clientesAtivos().map((c) => ({ c, x: montarRelatorio(c.id, de, ate) }))
    .filter(({ x }) => x.posts.length || x.tarefasFeitas.length || x.manutencoes.length || x.recebido || x.aReceber) : [];

  return el("div", { class: "tela" },
    cabecalho("Relatórios", `${fmtData(de)} a ${fmtData(ate)}${cliente ? ` · ${cliente.nome}` : " · todos os clientes"}`,
      el("button", { class: "destaque", onClick: () => exportarRelatorioPDF(estado.cliente, de, ate) }, "⬇ PDF do relatório")),
    filtros,
    el("div", { class: "resumo" },
      numero("Posts publicados", `${r.publicados.length}/${r.posts.length}`, "ok"),
      numero("Tarefas concluídas", r.tarefasFeitas.length),
      tp ? numero("Manutenções de tráfego", r.manutencoes.length) : null,
      numero("Reuniões e compromissos", r.reunioes.length),
      tp && r.investimento ? numero("Investido em anúncios", fmtMoeda(r.investimento)) : null,
      fin ? numero("Recebido", fmtMoeda(r.recebido), "ok") : null,
      fin && r.aReceber ? numero("A receber", fmtMoeda(r.aReceber), "alerta") : null,
      fin && !estado.cliente ? numero("Despesas pagas", fmtMoeda(r.despesas)) : null),

    // Resultados do Instagram e Facebook do cliente escolhido 
    cliente && tp ? (() => {
      const nums = numerosAnuncios(dados.contasAds.filter((x) => x.clienteId === cliente.id), de, ate, renderizar);
      return nums ? el("section", { class: "bloco" }, el("h2", {}, `Anúncios da Meta · ${cliente.nome}`), nums) : null;
    })() : null,
    cliente ? blocoResultados(cliente, (estado.resultados ??= {})[cliente.id] ??= {}, renderizar) : null,

    el("div", { class: "colunas-hoje" },
      el("section", { class: "bloco" },
        el("h2", {}, "Conteúdo"),
        formatos.length ? el("div", { class: "barras" }, formatos.map(([f, n]) => el("div", { class: "barra" },
          el("span", {}, f), el("div", { class: "trilho" }, el("div", { class: "preenchido", style: { width: `${(n / formatos[0][1]) * 100}%` } })), el("strong", {}, n))))
          : vazio("Nenhum post publicado no período."),
        r.pendentes.length ? el("p", { class: "subtitulo" }, `${r.pendentes.length} post(s) do período ainda não publicados.`) : null,
        tp ? el("h2", {}, "Tráfego pago") : null,
        !tp ? null : r.manutencoes.length ? r.manutencoes.map((m) => el("div", { class: "linha-tabela" },
          el("span", { class: "data-mini" }, fmtData(m.data, true)), !estado.cliente ? el("span", {}, nomeCliente(m.clienteId)) : null,
          el("span", { class: "etiqueta" }, m.plataforma), el("span", { class: "resumo-texto" }, m.resultados || m.acoes || ""),
          m.investimento ? el("strong", {}, fmtMoeda(m.investimento)) : null))
          : vazio("Nenhuma manutenção registrada no período.")),
      el("aside", { class: "bloco lateral" },
        el("h2", {}, "Outras entregas"),
        tipos.length ? tipos.map(([t, n]) => el("div", { class: "linha-fin" }, el("span", {}, t), el("strong", {}, n))) : vazio("Nenhuma tarefa concluída."),
        el("h2", {}, "Reuniões"),
        r.reunioes.length ? r.reunioes.map(({ c, data }) => el("div", { class: "linha-fin" }, el("span", {}, c.titulo), el("span", {}, fmtData(data, true))))
          : vazio("Nenhum compromisso no período."))),

    porCliente.length ? el("section", { class: "bloco" },
      el("h2", {}, "Por cliente"),
      el("table", { class: "tabela-relatorio" },
        el("thead", {}, el("tr", {}, ["Cliente", "Posts publicados", "Tarefas", ...(tp ? ["Manutenções TP"] : []), ...(fin ? ["Recebido", "A receber"] : [])].map((h) => el("th", {}, h)))),
        el("tbody", {}, porCliente.map(({ c, x }) => el("tr", { onClick: () => { estado.cliente = c.id; renderizar(); } },
          el("td", {}, el("span", { class: "bolinha-cor", style: { background: corCliente(c) } }), " ", c.nome),
          el("td", {}, `${x.publicados.length}/${x.posts.length}`), el("td", {}, x.tarefasFeitas.length), tp ? el("td", {}, x.manutencoes.length) : null,
          fin ? [el("td", {}, fmtMoeda(x.recebido)), el("td", {}, x.aReceber ? fmtMoeda(x.aReceber) : "—")] : null))))) : null);
}

/** Resultados do Instagram e Facebook do cliente (num grupo, de cada marca: cada uma tem a própria página). */
function blocoResultados(cliente, res, renderizar) {
  const marcas = marcasDo(cliente.id);
  if (marcas.length) res.marcaSel ??= marcas[0].id;
  return el("section", { class: "bloco resultados-cliente" },
    el("div", { class: "com-acao" }, el("h2", {}, `Instagram e Facebook · ${cliente.nome}`),
      marcas.length ? el("select", { "aria-label": "Marca dos resultados", onChange: (e) => { res.marcaSel = e.target.value; renderizar(); } },
        [...marcas.map((m) => [m.id, m.nome]), [GRUPO, "Geral do grupo"]].map(([v, r]) => el("option", { value: v, selected: v === res.marcaSel }, r))) : null),
    abaResultados(cliente, res, renderizar));
}

/* ---------------- PDF ---------------- */

export async function exportarRelatorioPDF(clienteId, de, ate) {
  const janela = window.open("", "_blank");
  if (!janela) { avisar("O navegador bloqueou a nova janela. Permita pop-ups para este site.", "erro"); return; }
  const cliente = porId("clientes", clienteId);
  if (de < limiteArquivo()) await carregarArquivo();
  const r = montarRelatorio(clienteId, de, ate);
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  let css = "";
  try { css = await (await fetch(`${base}css/exportacao.css`)).text(); } catch {}
  const card = (rotulo, valor) => `<div class="kpi"><b>${esc(valor)}</b><span>${esc(rotulo)}</span></div>`;
  const linhasPosts = r.publicados.sort((a, b) => dataPost(a).localeCompare(dataPost(b)))
    .map((t) => `<tr><td>${fmtData(dataPost(t), true)}</td><td>${esc(t.formato || "")}</td><td>${esc(t.titulo)}</td>${clienteId ? "" : `<td>${esc(nomeCliente(t.clienteId))}</td>`}</tr>`).join("");
  const linhasTP = r.manutencoes.map((m) => `<tr><td>${fmtData(m.data, true)}</td><td>${esc(m.plataforma || "")}</td><td>${esc(m.acoes || "")}</td><td>${esc(m.resultados || "")}</td><td>${m.investimento ? esc(fmtMoeda(m.investimento)) : ""}</td></tr>`).join("");
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(cliente?.nome || "Hyper")} ${fmtData(de)} a ${fmtData(ate)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&family=Montserrat:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>${css}</style><style>:root{--cor-cliente:${esc(cliente ? corCliente(cliente) : "#4E2CA3")}}
.secao{padding:0 32px;margin-top:18px}.secao h2{font:italic 800 22px "Barlow Condensed",sans-serif;color:var(--hyper-roxo);margin:0 0 8px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:18px 32px 0}.kpi{border:1px solid var(--hyper-gelo);border-left:5px solid var(--cor-cliente);border-radius:8px;padding:10px}
.kpi b{display:block;font:italic 800 26px "Barlow Condensed",sans-serif;color:var(--hyper-roxo)}.kpi span{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--hyper-cinza);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:var(--cor-fundo);padding:6px;font-size:10px;text-transform:uppercase}td{padding:6px;border-bottom:1px solid var(--hyper-gelo);vertical-align:top}
.formatos span{display:inline-block;background:var(--cor-fundo);border-radius:99px;padding:3px 10px;margin:0 6px 6px 0;font-weight:600}
@media print{@page{size:A4 portrait;margin:10mm}.secao,.kpis{padding-left:0;padding-right:0}}</style></head><body>
<header class="topo"><img src="${base}img/logo-branco.png" alt="Hyper"><div><span class="tagline">Relatório de entregas</span>
<h1>${esc(cliente?.nome || "Todos os clientes")}</h1><p>${fmtData(de)} a ${fmtData(ate)}</p></div></header>
<div class="kpis">${card("Posts publicados", r.publicados.length)}${card("Outras entregas", r.tarefasFeitas.length)}${card("Manutenções de tráfego", r.manutencoes.length)}${card("Reuniões", r.reunioes.length)}</div>
<section class="secao"><h2>Conteúdo publicado</h2><div class="formatos">${Object.entries(r.porFormato).map(([f, n]) => `<span>${esc(f)}: ${n}</span>`).join("") || "Nenhum post publicado no período."}</div>
${linhasPosts ? `<table><thead><tr><th>Data</th><th>Formato</th><th>Tema</th>${clienteId ? "" : "<th>Cliente</th>"}</tr></thead><tbody>${linhasPosts}</tbody></table>` : ""}</section>
${r.manutencoes.length ? `<section class="secao"><h2>Tráfego pago</h2>${r.investimento ? `<p>Investimento registrado no período: <b>${esc(fmtMoeda(r.investimento))}</b></p>` : ""}<table><thead><tr><th>Data</th><th>Plataforma</th><th>O que foi feito</th><th>Resultados</th><th>Investido</th></tr></thead><tbody>${linhasTP}</tbody></table></section>` : ""}
${Object.keys(r.porTipo).length ? `<section class="secao"><h2>Outras entregas</h2><div class="formatos">${Object.entries(r.porTipo).map(([t, n]) => `<span>${esc(t)}: ${n}</span>`).join("")}</div></section>` : ""}
${r.reunioes.length ? `<section class="secao"><h2>Reuniões e compromissos</h2><table><tbody>${r.reunioes.map(({ c, data }) => `<tr><td>${fmtData(data, true)}</td><td>${esc(c.titulo)}</td><td>${esc(c.tipo || "")}</td></tr>`).join("")}</tbody></table></section>` : ""}
<footer><strong>Hyper Studio</strong> · Hyper Estratégia Digital — relatório gerado em ${fmtData(hojeISO())}.</footer>
<script>window.onload=()=>setTimeout(()=>window.print(),800)<\/script></body></html>`;
  janela.location.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
}

