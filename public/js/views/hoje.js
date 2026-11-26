// Tela inicial: o que está atrasado, o que vence hoje, a semana e os conteúdos próximos.
import { el, hojeISO, addDias, fmtData, fmtDiaSemana, fmtMoeda, vazio } from "../ui.js";
import { dados, nomeCliente, marcasDo } from "../db.js";
import { cartaoTarefa, atrasada, abrirTarefa, cabecalho, seloCliente, abas } from "./componentes.js";
import { emailAtivo } from "../emails.js";
import { agendaConectada } from "../agenda.js";
import { rotuloStatusConteudo, TIPO_CONTEUDO } from "../constantes.js";
import { dataPost } from "../exportacao.js";
import { dentroDaProducao } from "../producao.js";
import { pode, tarefaVisivel, eu, ehAdmin } from "../permissoes.js";
import { compromissosEntre } from "../agenda.js";
import { abrirCompromisso, cartaoCompromisso } from "../compromissos.js";
import { menuSuspenso, novoPost } from "./calendario.js";
import { contarPendencias, resumoPendencias, abrirPendencias } from "../pendencias.js";

const lerPreferencia = () => { try { return localStorage.getItem("hyper-hoje-visao"); } catch { return null; } };
const guardar = (chave, valor) => { try { localStorage.setItem(chave, valor); } catch {} };
/** Dias fechados em "Próximos 7 dias" (só datas de hoje em diante, para a lista não crescer). */
function lerRecolhidos() {
  try { return (JSON.parse(localStorage.getItem("hyper-dias-recolhidos") || "[]") || []).filter((d) => d >= hojeISO()); } catch { return []; }
}
function guardarRecolhido(dia, fechado) {
  const atuais = lerRecolhidos().filter((d) => d !== dia);
  guardar("hyper-dias-recolhidos", JSON.stringify(fechado ? [...atuais, dia] : atuais));
}

/** Lista de primeiros passos do administrador (some quando tudo estiver pronto ou ao dispensar). */
function primeirosPassos(renderizar) {
  if (!ehAdmin()) return null;
  try { if (localStorage.getItem("hyper-primeiros-passos") === "ok") return null; } catch {}
  // Identidade: em grupos conta cada marca; nos clientes de uma marca só, o próprio cliente
  const ativos = dados.clientes.filter((c) => c.ativo !== false);
  const unidades = ativos.flatMap((c) => (marcasDo(c.id).length ? marcasDo(c.id) : [c]));
  const comMarca = unidades.filter((u) => u.tomDeVoz && (u.paleta || []).length).length;
  const passos = [
    ["Ligar os e-mails automáticos (convites, avisos, resumo diário)", emailAtivo(), "#/config"],
    ["Google Agenda automática funcionando (Ajustes → Testar agenda)", agendaConectada(), "#/config"],
    [`Preencher a identidade das marcas: tom de voz e cores (${comMarca} de ${unidades.length})`, unidades.length > 0 && comMarca >= unidades.length, "#/clientes"],
    ["Convidar a equipe", dados.membros.length > 1, "#/usuarios"],
    ["Criar as rotinas (produção, planejamento, cobrança)", dados.recorrencias.length > 0, "#/rotinas"],
    ["Ligar os relatórios do Instagram e Facebook", !!(dados.config.find((c) => c.id === "meta")?.appId), "#/config"]
  ];
  const feitos = passos.filter(([, ok]) => ok).length;
  if (feitos === passos.length) return null;
  return el("section", { class: "bloco primeiros-passos" },
    el("div", { class: "com-acao" }, el("h2", {}, `Primeiros passos (${feitos}/${passos.length})`),
      el("button", { class: "link", onClick: () => { guardar("hyper-primeiros-passos", "ok"); renderizar(); } }, "Dispensar")),
    el("div", { class: "barra-progresso" }, el("span", { style: { width: `${Math.round((feitos / passos.length) * 100)}%` } })),
    el("ul", { class: "lista-passos" }, passos.map(([texto, ok, link]) => el("li", { class: ok ? "feito" : "" },
      el("span", { class: "check-passo", "aria-hidden": "true" }, ok ? "✓" : ""), ok ? texto : el("a", { href: link }, texto)))));
}

/** Dicas rápidas para quem está começando (uma vez por navegador). */
function dicas(renderizar) {
  try { if (localStorage.getItem("hyper-dicas") === "ok") return null; } catch {}
  const item = (titulo, texto) => el("li", {}, el("strong", {}, titulo), " ", texto);
  return el("section", { class: "bloco dicas" },
    el("div", { class: "com-acao" }, el("h2", {}, "Dicas rápidas"), el("button", { class: "link", onClick: () => { guardar("hyper-dicas", "ok"); renderizar(); } }, "Entendi")),
    el("ul", {},
      item("Ctrl+K", "(⌘K no Mac) busca qualquer cliente, post, tarefa ou tela."),
      item("Clique no seu nome", "(embaixo, no menu) para pôr foto, escolher o e-mail da sua agenda e pedir mais acesso."),
      item("Minhas × Equipe:", "aqui no Hoje você vê primeiro o que é seu."),
      item("No celular,", "use \"Adicionar à tela de início\" no navegador para ter o Hyper Studio como um aplicativo.")));
}

