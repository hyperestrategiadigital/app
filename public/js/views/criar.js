// Criar arte (abre dentro do post): gera a imagem com a OpenAI seguindo a identidade da marca do post
// e manda para o Canva: baixa a imagem e copia o pedido de arte para o Claude montar o design
// no Canva e devolver o link de edição. O link e a imagem ficam anexados no post.
import { el, avisar, vazio, linkExterno, baixar, abrirModal } from "../ui.js";
import { porId, atualizar, identidade } from "../db.js";
import { FORMATOS, PROPORCAO_FORMATO, formatoAtual } from "../constantes.js";
import { promptImagem, promptCanva } from "../prompts.js";
import { gerarImagem, temChave, tamanhoAPI } from "../openai.js";
import { salvarArte, comprimirImagem, lerComoDataURL } from "../arquivos.js";
import { dataPost } from "../exportacao.js";

/** Endereço antigo #/criar/<post>: abre o calendário e o Criar do post. */
export function redirecionar({ params }) {
  const t = params[0] && porId("tarefas", params[0]);
  location.replace(t?.clienteId ? `#/calendario/${t.clienteId}/${dataPost(t).slice(0, 7)}` : "#/calendario");
  if (t) setTimeout(() => abrirCriarArte(t), 50);
  return el("div");
}

/** Abre o Criar para um post (tarefa do tipo Conteúdo). */
export function abrirCriarArte(postInicial) {
  const estado = {
    formato: formatoAtual(postInicial.formato) || "Estático", espacoTexto: "base", qualidade: "medium", imagens: [], selecionada: null,
    descricao: [postInicial.titulo, postInicial.roteiro, postInicial.objetivo ? `Objetivo: ${postInicial.objetivo}` : ""].filter(Boolean).join(". "),
    texto: { titulo: postInicial.titulo || "", apoio: "", cta: "", observacoes: "" }
  };
  const corpo = el("div", { class: "criar-modal" });
  abrirModal(`Criar arte · ${postInicial.titulo || "post"}`, corpo, { largo: true });
  const desenhar = () => corpo.replaceChildren(...conteudo(porId("tarefas", postInicial.id) || postInicial, estado, desenhar));
  desenhar();
}

