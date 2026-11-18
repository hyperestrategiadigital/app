// Lixeira (só administradores): o que foi excluído nos últimos 30 dias, com restaurar e apagar de vez.
import { el, avisar, confirmar, vazio, fmtData, hojeISO } from "../ui.js";
import { listarLixeira, restaurarDaLixeira, excluirDaLixeira, nomeCliente, DIAS_LIXEIRA } from "../db.js";
import { cabecalho } from "./componentes.js";

const ROTULO = {
  tarefas: "Tarefa / post", compromissos: "Compromisso", clientes: "Cliente", marcas: "Marca", recorrencias: "Rotina",
  financeiro: "Lançamento", orcamentos: "Orçamento", contasAds: "Conta de anúncio", manutencoes: "Manutenção"
};
const dataDe = (ms) => hojeISO(new Date(ms));

let itens = null;
async function carregar(renderizar) {
  try { itens = (await listarLixeira()).sort((a, b) => b.excluidoEm - a.excluidoEm); }
  catch (e) { itens = []; avisar("Não consegui abrir a lixeira: " + e.message, "erro"); }
  renderizar();
}

export function render({ estado, renderizar }) {
  if (itens === null) { carregar(renderizar); return el("div", { class: "tela" }, cabecalho("Lixeira", "Carregando…")); }
  estado.filtro ??= "";
  const lista = itens.filter((i) => !estado.filtro || i.colecao === estado.filtro);
  const tipos = [...new Set(itens.map((i) => i.colecao))];
  return el("div", { class: "tela" },
    cabecalho("Lixeira", `Itens excluídos ficam aqui por ${DIAS_LIXEIRA} dias. Depois são apagados de vez.`,
      el("button", { class: "secundario", onClick: () => { itens = null; renderizar(); } }, "Atualizar")),
    tipos.length > 1 ? el("div", { class: "filtros" },
      el("select", { "aria-label": "Tipo", onChange: (e) => { estado.filtro = e.target.value; renderizar(); } },
        el("option", { value: "" }, "Tudo"), tipos.map((t) => el("option", { value: t, selected: t === estado.filtro }, ROTULO[t] || t)))) : null,
    lista.length ? el("div", { class: "lista" }, lista.map((i) => el("div", { class: "linha-tabela" },
      el("span", { class: "etiqueta" }, ROTULO[i.colecao] || i.colecao),
      el("strong", {}, i.titulo),
      i.clienteId && i.colecao !== "clientes" ? el("span", { class: "subtitulo" }, nomeCliente(i.clienteId)) : null,
      el("span", { class: "subtitulo" }, `excluído em ${fmtData(dataDe(i.excluidoEm))}${i.excluidoPor ? ` por ${i.excluidoPor}` : ""}`),
      el("span", { class: "espaco" }),
      el("button", { class: "mini", onClick: async (e) => {
        e.currentTarget.disabled = true;
        try { await restaurarDaLixeira(i); itens = itens.filter((x) => x !== i); avisar(`"${i.titulo}" restaurado.`); renderizar(); }
        catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
      } }, "Restaurar"),
      el("button", { class: "perigo-texto", onClick: async () => {
        if (!(await confirmar(`Apagar "${i.titulo}" de vez? Não dá para desfazer.`))) return;
        await excluirDaLixeira(i.id); itens = itens.filter((x) => x !== i); renderizar();
      } }, "Apagar de vez"))))
      : vazio("A lixeira está vazia."));
}