export function render({ estado = {}, renderizar = () => {} } = {}) {
  const hoje = hojeISO();
  const fimSemana = addDias(hoje, 7);
  const todasVisiveis = dados.tarefas.filter(tarefaVisivel);
  const minha = (t) => t.responsavel && t.responsavel === eu.nome;
  // Começa em "Minhas" quando a pessoa tem tarefas abertas em seu nome
  estado.visao ??= lerPreferencia() || (todasVisiveis.some((t) => minha(t) && t.status !== "concluido") ? "minhas" : "equipe");
  const soMinhas = estado.visao === "minhas";
  const visiveis = soMinhas ? todasVisiveis.filter(minha) : todasVisiveis;
  // Posts que estão dentro de um "Produzir semana" não aparecem soltos: ficam na checklist dessa tarefa
  const abertas = visiveis.filter((t) => t.status !== "concluido" && !dentroDaProducao(t));
  const atrasadas = abertas.filter(atrasada).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const deHoje = abertas.filter((t) => t.prazo === hoje);
  const semana = abertas.filter((t) => t.prazo > hoje && t.prazo <= fimSemana).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const semPrazo = abertas.filter((t) => !t.prazo);
  const concluidasHoje = visiveis.filter((t) => t.status === "concluido" && t.concluidoEm === hoje && !dentroDaProducao(t)).length;

  const conteudos = (pode("conteudo") ? visiveis : [])
    .filter((c) => c.tipo === TIPO_CONTEUDO && dataPost(c) >= hoje && dataPost(c) <= fimSemana && c.statusConteudo !== "publicado")
    .sort((a, b) => (dataPost(a) + (a.hora || "")).localeCompare(dataPost(b) + (b.hora || "")));

  const compromissos = compromissosEntre(hoje, fimSemana)
    .filter(({ c }) => !soMinhas || !(c.participantes || []).length || c.participantes.includes(eu.nome));
  const mes = hoje.slice(0, 7);
  const aReceber = dados.financeiro.filter((f) => f.tipo === "receita" && f.status !== "pago" && f.vencimento?.startsWith(mes));
  const vencidas = dados.financeiro.filter((f) => f.tipo === "receita" && f.status !== "pago" && f.vencimento && f.vencimento < hoje);

  const saudacao = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";
  const dataExtenso = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  // Próximos dias: cada dia abre e fecha (o que você fechou fica fechado neste navegador)
  const recolhidos = lerRecolhidos();
  const grupoPorDia = (lista) => {
    const dias = {};
    lista.forEach((t) => (dias[t.prazo] ??= []).push(t));
    return Object.entries(dias).map(([d, ts]) => {
      const caixa = el("details", { class: "grupo-dia", open: !recolhidos.includes(d) },
        el("summary", {}, el("h3", {}, `${fmtDiaSemana(d)} · ${fmtData(d, true)}`, el("span", { class: "contador" }, ts.length))),
        ts.map((t) => cartaoTarefa(t)));
      caixa.addEventListener("toggle", () => guardarRecolhido(d, !caixa.open));
      return caixa;
    });
  };
  const alternarTodos = (abrir) => { guardar("hyper-dias-recolhidos", JSON.stringify(abrir ? [] : [...new Set(semana.map((t) => t.prazo))])); renderizar(); };

  return el("div", { class: "tela" },
    cabecalho(`${saudacao}${eu.nome ? `, ${eu.nome.split(" ")[0]}` : ""}!`, dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1),
      abas([["minhas", "Minhas"], ["equipe", "Equipe"]], estado.visao, (v) => { estado.visao = v; guardar("hyper-hoje-visao", v); renderizar(); }),
      menuSuspenso("+ Novo", [
        pode("conteudo") ? ["▣ Post", () => novoPost({ data: hoje })] : null,
        ["✓ Tarefa", () => abrirTarefa({ prazo: hoje, responsavel: eu.nome })],
        ["◷ Compromisso", () => abrirCompromisso({ data: hoje })]
      ], "destaque")),
    primeirosPassos(renderizar),
    dicas(renderizar),

    // Atrasadas · Hoje (para hoje | concluídas) · Próximos 7 dias · Pendências (abre o que espera por você)
    el("div", { class: "resumo" },
      cartaoNumero("Atrasadas", atrasadas.length, atrasadas.length ? "alerta" : ""),
      el("div", { class: "numero numero-duplo" },
        el("div", {}, el("strong", {}, deHoje.length + compromissos.filter((x) => x.data === hoje).length), el("span", {}, "Para hoje")),
        el("div", { class: "ok" }, el("strong", {}, concluidasHoje), el("span", {}, "Concluídas hoje"))),
      cartaoNumero("Próximos 7 dias", semana.length),
      (() => {
        const n = contarPendencias();
        return el("button", { type: "button", class: `numero numero-pendencias ${n ? "com-pendencias" : ""}`, title: resumoPendencias() || "Nenhuma pendência",
          onClick: () => abrirPendencias(abrirTarefa, renderizar) },
          el("strong", {}, n), el("span", {}, "Pendências"), n ? el("small", {}, resumoPendencias()) : el("small", {}, "tudo em dia"));
      })()),

    vencidas.length ? el("a", { class: "faixa-alerta", href: "#/financeiro" },
      `💰 ${vencidas.length} recebimento(s) vencido(s): ${fmtMoeda(vencidas.reduce((s, f) => s + (f.valor || 0), 0))}. Ver financeiro →`) : null,

    el("div", { class: "colunas-hoje" },
      el("section", { class: "bloco" },
        atrasadas.length ? [el("h2", { class: "titulo-alerta" }, `Atrasadas (${atrasadas.length})`), atrasadas.map((t) => cartaoTarefa(t))] : null,
        el("h2", {}, `Hoje (${deHoje.length})`),
        deHoje.length ? deHoje.map((t) => cartaoTarefa(t)) : vazio(soMinhas ? "Nada seu vencendo hoje. 🎉" : "Nada vencendo hoje. 🎉"),
        el("div", { class: "com-acao" }, el("h2", {}, "Próximos 7 dias"),
          semana.length ? el("div", { class: "acoes-dias" },
            el("button", { class: "link", onClick: () => alternarTodos(true) }, "Abrir todos"),
            el("button", { class: "link", onClick: () => alternarTodos(false) }, "Fechar todos")) : null),
        semana.length ? grupoPorDia(semana) : vazio("Semana livre por enquanto."),
        semPrazo.length ? [el("h2", {}, `Sem prazo (${semPrazo.length})`), semPrazo.map((t) => cartaoTarefa(t))] : null),

      el("aside", { class: "bloco lateral" },
        el("div", { class: "com-acao" }, el("h2", {}, "Compromissos"),
          el("button", { class: "secundario mini", onClick: () => abrirCompromisso({ data: hoje }) }, "+ Compromisso")),
        compromissos.length ? compromissos.map(({ c, data }) => el("div", {},
          data !== hoje ? el("div", { class: "dia-compromisso" }, `${fmtDiaSemana(data)} · ${fmtData(data, true)}`) : el("div", { class: "dia-compromisso hoje" }, "Hoje"),
          cartaoCompromisso(c))) : vazio("Nenhum compromisso nos próximos 7 dias."),

        pode("conteudo") ? el("h2", {}, "Conteúdos da semana") : null,
        conteudos.length ? conteudos.map((c) =>
          el("a", { class: "item-conteudo", href: "#/calendario" },
            el("span", { class: "data-mini" }, fmtData(dataPost(c), true)),
            el("div", {},
              el("strong", {}, c.titulo),
              el("div", { class: "cartao-meta" }, seloCliente(c.clienteId), el("span", { class: "etiqueta" }, c.formato),
                el("span", { class: `etiqueta st-${c.statusConteudo || "ideia"}` }, rotuloStatusConteudo(c.statusConteudo || "ideia"))))))
          : pode("conteudo") ? vazio("Nenhum conteúdo programado.", el("a", { href: "#/calendario", class: "link" }, "Abrir calendário →")) : null,

        pode("financeiro") ? el("h2", {}, "A receber este mês") : null,
        !pode("financeiro") ? null : aReceber.length ? [
          el("p", { class: "numero-grande" }, fmtMoeda(aReceber.reduce((s, f) => s + (f.valor || 0), 0))),
          aReceber.slice(0, 6).map((f) => el("div", { class: "linha-fin" },
            el("span", {}, f.clienteId ? nomeCliente(f.clienteId) : f.descricao),
            el("span", {}, `${fmtData(f.vencimento, true)} · ${fmtMoeda(f.valor)}`)))
        ] : vazio("Nada pendente este mês.", el("a", { href: "#/financeiro", class: "link" }, "Abrir financeiro →")))));
}

function cartaoNumero(rotulo, n, classe = "") {
  return el("div", { class: `numero ${classe}` }, el("strong", {}, n), el("span", {}, rotulo));
}
