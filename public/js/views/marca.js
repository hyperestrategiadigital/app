// Aba "Marca" da ficha do cliente: pasta do Drive, cor principal + demais cores, fontes,
// tom de voz, persona, público, estilo de imagem e diagramação — com sugestão de melhoria pela IA.
// Alimenta a copy, o prompt de imagem e o pedido de arte no Canva.
import { el, avisar, linkExterno, campoCor, abrirModal } from "../ui.js";
import { atualizar } from "../db.js";
import { gerarTexto, temChave } from "../openai.js";

// Texto digitado e ainda não salvo sobrevive às atualizações de tela
const rascunhos = new Map();

function editorCores(c) {
  const paleta = [...(c.paleta?.length ? c.paleta : [c.cor || "#4E2CA3"])];
  const salvar = async () => { await atualizar("clientes", c.id, { paleta: paleta.filter(Boolean), cor: paleta[0] }); };
  const demais = el("div", { class: "paleta" });
  const desenharDemais = () => demais.replaceChildren(
    ...paleta.slice(1).map((cor, i) => el("div", { class: "cor" },
      campoCor(cor, (v) => { paleta[i + 1] = v; salvar(); }),
      el("button", { class: "icone", "aria-label": "Remover cor", onClick: () => { paleta.splice(i + 1, 1); desenharDemais(); salvar(); } }, "✕"))),
    el("button", { class: "secundario mini", onClick: () => { paleta.push("#FFFFFF"); desenharDemais(); salvar(); } }, "+ Cor"));
  desenharDemais();
  return el("div", { class: "cores-marca" },
    el("div", { class: "cor-principal" },
      el("h3", {}, "Cor principal"),
      el("p", { class: "subtitulo" }, "Usada para identificar o cliente em todo o app (calendário, cartões, PDF)."),
      campoCor(paleta[0], (v) => { paleta[0] = v; salvar(); })),
    el("div", {},
      el("h3", {}, "Demais cores"),
      demais));
}

/** Pede à IA uma versão melhorada do campo e mostra para você decidir. */
async function sugerirMelhoria(c, campo, rotulo, textoAtual, aplicar) {
  if (!temChave()) { avisar("Cadastre a chave da OpenAI em Ajustes para usar as sugestões.", "erro"); return; }
  const fechar = abrirModal(`Sugestão de melhoria · ${rotulo}`, el("p", { class: "subtitulo" }, "Pensando…"));
  const contexto = [
    `Cliente: ${c.nome}`, c.servicos?.length ? `Serviços contratados: ${c.servicos.join(", ")}` : "",
    c.tomDeVoz && campo !== "tomDeVoz" ? `Tom de voz atual: ${c.tomDeVoz}` : "",
    c.persona && campo !== "persona" ? `Persona atual: ${c.persona}` : "",
    c.publico && campo !== "publico" ? `Público atual: ${c.publico}` : "",
    c.estiloVisual && campo !== "estiloVisual" ? `Estilo de imagem atual: ${c.estiloVisual}` : "",
    c.observacoes ? `Observações: ${c.observacoes}` : ""
  ].filter(Boolean).join("\n");
  try {
    const sugestao = await gerarTexto({
      sistema: "Você é estrategista de marca e social media sênior de uma agência brasileira de tráfego pago (Hyper). Responda em português do Brasil, de forma prática e aplicável. Devolva SOMENTE o texto melhorado do campo pedido, pronto para colar, sem introdução nem comentários. Use tópicos curtos quando ajudar.",
      pedido: `${contexto}\n\nCampo: ${rotulo}\nTexto atual: ${textoAtual || "(vazio)"}\n\nReescreva e melhore esse campo: deixe mais específico, útil para quem cria conteúdo e anúncios, com exemplos concretos (palavras e expressões a usar e a evitar, quando fizer sentido). Mantenha o que já está certo.`
    });
    fechar();
    const area = el("textarea", { rows: 12 });
    area.value = sugestao;
    const f2 = abrirModal(`Sugestão de melhoria · ${rotulo}`, el("div", {},
      el("p", { class: "subtitulo" }, "Edite se quiser e escolha o que fazer. Nada é salvo sem você clicar."),
      area,
      el("div", { class: "acoes" },
        el("button", { class: "secundario", onClick: async () => { await navigator.clipboard.writeText(area.value).catch(() => {}); avisar("Copiado."); } }, "Copiar"),
        el("span", { class: "espaco" }),
        el("button", { class: "secundario", onClick: () => f2() }, "Descartar"),
        el("button", { class: "destaque", onClick: () => { aplicar(area.value); f2(); } }, "Usar no campo"))), { largo: true });
  } catch (e) {
    fechar();
    avisar("Não consegui gerar a sugestão: " + e.message, "erro");
  }
}

