// Aba "Marca" da ficha do cliente: pasta do Drive (logos, fontes, referências), paleta, fontes,
// estilo de imagem e diagramação. Alimenta o menu Criar (prompt de imagem e pedido de arte no Canva).
import { el, avisar, linkExterno } from "../ui.js";
import { atualizar } from "../db.js";

const hexValido = (h) => /^#[0-9a-f]{6}$/i.test(h || "");

function editorPaleta(c) {
  const cores = [...(c.paleta || [])];
  const salvar = async () => { await atualizar("clientes", c.id, { paleta: cores.filter(hexValido) }); };
  const lista = el("div", { class: "paleta" });
  const desenhar = () => {
    lista.replaceChildren(...cores.map((cor, i) => {
      const seletor = el("input", { type: "color", value: hexValido(cor) ? cor : "#4E2CA3", "aria-label": `Cor ${i + 1}` });
      const texto = el("input", { type: "text", value: cor, maxlength: 7, class: "hex", "aria-label": `Código da cor ${i + 1}` });
      seletor.addEventListener("change", () => { cores[i] = seletor.value.toUpperCase(); texto.value = cores[i]; salvar(); });
      texto.addEventListener("change", () => {
        const v = texto.value.trim().replace(/^([^#])/, "#$1").toUpperCase();
        if (!hexValido(v)) { avisar("Use o formato #RRGGBB.", "erro"); texto.value = cores[i]; return; }
        cores[i] = v; seletor.value = v; salvar();
      });
      return el("div", { class: "cor" }, seletor, texto,
        el("button", { class: "icone", "aria-label": "Remover cor", onClick: () => { cores.splice(i, 1); desenhar(); salvar(); } }, "✕"));
    }),
    el("button", { class: "secundario mini", onClick: () => { cores.push("#4E2CA3"); desenhar(); salvar(); } }, "+ Cor"));
  };
  desenhar();
  return el("div", {}, el("p", { class: "subtitulo" }, "A primeira cor também identifica o cliente no calendário."), lista);
}

// Texto digitado e ainda não salvo sobrevive às atualizações de tela
const rascunhos = new Map();

function campoTexto(c, campo, rotulo, dica, linhas = 4) {
  const chave = `${c.id}|${campo}`;
  const area = el("textarea", { rows: linhas, placeholder: dica, id: `marca-${campo}` });
  area.value = rascunhos.has(chave) ? rascunhos.get(chave) : (c[campo] || "");
  const botao = el("button", { class: "mini", hidden: !rascunhos.has(chave), onClick: async () => {
    rascunhos.delete(chave);
    await atualizar("clientes", c.id, { [campo]: area.value.trim() });
    avisar("Salvo.");
  } }, "Salvar");
  area.addEventListener("input", () => { rascunhos.set(chave, area.value); botao.hidden = false; });
  return el("div", { class: "campo-marca" }, el("div", { class: "com-acao" }, el("h3", {}, rotulo), botao), area);
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
    el("p", { class: "subtitulo" }, "Logos, fontes, manual e criativos de referência ficam nesta pasta. O link vai junto no pedido de arte do Canva, para o Claude usar os arquivos da marca."),
    entrada);
}

export function abaMarca(c) {
  return el("div", { class: "aba-marca" },
    campoDrive(c),
    el("h3", {}, "Paleta de cores"), editorPaleta(c),
    campoTexto(c, "fontes", "Fontes", "Ex.: Títulos em Playfair Display Bold; textos em Montserrat. (Os arquivos ficam na pasta do Drive.)", 2),
    campoTexto(c, "estiloVisual", "Estilo de imagem",
      "Que tipo de imagem a marca usa? Ex.: fotos reais de pessoas treinando, luz natural, cores vibrantes, close nos rostos, ambientes de academia moderna. Evitar: banco de imagem genérico, ilustração 3D.", 5),
    campoTexto(c, "identidadeVisual", "Identidade visual (diagramação)",
      "Ex.: títulos grandes em caixa alta, muito respiro, elementos geométricos, logo sempre no canto inferior.", 3),
    el("p", { class: "subtitulo" }, "Tom de voz, público e observações ficam em Editar (no topo da ficha)."));
}
