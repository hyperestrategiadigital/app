// Aba "Marca" da ficha do cliente: paleta, logo, fontes, criativos de referência e estilo de imagem.
// Tudo isso alimenta o menu Criar (prompt de imagem e editor de texto).
import { el, avisar, confirmar } from "../ui.js";
import { atualizar } from "../db.js";
import {
  listarArquivos, salvarArquivo, excluirArquivo, comprimirImagem, lerComoDataURL, carregarFontesCliente, LIMITE_BYTES
} from "../arquivos.js";

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

async function enviarArquivos(c, arquivos, tipo) {
  for (const f of arquivos) {
    try {
      let dados;
      if (tipo === "fonte") {
        if (f.size > LIMITE_BYTES) throw new Error(`${f.name} tem ${Math.round(f.size / 1024)} KB. O limite é ${LIMITE_BYTES / 1024} KB (prefira .woff2).`);
        dados = await lerComoDataURL(f);
      } else {
        dados = await comprimirImagem(f, { maxLado: tipo === "logo" ? 800 : 1400, manterPNG: tipo === "logo" });
      }
      await salvarArquivo(c.id, { tipo, nome: f.name.replace(/\.[^.]+$/, ""), mime: f.type, dados });
    } catch (e) { avisar(e.message, "erro"); }
  }
}

function areaArquivos(c, aoMudar) {
  const caixa = el("div", { class: "arquivos-marca" }, el("p", { class: "subtitulo" }, "Carregando arquivos..."));
  const botaoUpload = (rotulo, tipo, accept, multiplo) => {
    const entrada = el("input", { type: "file", accept, multiple: multiplo, hidden: true });
    entrada.addEventListener("change", async () => {
      if (!entrada.files.length) return;
      avisar("Enviando...");
      await enviarArquivos(c, [...entrada.files], tipo);
      entrada.value = "";
      aoMudar();
    });
    return el("label", { class: "botao-link secundario mini" }, rotulo, entrada);
  };
  const remover = (a) => async () => {
    if (await confirmar(`Remover "${a.nome}"?`)) { await excluirArquivo(c.id, a.id); aoMudar(); }
  };

  listarArquivos(c.id).then(async (lista) => {
    const logos = lista.filter((a) => a.tipo === "logo");
    const fontes = lista.filter((a) => a.tipo === "fonte");
    const refs = lista.filter((a) => a.tipo === "referencia");
    const familias = await carregarFontesCliente(c.id);
    caixa.replaceChildren(
      el("div", { class: "com-acao" }, el("h3", {}, "Logo"), botaoUpload("+ Logo (PNG)", "logo", "image/png,image/svg+xml,image/webp", false)),
      logos.length ? el("div", { class: "grade-refs" }, logos.map((a) =>
        el("figure", { class: "ref logo" }, el("img", { src: a.dados, alt: a.nome }), el("button", { class: "icone", "aria-label": "Remover", onClick: remover(a) }, "✕"))))
        : el("p", { class: "subtitulo" }, "Nenhum logo. Ele pode ser aplicado sobre as artes no menu Criar."),

      el("div", { class: "com-acao" }, el("h3", {}, "Fontes"), botaoUpload("+ Fonte (.ttf, .otf, .woff2)", "fonte", ".ttf,.otf,.woff,.woff2", true)),
      fontes.length ? el("ul", { class: "lista-fontes" }, fontes.map((a) => {
        const fam = familias.find((x) => x.familia === `cliente-${a.id}`);
        return el("li", {}, el("span", { class: "amostra-fonte", style: { "font-family": fam ? `"${fam.familia}"` : "inherit" } }, `${a.nome} — Aa Bb 123`),
          el("button", { class: "icone", "aria-label": "Remover", onClick: remover(a) }, "✕"));
      })) : el("p", { class: "subtitulo" }, "Nenhuma fonte. Suba as fontes da marca para usar no editor de texto."),

      el("div", { class: "com-acao" }, el("h3", {}, "Criativos de referência"), botaoUpload("+ Imagens", "referencia", "image/*", true)),
      refs.length ? el("div", { class: "grade-refs" }, refs.map((a) =>
        el("figure", { class: "ref" }, el("img", { src: a.dados, alt: a.nome, loading: "lazy" }), el("button", { class: "icone", "aria-label": "Remover", onClick: remover(a) }, "✕"))))
        : el("p", { class: "subtitulo" }, "Suba criativos que a marca já usa e que você gosta. Eles podem guiar a geração de imagem."));
  }).catch((e) => caixa.replaceChildren(el("p", { class: "erro" }, "Não consegui carregar os arquivos: " + e.message)));
  return caixa;
}

export function abaMarca(c, renderizar) {
  const arquivos = el("div");
  const recarregar = () => { listarArquivos(c.id, { recarregar: true }).finally(() => arquivos.replaceChildren(areaArquivos(c, recarregar))); };
  arquivos.append(areaArquivos(c, recarregar));
  return el("div", { class: "aba-marca" },
    el("h3", {}, "Paleta de cores"), editorPaleta(c),
    campoTexto(c, "estiloVisual", "Estilo de imagem",
      "Que tipo de imagem a marca usa? Ex.: fotos reais de pessoas treinando, luz natural, cores vibrantes, close nos rostos, ambientes de academia moderna. Evitar: banco de imagem genérico, ilustração 3D.", 5),
    campoTexto(c, "identidadeVisual", "Identidade visual (diagramação)",
      "Ex.: títulos grandes em caixa alta, muito respiro, elementos geométricos, logo sempre no canto inferior.", 3),
    el("p", { class: "subtitulo" }, "Tom de voz, público e observações ficam em Editar (no topo da ficha)."),
    arquivos);
}
