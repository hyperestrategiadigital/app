// Menu Criar: escolhe cliente e post, gera a imagem com a OpenAI seguindo a marca do cliente,
// aplica o texto por cima (editor) e salva a arte no post, baixa o PNG ou leva para o Canva.
import { el, avisar, hojeISO, fmtData, vazio, linkExterno } from "../ui.js";
import { dados, porId, opcoesClientes, atualizar, salvarSub } from "../db.js";
import { cabecalho, abas, abrirTarefa } from "./componentes.js";
import { FORMATOS, PROPORCAO_FORMATO, TIPO_CONTEUDO, rotuloStatusConteudo } from "../constantes.js";
import { promptImagem } from "../prompts.js";
import { gerarImagem, temChave, tamanhoAPI } from "../openai.js";
import { listarArquivos, carregarFontesCliente, comprimirImagem, carregarImagem, lerComoDataURL, caminhoArtes } from "../arquivos.js";
import { desenharArte } from "../arte.js";
import { dataPost } from "../exportacao.js";

const FONTES_PADRAO = [["Barlow Condensed", "Barlow Condensed (Hyper)"], ["Montserrat", "Montserrat (Hyper)"], ["Arial", "Arial"], ["Georgia", "Georgia"], ["Impact", "Impact"]];
const cacheImg = new Map();
const img = (src) => { if (!src) return Promise.resolve(null); if (!cacheImg.has(src)) cacheImg.set(src, carregarImagem(src)); return cacheImg.get(src); };

function configInicial(cliente, post) {
  const paleta = (cliente?.paleta || []).filter(Boolean);
  return {
    titulo: post?.titulo || "", subtitulo: "", cta: "",
    fonteTitulo: "Barlow Condensed", fonteTexto: "Montserrat", caixaAlta: false,
    corTexto: "#FFFFFF", corCta: paleta[1] || "#FFC130", corCtaTexto: "#000000",
    corDegrade: paleta[0] || "#000000", intensidade: 0.75, degrade: true,
    tamTitulo: 9, tamSub: 4, alinhamento: "left", posicao: "base", enquadramento: 0,
    logo: true, posLogo: "sup-esq", tamLogo: 18
  };
}