function conteudo(post, estado, desenhar) {
  const marca = identidade(post.clienteId, post.marcaId);
  if (!post.clienteId) return [vazio("Escolha o cliente do post antes de criar a arte.")];
  const tamanho = PROPORCAO_FORMATO[estado.formato] || [1080, 1350];
  const set = (k) => (e) => { estado[k] = e.target.value; desenhar(); };
  const marcaIncompleta = !marca.estiloVisual || !(marca.paleta || []).length || !marca.linkDrive;

  /* ---------- 1. Imagem ---------- */
  const prompt = promptImagem({ cliente: marca, descricao: estado.descricao, formato: estado.formato, espacoTexto: estado.espacoTexto });
  const gerar = async (botao) => {
    if (!estado.descricao.trim()) { avisar("Descreva a imagem.", "erro"); return; }
    botao.disabled = true; botao.textContent = "Gerando… (até 1 min)";
    try {
      estado.imagens.unshift(await gerarImagem({ prompt, tamanho: tamanhoAPI(tamanho), qualidade: estado.qualidade }));
      estado.selecionada = 0;
      avisar("Imagem gerada!");
    } catch (e) {
      console.error(e);
      avisar(e.message, "erro");
    } finally { desenhar(); }
  };
  const subir = el("input", { type: "file", accept: "image/*", hidden: true });
  subir.addEventListener("change", async () => {
    if (!subir.files[0]) return;
    estado.imagens.unshift(await lerComoDataURL(subir.files[0]));
    estado.selecionada = 0;
    desenhar();
  });
  const descricao = el("textarea", { id: "criar-descricao", rows: 4, placeholder: "Ex.: noiva sorrindo no ateliê, luz natural da janela, vestido rendado, clima romântico" });
  descricao.value = estado.descricao;
  descricao.addEventListener("input", () => { estado.descricao = descricao.value; });
  descricao.addEventListener("change", () => desenhar());

  const etapaImagem = el("section", { class: "bloco" },
    el("h2", {}, "1. Gerar a imagem"),
    el("p", { class: "subtitulo" }, `Segue a identidade de ${marca.marcaId ? `${marca.nome} (${marca.clienteNome})` : marca.nome}.`),
    marcaIncompleta ? el("p", { class: "faixa-alerta" }, "A identidade está incompleta (pasta do Drive, paleta ou estilo de imagem). ",
      el("a", { href: `#/clientes/${post.clienteId}`, onClick: () => document.querySelectorAll(".modal-fundo").forEach((m) => m.remove()) }, "Completar na aba Marca →")) : null,
    el("div", { class: "form-grade" },
      el("label", { class: "campo metade" }, el("span", {}, "Formato"),
        el("select", { onChange: set("formato") }, FORMATOS.map((f) => el("option", { value: f, selected: f === estado.formato }, f)))),
      el("label", { class: "campo metade" }, el("span", {}, "Espaço para o texto"),
        el("select", { onChange: set("espacoTexto") }, [["base", "Embaixo"], ["topo", "Em cima"], ["centro", "No centro"], ["nenhum", "Sem espaço"]]
          .map(([v, r]) => el("option", { value: v, selected: v === estado.espacoTexto }, r)))),
      el("label", { class: "campo", for: "criar-descricao" }, el("span", {}, "O que a imagem deve mostrar"), descricao),
      el("label", { class: "campo metade" }, el("span", {}, "Qualidade"),
        el("select", { onChange: set("qualidade") }, [["low", "Rápida (mais barata)"], ["medium", "Média"], ["high", "Alta (mais cara)"]]
          .map(([v, r]) => el("option", { value: v, selected: v === estado.qualidade }, r))))),
    el("details", { class: "prompt-final" }, el("summary", {}, "Ver o prompt que vai para o ChatGPT"), el("pre", {}, prompt)),
    el("div", { class: "acoes" },
      temChave()
        ? el("button", { class: "destaque", onClick: (e) => gerar(e.currentTarget) }, "✦ Gerar imagem")
        : el("span", { class: "subtitulo" }, "Para gerar aqui, o administrador cadastra a chave da OpenAI em Ajustes."),
      el("button", { class: "secundario", onClick: async () => { await navigator.clipboard.writeText(prompt).catch(() => {}); avisar("Prompt copiado. Cole no ChatGPT e depois suba a imagem aqui."); } }, "Copiar prompt"),
      el("label", { class: "botao-link secundario" }, "Subir imagem pronta", subir)),
    estado.imagens.length ? [
      el("h3", {}, `Imagens (${estado.imagens.length}) — escolha uma`),
      el("div", { class: "galeria" }, estado.imagens.map((src, i) =>
        el("button", { class: `miniatura ${i === estado.selecionada ? "ativa" : ""}`, "aria-label": `Usar imagem ${i + 1}`,
          onClick: () => { estado.selecionada = i; desenhar(); } }, el("img", { src, alt: "" }))))
    ] : null);

  /* ---------- 2. Canva ---------- */
  const imagem = estado.selecionada != null ? estado.imagens[estado.selecionada] : null;
  const campoTexto = (rotulo, chave, dica, textarea = false) => {
    const e = el(textarea ? "textarea" : "input", { id: `texto-${chave}`, rows: textarea ? 2 : undefined, placeholder: dica });
    e.value = estado.texto[chave] || "";
    e.addEventListener("input", () => { estado.texto[chave] = e.value; });
    return el("label", { class: `campo ${textarea ? "" : "metade"}`, for: e.id }, el("span", {}, rotulo), e);
  };
  const nomeImagem = `${marca.nome} ${dataPost(post) || "post"} ${estado.formato}.png`.replace(/[\\/:*?"<>|]/g, "");
  const pedido = () => promptCanva({ post, cliente: marca, formato: estado.formato, tamanho, texto: estado.texto });
  const levarAoCanva = async () => {
    baixar(imagem, nomeImagem);
    try { await navigator.clipboard.writeText(pedido()); } catch {}
    try {
      await salvarArte(post.clienteId, post.id, await comprimirImagem(imagem), { origem: "gerada", nome: "Imagem gerada" });
      if (["ideia", ""].includes(post.statusConteudo || "")) await atualizar("tarefas", post.id, { statusConteudo: "producao", status: "andamento" });
    } catch (e) { console.warn("Não salvou a imagem no post:", e); }
    window.open("https://claude.ai/new", "_blank", "noopener");
    avisar("Imagem baixada e pedido copiado. No Claude: cole o pedido (Ctrl+V) e anexe a imagem baixada.");
  };
  const linkCanva = el("input", { id: "criar-link-canva", type: "url", placeholder: "https://www.canva.com/design/..." });
  linkCanva.value = post.linkCanva || "";

  const etapaCanva = el("section", { class: "bloco" },
    el("h2", {}, "2. Finalizar no Canva"),
    !imagem ? vazio("Gere ou suba uma imagem e escolha uma na galeria.") : [
      el("img", { class: "previa-imagem", src: imagem, alt: "Imagem escolhida" }),
      el("p", { class: "subtitulo" }, "Ideia do texto da arte (vai no pedido para o Claude montar o design no Canva):"),
      el("div", { class: "form-grade" },
        campoTexto("Título", "titulo", "Ex.: O vestido dos seus sonhos"),
        campoTexto("Botão / CTA", "cta", "Ex.: Agende sua prova"),
        campoTexto("Linha de apoio", "apoio", "Ex.: 10% off com o cupom NOIVA10 até domingo", true),
        campoTexto("Observações de layout", "observacoes", "Ex.: título no topo, logo embaixo, faixa na cor da marca", true)),
      el("ol", { class: "passos" },
        el("li", {}, "Clique em \"Levar ao Canva\": a imagem é baixada (e fica salva no post), o pedido de arte é copiado e o Claude abre numa nova aba."),
        el("li", {}, "No Claude, cole o pedido (Ctrl+V) e anexe a imagem baixada. Ele monta o design no Canva com a marca e devolve o link."),
        el("li", {}, "Cole o link aqui embaixo, finalize no Canva e depois anexe o criativo final no post.")),
      el("div", { class: "acoes" },
        el("button", { class: "destaque", onClick: levarAoCanva }, "Levar ao Canva"),
        el("button", { class: "secundario", onClick: () => baixar(imagem, nomeImagem) }, "⬇ Só baixar a imagem"),
        el("button", { class: "secundario", onClick: async () => { await navigator.clipboard.writeText(pedido()).catch(() => {}); avisar("Pedido de arte copiado."); } }, "Copiar só o pedido"))
    ],
    el("div", { class: "form-grade link-canva" },
      el("label", { class: "campo", for: "criar-link-canva" }, el("span", {}, "Link do Canva deste post"), linkCanva),
      el("div", { class: "acoes campo" },
        el("button", { onClick: async () => {
          await atualizar("tarefas", post.id, { linkCanva: linkCanva.value.trim() });
          avisar("Link do Canva salvo no post.");
        } }, "Salvar link no post"),
        linkExterno(post.linkCanva, "Abrir no Canva ↗"))));

  return [el("div", { class: "criar-grade" }, etapaImagem, etapaCanva)];
}