function campoTexto(c, campo, rotulo, dica, linhas = 4, { sugestao = false } = {}) {
  const chave = `${c.id}|${campo}`;
  const area = el("textarea", { rows: linhas, placeholder: dica, id: `marca-${campo}` });
  area.value = rascunhos.has(chave) ? rascunhos.get(chave) : (c[campo] || "");
  const botao = el("button", { class: "mini", hidden: !rascunhos.has(chave), onClick: async () => {
    rascunhos.delete(chave);
    await atualizar("clientes", c.id, { [campo]: area.value.trim() });
    avisar("Salvo.");
  } }, "Salvar");
  const marcar = () => { rascunhos.set(chave, area.value); botao.hidden = false; };
  area.addEventListener("input", marcar);
  return el("div", { class: "campo-marca" },
    el("div", { class: "com-acao" }, el("h3", {}, rotulo),
      el("div", { class: "tela-acoes" },
        sugestao ? el("button", { class: "secundario mini", onClick: () => sugerirMelhoria(c, campo, rotulo, area.value, (texto) => { area.value = texto; marcar(); }) }, "✨ Sugerir melhoria") : null,
        botao)),
    area);
}

function campoDrive(c) {
  const chave = `${c.id}|linkDrive`;
  const entrada = el("input", { id: "marca-linkDrive", type: "url", placeholder: "https://drive.google.com/drive/folders/..." });
  entrada.value = rascunhos.has(chave) ? rascunhos.get(chave) : (c.linkDrive || "");
  const botao = el("button", { class: "mini", hidden: !rascunhos.has(chave), onClick: async () => {
    rascunhos.delete(chave);
    await atualizar("clientes", c.id, { linkDrive: entrada.value.trim() });
    avisar("Link salvo.");
  } }, "Salvar");
  entrada.addEventListener("input", () => { rascunhos.set(chave, entrada.value); botao.hidden = false; });
  return el("div", { class: "campo-marca" },
    el("div", { class: "com-acao" }, el("h3", {}, "Pasta da marca no Drive"), el("div", { class: "tela-acoes" }, botao, linkExterno(c.linkDrive, "Abrir pasta ↗"))),
    el("p", { class: "subtitulo" }, "Logos, fontes, manual e criativos de referência ficam nesta pasta. O link vai junto no pedido de arte do Canva."),
    entrada);
}

export function abaMarca(c) {
  return el("div", { class: "aba-marca" },
    campoDrive(c),
    editorCores(c),
    campoTexto(c, "fontes", "Fontes", "Ex.: Títulos em Playfair Display Bold; textos em Montserrat. (Os arquivos ficam na pasta do Drive.)", 2),
    campoTexto(c, "tomDeVoz", "Tom de voz", "Como a marca fala: próxima, técnica, bem-humorada... palavras que usa e que evita.", 4, { sugestao: true }),
    campoTexto(c, "persona", "Persona", "Quem é o cliente ideal: nome fictício, idade, rotina, dores, desejos, objeções.", 5, { sugestao: true }),
    campoTexto(c, "publico", "Público-alvo", "Ex.: mulheres 25-45, região de Sorocaba, classe B.", 3, { sugestao: true }),
    campoTexto(c, "estiloVisual", "Estilo de imagem",
      "Que tipo de imagem a marca usa? Ex.: fotos reais de pessoas treinando, luz natural, cores vibrantes. Evitar: banco de imagem genérico.", 4, { sugestao: true }),
    campoTexto(c, "identidadeVisual", "Identidade visual (diagramação)",
      "Ex.: títulos grandes em caixa alta, muito respiro, elementos geométricos, logo sempre no canto inferior.", 3, { sugestao: true }));
}
