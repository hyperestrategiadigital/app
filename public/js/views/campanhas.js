// Campanhas: agrupam posts e tarefas de um mesmo objetivo (Natal, Black Friday, lançamento…).
// Ficam na aba "Campanhas" da ficha do cliente. O briefing, a mensagem e as condições entram no pedido de copy
// de cada peça (ia.js). Só a equipe vê: a campanha pode ter condições internas.
import { el, formulario, avisar, confirmar, fmtData, hojeISO, vazio, fecharModais } from "../ui.js";
import { dados, criar, atualizar, excluir, porId, marcasDo, campanhasDo, desfazerExclusao } from "../db.js";
import { TIPO_CONTEUDO } from "../constantes.js";
import { abrirTarefa, cartaoTarefa } from "./componentes.js";

const pecasDa = (c) => dados.tarefas.filter((t) => t.campanhaId === c.id);
const pronta = (t) => t.status === "concluido" || ["aprovado", "agendado", "publicado"].includes(t.statusConteudo);
const periodo = (c) => [c.inicio, c.fim].filter(Boolean).map((d) => fmtData(d, true)).join(" a ");

/** Cria ou edita uma campanha. */
export async function abrirCampanha(campanha) {
  const editando = !!campanha.id;
  const marcas = marcasDo(campanha.clienteId);
  const v = await formulario(editando ? `Campanha: ${campanha.nome}` : "Nova campanha", [
    { nome: "nome", rotulo: "Nome", obrigatorio: true, dica: "Ex.: Natal 2026, Black November, Lançamento do plano anual" },
    marcas.length ? { nome: "marcaId", rotulo: "Marca", tipo: "select", opcoes: [...marcas.map((m) => [m.id, m.nome]), ["", "O grupo todo"]] } : null,
    { nome: "inicio", rotulo: "Começa em", tipo: "date", largura: "metade" },
    { nome: "fim", rotulo: "Termina em", tipo: "date", largura: "metade" },
    { nome: "objetivo", rotulo: "Objetivo", dica: "Ex.: aumentar as encomendas de cestas de Natal" },
    { nome: "mensagem", rotulo: "Mensagem central", tipo: "textarea", linhas: 2, dica: "A ideia que todas as peças reforçam" },
    { nome: "condicoes", rotulo: "Condições comerciais", tipo: "textarea", linhas: 2, dica: "Preços, prazos, cupons, regras. Vão exatamente assim para a copy." },
    { nome: "briefing", rotulo: "Briefing da campanha", tipo: "textarea", linhas: 5, dica: "Contexto, público, referências, o que evitar nesta campanha" },
    { nome: "ativa", rotulo: "Campanha ativa (aparece para escolher nos posts)", tipo: "checkbox", padrao: true }
  ].filter(Boolean), { ativa: true, ...campanha }, {
    largo: true,
    extras: editando ? [el("button", { type: "button", class: "perigo-texto", onClick: async () => {
      if (!(await confirmar(`Excluir a campanha "${campanha.nome}"? As peças continuam, só deixam de estar agrupadas.`))) return;
      const { id, ...copia } = campanha;
      await excluir("campanhas", id);
      fecharModais();
      avisar("Campanha excluída.", "ok", { desfazer: () => desfazerExclusao("campanhas", id, copia) });
    } }, "Excluir")] : []
  });
  if (!v) return null;
  const valores = { ...v, clienteId: campanha.clienteId, marcaId: v.marcaId ?? campanha.marcaId ?? "" };
  if (editando) { await atualizar("campanhas", campanha.id, valores); return campanha.id; }
  const ref = await criar("campanhas", valores);
  avisar("Campanha criada. Agora é só escolher ela nos posts e tarefas.");
  return ref.id;
}

/** Aba "Campanhas" da ficha do cliente (ou da marca escolhida no grupo). */
export function abaCampanhas(c, marca) {
  const lista = campanhasDo(c.id, marca ? marca.id : undefined);
  const hoje = hojeISO();
  const ativas = lista.filter((x) => x.ativa !== false && (!x.fim || x.fim >= hoje));
  const antigas = lista.filter((x) => !ativas.includes(x));
  const cartao = (x) => {
    const pecas = pecasDa(x);
    return el("article", { class: "bloco campanha-cartao" },
      el("div", { class: "com-acao" },
        el("div", {}, el("h3", {}, x.nome),
          el("p", { class: "subtitulo" }, [periodo(x), !marca && x.marcaId ? porId("marcas", x.marcaId)?.nome : "", `${pecas.filter(pronta).length} de ${pecas.length} peça(s) prontas`].filter(Boolean).join(" · "))),
        el("div", { class: "tela-acoes" },
          el("button", { class: "secundario mini", onClick: () => abrirCampanha(x) }, "Editar"),
          el("button", { class: "mini", onClick: () => abrirTarefa({ tipo: TIPO_CONTEUDO, clienteId: x.clienteId, marcaId: x.marcaId || marca?.id || "", campanhaId: x.id, prazo: hoje, dataPublicacao: x.inicio && x.inicio > hoje ? x.inicio : hoje }) }, "+ Post"),
          el("button", { class: "secundario mini", onClick: () => abrirTarefa({ tipo: "Projeto", clienteId: x.clienteId, marcaId: x.marcaId || marca?.id || "", campanhaId: x.id, prazo: hoje }) }, "+ Tarefa"))),
      x.mensagem ? el("p", {}, el("strong", {}, "Mensagem: "), x.mensagem) : null,
      pecas.length ? el("div", { class: "lista-pecas" }, pecas.sort((a, b) => (a.dataPublicacao || a.prazo || "").localeCompare(b.dataPublicacao || b.prazo || "")).map((t) => cartaoTarefa(t, { mostrarCliente: false })))
        : el("p", { class: "subtitulo" }, "Nenhuma peça ainda. Crie aqui ou escolha a campanha no post."));
  };
  return el("div", { class: "aba-campanhas" },
    el("div", { class: "com-acao" },
      el("p", { class: "subtitulo" }, "Uma campanha junta as peças de um mesmo objetivo. O briefing, a mensagem e as condições vão junto no pedido de copy de cada peça."),
      el("button", { onClick: () => abrirCampanha({ clienteId: c.id, marcaId: marca?.id || "", inicio: hoje }) }, "+ Campanha")),
    ativas.length ? ativas.map(cartao) : vazio("Nenhuma campanha em andamento."),
    antigas.length ? el("details", {}, el("summary", {}, `Campanhas encerradas (${antigas.length})`), antigas.map(cartao)) : null);
}