export function render({ params, estado, renderizar }) {
  // Entrou pelo botão "Criar arte" de um post
  if (params[0] && estado.tarefaId !== params[0]) {
    const t = porId("tarefas", params[0]);
    if (t) Object.assign(estado, { tarefaId: t.id, clienteId: t.clienteId, formato: t.formato || "Feed estático", descricao: null, cfg: null, imagens: [], selecionada: null, etapa: "imagem" });
  }
  estado.etapa ??= "imagem";
  estado.imagens ??= [];
  estado.formato ??= "Feed estático";
  estado.espacoTexto ??= "base";
  estado.qualidade ??= "medium";
  const cliente = porId("clientes", estado.clienteId);
  const post = porId("tarefas", estado.tarefaId);
  const posts = dados.tarefas
    .filter((t) => t.tipo === TIPO_CONTEUDO && t.clienteId === estado.clienteId && t.statusConteudo !== "publicado")
    .sort((a, b) => dataPost(a).localeCompare(dataPost(b)));
  if (estado.descricao == null) estado.descricao = post ? [post.titulo, post.roteiro, post.objetivo ? `Objetivo: ${post.objetivo}` : ""].filter(Boolean).join(". ") : "";
  estado.cfg ??= configInicial(cliente, post);
  const [W, H] = PROPORCAO_FORMATO[estado.formato] || [1080, 1350];

  // Carrega arquivos da marca (logo, fontes, referências) uma vez por cliente
  if (cliente && estado.marcaDe !== cliente.id) {
    estado.marcaDe = cliente.id;
    estado.marca = null;
    Promise.all([listarArquivos(cliente.id), carregarFontesCliente(cliente.id)])
      .then(([arquivos, familias]) => { estado.marca = { arquivos, familias }; renderizar(); })
      .catch((e) => { estado.marca = { arquivos: [], familias: [], erro: e.message }; renderizar(); });
  }
  const refs = estado.marca?.arquivos.filter((a) => a.tipo === "referencia") || [];
  const logoArq = estado.marca?.arquivos.find((a) => a.tipo === "logo");
  estado.usarRefs ??= false;

  const set = (k, re = true) => (e) => { estado[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value; if (re) renderizar(); };

  /* ---------- Escolha de cliente e post ---------- */
  const escolha = el("div", { class: "bloco" },
    el("div", { class: "form-grade" },
      el("label", { class: "campo metade" }, el("span", {}, "Cliente"),
        el("select", { onChange: (e) => { Object.assign(estado, { clienteId: e.target.value, tarefaId: "", descricao: "", cfg: null, imagens: [], selecionada: null }); location.hash = "#/criar"; renderizar(); } },
          opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === (estado.clienteId || "") }, v ? r : "— Escolha o cliente —")))),
      el("label", { class: "campo metade" }, el("span", {}, "Post"),
        el("select", { disabled: !cliente, onChange: (e) => {
          const t = porId("tarefas", e.target.value);
          Object.assign(estado, { tarefaId: e.target.value, formato: t?.formato || estado.formato, descricao: null, cfg: null });
          location.hash = e.target.value ? `#/criar/${e.target.value}` : "#/criar";
          renderizar();
        } },
          el("option", { value: "" }, "— Arte avulsa (sem post) —"),
          posts.map((t) => el("option", { value: t.id, selected: t.id === estado.tarefaId }, `${fmtData(dataPost(t), true)} · ${t.formato || "Post"} · ${t.titulo}`))))),
    post ? el("p", { class: "subtitulo" }, `Etapa: ${rotuloStatusConteudo(post.statusConteudo || "ideia")}. `,
      el("button", { class: "link", onClick: () => abrirTarefa(post) }, "Abrir post"), " ", linkExterno(post.linkCanva, "Canva do post")) : null);

  if (!cliente) return el("div", { class: "tela" }, cabecalho("Criar", "Gere a imagem com a marca do cliente e finalize com texto"), escolha,
    vazio("Escolha um cliente para começar. Dica: abra um post e clique em \"Criar arte\"."));

  const marcaIncompleta = !cliente.estiloVisual || !(cliente.paleta || []).length;

  /* ---------- Etapa 1: imagem ---------- */
  const prompt = promptImagem({ cliente, descricao: estado.descricao, formato: estado.formato, espacoTexto: estado.espacoTexto });
  const gerar = async (botao) => {
    if (!estado.descricao.trim()) { avisar("Descreva a imagem.", "erro"); return; }
    botao.disabled = true; botao.textContent = "Gerando… (até 1 min)";
    try {
      const url = await gerarImagem({
        prompt, tamanho: tamanhoAPI([W, H]), qualidade: estado.qualidade,
        referencias: estado.usarRefs ? refs.slice(0, 4).map((r) => r.dados) : []
      });
      estado.imagens.unshift(url);
      estado.selecionada = 0;
      avisar("Imagem gerada!");
    } catch (e) {
      console.error(e);
      avisar(e.message, "erro");
    } finally { renderizar(); }
  };
  const subir = el("input", { type: "file", accept: "image/*", hidden: true });
  subir.addEventListener("change", async () => {
    if (!subir.files[0]) return;
    estado.imagens.unshift(await lerComoDataURL(subir.files[0]));
    estado.selecionada = 0;
    renderizar();
  });

  const etapaImagem = el("div", { class: "criar-grade" },
    el("section", { class: "bloco" },
      el("h2", {}, "1. Imagem"),
      marcaIncompleta ? el("p", { class: "faixa-alerta" }, "A marca deste cliente está incompleta (paleta ou estilo de imagem). ",
        el("a", { href: `#/clientes/${cliente.id}` }, "Completar na aba Marca →")) : null,
      el("div", { class: "form-grade" },
        el("label", { class: "campo metade" }, el("span", {}, "Formato"),
          el("select", { onChange: set("formato") }, FORMATOS.map((f) => el("option", { value: f, selected: f === estado.formato }, f)))),
        el("label", { class: "campo metade" }, el("span", {}, "Espaço para o texto"),
          el("select", { onChange: set("espacoTexto") }, [["base", "Embaixo"], ["topo", "Em cima"], ["centro", "No centro"], ["nenhum", "Sem espaço"]]
            .map(([v, r]) => el("option", { value: v, selected: v === estado.espacoTexto }, r)))),
        el("label", { class: "campo" }, el("span", {}, "O que a imagem deve mostrar"),
          (() => { const t = el("textarea", { id: "criar-descricao", rows: 4, placeholder: "Ex.: mulher sorrindo correndo ao ar livre ao amanhecer, roupa de treino roxa, energia e superação" }); t.value = estado.descricao; t.addEventListener("input", () => { estado.descricao = t.value; }); t.addEventListener("change", () => renderizar()); return t; })()),
        el("label", { class: "campo metade" }, el("span", {}, "Qualidade"),
          el("select", { onChange: set("qualidade") }, [["low", "Rápida (mais barata)"], ["medium", "Média"], ["high", "Alta (mais cara)"]]
            .map(([v, r]) => el("option", { value: v, selected: v === estado.qualidade }, r)))),
        refs.length ? el("label", { class: "campo metade campo-check" },
          el("input", { type: "checkbox", checked: estado.usarRefs, onChange: set("usarRefs") }), el("span", {}, `Usar ${Math.min(4, refs.length)} criativo(s) de referência da marca`)) : null),
      el("details", { class: "prompt-final" }, el("summary", {}, "Ver o prompt que será enviado"), el("pre", {}, prompt)),
      el("div", { class: "acoes" },
        temChave()
          ? el("button", { class: "destaque", onClick: (e) => gerar(e.currentTarget) }, "✦ Gerar imagem")
          : el("a", { class: "botao-link destaque", href: "#/config" }, "Cadastrar chave da OpenAI"),
        el("button", { class: "secundario", onClick: async () => { await navigator.clipboard.writeText(prompt).catch(() => {}); avisar("Prompt copiado. Cole no ChatGPT e depois suba a imagem aqui."); } }, "Copiar prompt"),
        el("label", { class: "botao-link secundario" }, "Subir imagem pronta", subir))),

    el("section", { class: "bloco" },
      el("h2", {}, `Imagens (${estado.imagens.length})`),
      estado.imagens.length ? el("div", { class: "galeria" }, estado.imagens.map((src, i) =>
        el("button", { class: `miniatura ${i === estado.selecionada ? "ativa" : ""}`, "aria-label": `Usar imagem ${i + 1}`,
          onClick: () => { estado.selecionada = i; renderizar(); } }, el("img", { src, alt: "" }))))
        : vazio("As imagens geradas ou enviadas aparecem aqui."),
      estado.selecionada != null ? el("div", { class: "acoes" },
        el("button", { class: "secundario", onClick: () => baixar(estado.imagens[estado.selecionada], "imagem-sem-texto.png") }, "⬇ Baixar sem texto"),
        el("span", { class: "espaco" }),
        el("button", { onClick: () => { estado.etapa = "texto"; renderizar(); } }, "Aplicar texto →")) : null));

  /* ---------- Etapa 2: texto ---------- */
  const familias = estado.marca?.familias || [];
  const opcoesFonte = [...familias.map((f) => [f.familia, `${f.nome} (marca)`]), ...FONTES_PADRAO];
  const paleta = [...new Set([...(cliente.paleta || []), "#FFFFFF", "#000000", "#FFC130", "#4E2CA3"])];
  const canvas = el("canvas", { class: "previa-arte", "aria-label": "Prévia da arte" });
  const redesenhar = async () => {
    const [fundo, logo] = await Promise.all([img(estado.imagens[estado.selecionada]), img(logoArq?.dados)]);
    await document.fonts.ready;
    desenharArte(canvas, { ...estado.cfg, W, H }, { imagem: fundo, logo });
  };
  const c = estado.cfg;
  const campoCfg = (rotulo, chave, tipo = "text", extra = {}) => {
    let entrada;
    if (tipo === "select") entrada = el("select", {}, extra.opcoes.map(([v, r]) => el("option", { value: v, selected: String(v) === String(c[chave]) }, r)));
    else if (tipo === "textarea") { entrada = el("textarea", { rows: 2 }); entrada.value = c[chave] || ""; }
    else if (tipo === "checkbox") entrada = el("input", { type: "checkbox", checked: !!c[chave] });
    else { entrada = el("input", { type: tipo, ...extra }); entrada.value = c[chave] ?? ""; }
    entrada.id = `cfg-${chave}`;
    entrada.addEventListener("input", () => { c[chave] = tipo === "checkbox" ? entrada.checked : entrada.value; redesenhar(); });
    entrada.addEventListener("change", () => { c[chave] = tipo === "checkbox" ? entrada.checked : entrada.value; redesenhar(); });
    return el("label", { class: `campo ${extra.metade ? "metade" : ""} ${tipo === "checkbox" ? "campo-check" : ""}`, for: entrada.id },
      tipo === "checkbox" ? [entrada, el("span", {}, rotulo)] : [el("span", {}, rotulo), entrada]);
  };
  const seletorCor = (rotulo, chave) => el("div", { class: "campo metade" }, el("span", {}, rotulo),
    el("div", { class: "amostras" }, paleta.map((cor) => el("button", {
      class: `amostra ${c[chave]?.toUpperCase() === cor.toUpperCase() ? "ativa" : ""}`, style: { background: cor }, "aria-label": cor, title: cor,
      onClick: (e) => { c[chave] = cor; e.currentTarget.parentNode.querySelectorAll(".amostra").forEach((b) => b.classList.toggle("ativa", b === e.currentTarget)); redesenhar(); }
    }))));

  const salvarNoPost = async (botao) => {
    if (!post) { avisar("Escolha um post para salvar a arte nele.", "erro"); return; }
    botao.disabled = true; botao.textContent = "Salvando...";
    try {
      const dadosArte = await comprimirImagem(canvas.toDataURL("image/png"), { maxLado: Math.max(W, H) });
      await salvarSub(caminhoArtes(cliente.id), { tarefaId: post.id, formato: estado.formato, dados: dadosArte });
      if (["ideia", "producao", ""].includes(post.statusConteudo || "")) await atualizar("tarefas", post.id, { statusConteudo: "aprovacao" });
      avisar("Arte salva no post! Ela aparece no PDF de aprovação.");
    } catch (e) { avisar("Não consegui salvar: " + e.message, "erro"); }
    finally { botao.disabled = false; botao.textContent = "Salvar no post"; }
  };

  const etapaTexto = estado.selecionada == null ? vazio("Escolha uma imagem na etapa 1.") : el("div", { class: "criar-grade texto" },
    el("section", { class: "bloco controles" },
      el("h2", {}, "2. Texto"),
      el("div", { class: "form-grade" },
        campoCfg("Título", "titulo", "textarea"),
        campoCfg("Linha de apoio", "subtitulo", "textarea"),
        campoCfg("Botão (CTA)", "cta", "text", { metade: true, placeholder: "Ex.: Garanta sua vaga" }),
        campoCfg("Caixa alta no título", "caixaAlta", "checkbox", { metade: true }),
        campoCfg("Fonte do título", "fonteTitulo", "select", { opcoes: opcoesFonte, metade: true }),
        campoCfg("Fonte do texto", "fonteTexto", "select", { opcoes: opcoesFonte, metade: true }),
        campoCfg("Tamanho do título", "tamTitulo", "range", { min: 4, max: 16, step: 0.5, metade: true }),
        campoCfg("Tamanho do apoio", "tamSub", "range", { min: 2, max: 8, step: 0.25, metade: true }),
        seletorCor("Cor do texto", "corTexto"),
        seletorCor("Cor do degradê", "corDegrade"),
        seletorCor("Cor do botão", "corCta"),
        seletorCor("Texto do botão", "corCtaTexto"),
        campoCfg("Posição do texto", "posicao", "select", { opcoes: [["base", "Embaixo"], ["centro", "Centro"], ["topo", "Em cima"]], metade: true }),
        campoCfg("Alinhamento", "alinhamento", "select", { opcoes: [["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"]], metade: true }),
        campoCfg("Degradê atrás do texto", "degrade", "checkbox", { metade: true }),
        campoCfg("Força do degradê", "intensidade", "range", { min: 0, max: 1, step: 0.05, metade: true }),
        campoCfg("Enquadrar imagem (↑↓)", "enquadramento", "range", { min: -50, max: 50, step: 1, metade: true }),
        logoArq ? campoCfg("Aplicar logo", "logo", "checkbox", { metade: true }) : el("p", { class: "subtitulo campo" }, "Sem logo cadastrado na aba Marca do cliente."),
        logoArq ? campoCfg("Posição do logo", "posLogo", "select", { opcoes: [["sup-esq", "Topo esquerda"], ["sup-dir", "Topo direita"], ["inf-esq", "Base esquerda"], ["inf-dir", "Base direita"], ["inf-centro", "Base centro"]], metade: true }) : null,
        logoArq ? campoCfg("Tamanho do logo", "tamLogo", "range", { min: 8, max: 40, step: 1, metade: true }) : null),
      post?.copy ? el("details", { class: "prompt-final" }, el("summary", {}, "Ver a copy do post"), el("pre", {}, post.copy)) : null),
    el("section", { class: "bloco previa" },
      el("div", { class: "com-acao" }, el("h2", {}, `Prévia · ${W}×${H}`),
        el("button", { class: "link", onClick: () => { estado.etapa = "imagem"; renderizar(); } }, "← Trocar imagem")),
      canvas,
      el("div", { class: "acoes" },
        el("button", { class: "destaque", onClick: (e) => salvarNoPost(e.currentTarget), disabled: !post, title: post ? "" : "Escolha um post" }, "Salvar no post"),
        el("button", { class: "secundario", onClick: () => baixar(canvas.toDataURL("image/png"), nomeArte(cliente, post)) }, "⬇ Baixar PNG"),
        el("button", { class: "secundario", onClick: () => levarAoCanva(canvas, cliente, post) }, "Finalizar no Canva"))));
  if (estado.etapa === "texto" && estado.selecionada != null) setTimeout(redesenhar, 0);

  return el("div", { class: "tela tela-larga" },
    cabecalho("Criar", "Imagem com a marca do cliente + texto aplicado por cima",
      abas([["imagem", "1. Imagem"], ["texto", "2. Texto"]], estado.etapa, (e) => { estado.etapa = e; renderizar(); })),
    escolha,
    estado.etapa === "imagem" ? etapaImagem : etapaTexto);
}

const nomeArte = (cliente, post) => `${cliente?.nome || "arte"} ${post ? dataPost(post) : hojeISO()} ${post?.formato || ""}.png`.replace(/[\\/:*?"<>|]/g, "");

function baixar(src, nome) {
  const a = el("a", { href: src, download: nome });
  document.body.append(a); a.click(); a.remove();
}

function levarAoCanva(canvas, cliente, post) {
  baixar(canvas.toDataURL("image/png"), nomeArte(cliente, post));
  window.open(post?.linkCanva || "https://www.canva.com/", "_blank", "noopener");
  avisar("Arte baixada. No Canva, arraste o arquivo para o design (ou Uploads) e finalize.");
}

