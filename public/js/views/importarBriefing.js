// Importar briefing (aba Marca): cola o JSON que a IA devolveu e ele vai para ESTA marca (ou para o cliente, se for
// de uma marca só). O escopo vai sempre para o cliente. Não há importação em outro lugar do app.
import { el, avisar, abrirModal, normalizar } from "../ui.js";
import { atualizar } from "../db.js";
import { SERVICOS } from "../constantes.js";
import { quandoDoTexto, quandoParaTela } from "../datas.js";
import { FREQUENCIAS, QUEM_FAZ } from "./escopo.js";

const CAMPOS = [["descricao", "Sobre a marca"], ["tomDeVoz", "Tom de voz"], ["persona", "Persona"], ["publico", "Público-alvo"],
  ["palavrasChave", "Palavras e expressões"], ["evitar", "O que evitar"], ["pilares", "Pilares"], ["diretrizes", "Diretrizes"],
  ["datas", "Datas comemorativas"], ["fontes", "Fontes"], ["paleta", "Cores"], ["escopo", "Escopo (do cliente)"]];
const chave = (s) => normalizar(s || "").replace(/[^a-z0-9]/g, "");
const preenchido = (x) => (Array.isArray(x) ? x.filter(Boolean).length > 0 : String(x ?? "").trim().length > 0);

/** Blocos do JSON colado: aceita { marcas: [...] }, uma lista ou um bloco só, dentro ou fora de um bloco de código. */
export function blocosDoTexto(texto) {
  const t = String(texto);
  const inicio = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  const bruto = t.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || (inicio.length ? t.slice(Math.min(...inicio)) : t);
  const j = JSON.parse(bruto);
  const lista = Array.isArray(j) ? j : Array.isArray(j.marcas) ? j.marcas : [j];
  return lista.filter((b) => b && typeof b === "object");
}

