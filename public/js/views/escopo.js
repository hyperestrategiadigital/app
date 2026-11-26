// Escopo do cliente: o que é entregue, em que frequência e quem faz (Hyper, cliente ou terceiro).
// Não repete o contrato (valores e vencimento ficam em contratos/{id}). Fica em clientes/{id}.escopo e mantém
// clientes/{id}.servicos (os serviços que a Hyper faz), que as rotinas e o Tráfego pago já usam.
import { el, avisar } from "../ui.js";
import { atualizar } from "../db.js";
import { SERVICOS } from "../constantes.js";
import { pode, ehAdmin } from "../permissoes.js";

export const FREQUENCIAS = ["Semanal", "Quinzenal", "Mensal", "Por demanda"];
export const QUEM_FAZ = ["Hyper", "Cliente", "Terceiro"];

/** Linhas do escopo; cliente antigo sem escopo: os serviços marcados viram linhas feitas pela Hyper. */
export const escopoDe = (c) => (Array.isArray(c?.escopo) && c.escopo.length ? c.escopo
  : (c?.servicos || []).map((servico) => ({ servico, frequencia: "", quantidade: "", quem: "Hyper", obs: "" })));

/** Quantos posts por semana o escopo prevê (linhas de Social media semanais feitas pela Hyper). */
export function postsPorSemana(c) {
  return escopoDe(c).filter((l) => /social/i.test(l.servico) && l.quem === "Hyper" && Number(l.quantidade) > 0)
    .reduce((s, l) => s + (l.frequencia === "Semanal" ? Number(l.quantidade) : l.frequencia === "Quinzenal" ? Number(l.quantidade) / 2 : l.frequencia === "Mensal" ? Number(l.quantidade) / 4.3 : 0), 0);
}

export function abaEscopo(c) {
  const podeEditar = ehAdmin() || pode("conteudo") || pode("trafego");
  const linhas = escopoDe(c).map((l) => ({ ...l }));
  const corpo = el("tbody");
  const botaoSalvar = el("button", { hidden: true, onClick: async () => {
    const limpas = linhas.filter((l) => l.servico);
    await atualizar("clientes", c.id, { escopo: limpas, servicos: [...new Set(limpas.filter((l) => l.quem === "Hyper").map((l) => l.servico))] });
    botaoSalvar.hidden = true;
    avisar("Escopo salvo.");
  } }, "Salvar escopo");
  const mudou = () => { botaoSalvar.hidden = false; };
  const sel = (opcoes, valor, aoMudar, rotulo) => {
    const s = el("select", { "aria-label": rotulo, disabled: !podeEditar, onChange: (e) => { aoMudar(e.target.value); mudou(); } },
      el("option", { value: "" }, "—"), [...new Set([...opcoes, ...(valor && !opcoes.includes(valor) ? [valor] : [])])].map((o) => el("option", { value: o, selected: o === valor }, o)));
    return s;
  };
  const desenhar = () => corpo.replaceChildren(...linhas.map((l, i) => el("tr", {},
    el("td", {}, sel(SERVICOS, l.servico, (v) => (l.servico = v), "Serviço")),
    el("td", {}, sel(FREQUENCIAS, l.frequencia, (v) => (l.frequencia = v), "Frequência")),
    el("td", {}, el("input", { type: "number", min: 0, value: l.quantidade ?? "", "aria-label": "Quantidade", disabled: !podeEditar, onInput: (e) => { l.quantidade = e.target.value; mudou(); } })),
    el("td", {}, sel(QUEM_FAZ, l.quem, (v) => (l.quem = v), "Quem faz")),
    el("td", {}, el("input", { type: "text", value: l.obs || "", placeholder: "Ex.: 1 estático + 1 vídeo", "aria-label": "Observação", disabled: !podeEditar, onInput: (e) => { l.obs = e.target.value; mudou(); } })),
    el("td", {}, podeEditar ? el("button", { class: "icone", "aria-label": "Tirar linha", onClick: () => { linhas.splice(i, 1); desenhar(); mudou(); } }, "✕") : null))));
  desenhar();
  return el("div", { class: "aba-escopo" },
    el("p", { class: "subtitulo" }, "O que a Hyper entrega para este cliente, em que frequência e o que é do cliente ou de terceiros. Os valores ficam no contrato. Os posts por semana de Social media aparecem no \"Produzir semana\"."),
    el("table", { class: "tabela-escopo" },
      el("thead", {}, el("tr", {}, ["Serviço", "Frequência", "Qtd.", "Quem faz", "Observação", ""].map((t) => el("th", {}, t)))),
      corpo),
    podeEditar ? el("div", { class: "acoes" },
      el("button", { class: "secundario mini", onClick: () => { linhas.push({ servico: "", frequencia: "", quantidade: "", quem: "Hyper", obs: "" }); desenhar(); } }, "+ Linha"),
      botaoSalvar) : null);
}