/** Valores prontos para gravar, já no formato do app. */
function normalizar_(b) {
  const v = {};
  for (const [k] of CAMPOS) if (preenchido(b[k])) v[k] = b[k];
  if (v.pilares && Array.isArray(v.pilares)) v.pilares = v.pilares.join("\n");
  if (v.paleta) v.paleta = (Array.isArray(v.paleta) ? v.paleta : [v.paleta]).filter((c) => /^#[0-9a-f]{3,8}$/i.test(String(c).trim()));
  if (v.datas) v.datas = (Array.isArray(v.datas) ? v.datas : []).map((d) => ({ nome: String(d?.nome || "").trim(), quando: quandoDoTexto(d?.quando) })).filter((d) => d.nome && d.quando);
  if (v.escopo) {
    const achar = (opcoes, valor, padrao = "") => opcoes.find((o) => chave(o) === chave(valor)) || String(valor || padrao).trim();
    v.escopo = (Array.isArray(v.escopo) ? v.escopo : []).map((l) => ({
      servico: achar(SERVICOS, l?.servico), frequencia: achar(FREQUENCIAS, l?.frequencia), quantidade: l?.quantidade == null ? "" : String(l.quantidade),
      quem: achar(QUEM_FAZ, l?.quem, "Hyper"), obs: String(l?.obs || l?.observacao || "").trim() })).filter((l) => l.servico);
  }
  for (const k of Object.keys(v)) if (!preenchido(v[k])) delete v[k];
  return v;
}

const resumo = (k, x) => k === "datas" ? x.map((d) => `${quandoParaTela(d.quando)} ${d.nome}`).join("; ")
  : k === "escopo" ? x.map((l) => [l.servico, l.frequencia, l.quantidade, l.quem].filter(Boolean).join(" · ")).join("; ")
  : k === "paleta" ? x.join(", ") : String(x).replace(/\s+/g, " ").slice(0, 140) + (String(x).length > 140 ? "…" : "");

/**
 * Abre a janela de importação para a marca aberta.
 * alvo: { col, id, obj, nome } da aba Marca; cliente: o cliente dono (o escopo vai para ele).
 */
export function abrirImportarBriefing(alvo, cliente) {
  const texto = el("textarea", { rows: 8, id: "briefing-json", placeholder: "Cole aqui o JSON que a IA respondeu" });
  const previa = el("div", { class: "previa-briefing" });
  const sobrescrever = el("input", { type: "checkbox", id: "briefing-sobrescrever", checked: true });
  const botao = el("button", { class: "confirmar", disabled: true }, "Importar para esta marca");
  let valores = null;

  const ler = () => {
    valores = null; botao.disabled = true;
    if (!texto.value.trim()) { previa.replaceChildren(); return; }
    let blocos;
    try { blocos = blocosDoTexto(texto.value); } catch { previa.replaceChildren(el("p", { class: "erro" }, "Não consegui ler o JSON. Copie a resposta inteira da IA.")); return; }
    if (!blocos.length) { previa.replaceChildren(el("p", { class: "erro" }, "O JSON não tem nenhum bloco de marca.")); return; }
    // Vários blocos (ex.: um grupo inteiro): fica o desta marca, pelo nome; dá para trocar
    const nomeDe = (b) => b.marca || b.cliente || b.nome || "(sem nome)";
    let escolhido = blocos.find((b) => chave(nomeDe(b)) === chave(alvo.nome)) || (blocos.length === 1 ? blocos[0] : null);
    const desenhar = () => {
      valores = escolhido ? normalizar_(escolhido) : null;
      const campos = valores ? CAMPOS.filter(([k]) => valores[k]) : [];
      botao.disabled = !campos.length;
      previa.replaceChildren(...[
        blocos.length > 1 ? el("label", { class: "campo" }, el("span", {}, "Este JSON tem mais de um bloco. Qual é o desta marca?"),
          el("select", { id: "briefing-bloco", onChange: (e) => { escolhido = blocos[Number(e.target.value)] ?? null; desenhar(); } },
            el("option", { value: "" }, "— escolha —"),
            blocos.map((b, i) => el("option", { value: i, selected: b === escolhido }, nomeDe(b))))) : null,
        escolhido && chave(nomeDe(escolhido)) !== chave(alvo.nome)
          ? el("p", { class: "faixa-aviso" }, `O bloco é de "${nomeDe(escolhido)}" e você está em ${alvo.nome}. Confira antes de importar.`) : null,
        campos.length ? [el("h3", { class: "form-secao" }, `Vai para ${alvo.nome}`),
          el("ul", { class: "lista-previa-briefing" }, campos.map(([k, rotulo]) => el("li", {},
            el("strong", {}, `${rotulo}${preenchido(k === "escopo" ? cliente.escopo : alvo.obj[k]) ? " (já tem: será substituído se a opção abaixo estiver marcada)" : ""}: `), resumo(k, valores[k]))))]
          : escolhido ? el("p", { class: "subtitulo" }, "Nada para importar neste bloco.") : null].flat().filter(Boolean));
    };
    desenhar();
  };
  texto.addEventListener("input", ler);

  botao.addEventListener("click", async () => {
    if (!valores) return;
    botao.disabled = true;
    try {
      const { escopo, ...marca } = valores;
      const v = {};
      for (const [k, x] of Object.entries(marca)) if (sobrescrever.checked || !preenchido(alvo.obj[k])) v[k] = x;
      if (v.paleta) v.cor = v.paleta[0];
      if (Object.keys(v).length) await atualizar(alvo.col, alvo.id, v);
      if (escopo && (sobrescrever.checked || !preenchido(cliente.escopo)))
        await atualizar("clientes", cliente.id, { escopo, servicos: [...new Set(escopo.filter((l) => l.quem === "Hyper").map((l) => l.servico))] });
      avisar(`Briefing importado para ${alvo.nome}. Revise cada campo.`);
      fechar();
    } catch (e) { avisar("Não consegui importar: " + e.message, "erro"); botao.disabled = false; }
  });

  const fechar = abrirModal(`Importar briefing · ${alvo.nome}`, el("div", { class: "importar-briefing" },
    el("p", {}, "Cole o JSON que a IA devolveu para esta marca. Tudo vai para ", el("strong", {}, alvo.nome), ", e o escopo vai para o cliente. Você vê o que muda antes de confirmar."),
    texto, previa,
    el("label", { class: "check-inline", for: "briefing-sobrescrever" }, sobrescrever, "Substituir o que já está preenchido (desmarcado: só preenche os campos vazios)"),
    el("div", { class: "acoes" }, el("button", { class: "secundario negar", onClick: () => fechar() }, "Cancelar"), botao)), { largo: true });
}
