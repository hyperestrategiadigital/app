// Studio (em desenvolvimento): onde a equipe e o cliente criam conteúdo já na identidade da marca.
// 1) escolhe a marca; 2) escolhe o Studio: fotográfico (direção e roteiro de fotos), de conteúdo (legenda e
// pedido de arte com o tom, as cores e as fontes da marca) ou ideias (pauta na linha editorial da marca).
// A equipe salva como post; o cliente envia como sugestão (entra como "ideia" para a Hyper).
// Rotas: #/studio, #/studio/<conta>, #/studio/<conta>/<foto|conteudo|ideias>.
import { el, avisar, hojeISO, vazio, amostraCor } from "../ui.js";
import { dados, porId, marcasDo, identidade } from "../db.js";
import { ehCliente, pode } from "../permissoes.js";
import { TIPO_CONTEUDO, FORMATOS, REDES, PROPORCAO_FORMATO } from "../constantes.js";
import { dataPost, nomeMes } from "../exportacao.js";
import { promptCopy, promptCanva, promptFotos, promptIdeias, promptImagem } from "../prompts.js";
import { temChave, gerarTexto, gerarImagem, tamanhoAPI } from "../openai.js";
import { cabecalho, corCliente, abrirTarefa } from "./componentes.js";
import { contasDoPortal, criarSugestao } from "./portal.js";

/** Contas (marcas) em que a pessoa pode usar o Studio. Cliente: as dele. Equipe: todos os clientes ativos que vê. */
export function contasDoStudio() {
  if (ehCliente()) return contasDoPortal();
  return dados.clientes.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).flatMap((c) => {
    const marcas = marcasDo(c.id);
    if (!marcas.length) return [{ chave: c.id, clienteId: c.id, marcaId: "", nome: c.nome, obj: c }];
    return [...marcas.map((m) => ({ chave: m.id, clienteId: c.id, marcaId: m.id, nome: m.nome, grupo: c.nome, obj: m })),
      { chave: `${c.id}~grupo`, clienteId: c.id, marcaId: "", nome: `${c.nome} (institucional)`, grupo: c.nome, obj: c }];
  });
}

const MODOS = [
  ["foto", "📷", "Studio fotográfico", "Direção de fotos da marca e roteiro do que fotografar, para sair com a cara dela."],
  ["conteudo", "✍", "Studio de conteúdo", "Legenda e pedido de arte já com o tom de voz, as cores e as fontes da marca."],
  ["ideias", "💡", "Ideias", "Pauta de posts na linha editorial da marca, para virar post ou sugestão."]
];

/** Copia o pedido e abre o Claude numa conversa nova. */
async function levarAoClaude(texto, aviso = "Pedido copiado! Cole no Claude.") {
  try { await navigator.clipboard.writeText(texto); avisar(aviso); } catch { avisar("Não consegui copiar o pedido.", "erro"); }
  window.open("https://claude.ai/new", "_blank", "noopener");
}

/** Usa a IA do app (OpenAI) só quem é da equipe com Conteúdo e com a chave cadastrada. */
const iaNoApp = () => !ehCliente() && pode("conteudo") && temChave();

function kitDaMarca(id, { completo = false } = {}) {
  const paleta = (id.paleta || []).filter(Boolean);
  return el("section", { class: "bloco studio-kit", style: { "--selo": paleta[0] || "var(--hyper-roxo)" } },
    el("div", { class: "studio-kit-topo" },
      id.logo ? el("img", { class: "logo-chip", src: id.logo, alt: "" }) : null,
      el("strong", {}, id.nome),
      paleta.length ? el("div", { class: "paleta-leitura" }, paleta.map((c) => amostraCor(c))) : null),
    id.fontes ? el("p", {}, el("strong", {}, "Fontes: "), id.fontes) : null,
    id.tomDeVoz ? el("p", {}, el("strong", {}, "Tom de voz: "), id.tomDeVoz) : null,
    completo && id.diretrizes ? el("details", {}, el("summary", {}, "Diretrizes de conteúdo"), el("p", { class: "portal-texto" }, id.diretrizes)) : null,
    !id.tomDeVoz && !paleta.length ? el("p", { class: "subtitulo" }, ehCliente()
      ? "A identidade desta marca ainda está sendo preenchida pela Hyper."
      : "Identidade ainda vazia: preencha na aba Marca do cliente para o Studio usar.") : null);
}

/** Campo simples ligado ao estado (sem redesenhar a tela a cada tecla). */
function campo(estado, nome, rotulo, { tipo = "text", opcoes = null, linhas = 3, dica = "" } = {}) {
  const id = `studio-${nome}`;
  const aoMudar = (e) => { estado[nome] = e.target.value; };
  const entrada = opcoes
    ? el("select", { id, onChange: aoMudar }, opcoes.map((o) => el("option", { value: o, selected: o === estado[nome] }, o)))
    : tipo === "textarea"
      ? el("textarea", { id, rows: linhas, placeholder: dica, onInput: aoMudar }, estado[nome] || "")
      : el("input", { id, type: tipo, value: estado[nome] || "", placeholder: dica, onInput: aoMudar });
  return el("label", { class: "campo" }, el("span", {}, rotulo), entrada);
}

/** Resultado da IA do app (texto) com copiar. */
function resultado(texto, titulo = "Resultado") {
  if (!texto) return null;
  return el("section", { class: "bloco" },
    el("div", { class: "com-acao" }, el("h3", {}, titulo),
      el("button", { class: "secundario mini", onClick: async () => { await navigator.clipboard.writeText(texto).catch(() => {}); avisar("Copiado."); } }, "Copiar")),
    el("div", { class: "portal-copy" }, texto));
}

async function comEspera(botao, fn) {
  const rotulo = botao.textContent;
  botao.disabled = true; botao.textContent = "Gerando…";
  try { await fn(); } catch (e) { avisar(e.message, "erro"); }
  botao.disabled = false; botao.textContent = rotulo;
}

/* ---------------- Studio fotográfico ---------------- */

function dicasDeFoto(id, formato) {
  const vertical = /story|reels|tiktok|vídeo|video/i.test(formato || "");
  const paleta = (id.paleta || []).filter(Boolean);
  return [
    vertical ? "Segure o celular na vertical (9:16) e deixe o assunto no centro." : "Para o feed, fotografe na vertical e pense no corte 4:5 (deixe folga em cima e embaixo).",
    "Luz natural de janela, sem flash. Evite o sol forte do meio-dia.",
    "Limpe a lente e toque na tela para focar no assunto.",
    paleta.length ? "Traga as cores da marca para o cenário, a roupa ou os objetos (veja a paleta acima)." : null,
    "Deixe um espaço livre (céu, parede, mesa) para aplicar texto depois.",
    "Faça várias versões: de perto, de longe, de cima e com pessoas em ação.",
    "Fundo arrumado: tire da cena o que não é da marca."
  ].filter(Boolean);
}

function telaFoto(conta, id, estado, renderizar) {
  const e = (estado.foto ??= { formato: "Feed estático" });
  return [
    el("section", { class: "bloco" },
      el("h2", {}, "Direção de fotos da marca"),
      id.estiloVisual ? el("p", { class: "portal-texto" }, id.estiloVisual)
        : el("p", { class: "subtitulo" }, ehCliente() ? "A Hyper ainda não descreveu o estilo de fotos desta marca. Por enquanto, siga as dicas abaixo." : "Preencha \"Estilo de imagem\" na aba Marca para dar a direção das fotos."),
      id.publico ? el("p", {}, el("strong", {}, "Para quem: "), id.publico) : null,
      el("h3", {}, "Na hora de fotografar"),
      el("ul", { class: "studio-dicas" }, dicasDeFoto(id, e.formato).map((d) => el("li", {}, d)))),
    el("section", { class: "bloco" },
      el("h2", {}, "Roteiro da sessão"),
      el("div", { class: "grade-campos" },
        campo(e, "assunto", "O que vai fotografar?", { dica: "Ex.: aula de spinning lotada, novo cardápio, equipe no atendimento" }),
        campo(e, "formato", "Onde vai usar", { opcoes: FORMATOS }),
        campo(e, "local", "Local / ambiente", { dica: "Ex.: recepção, estúdio, área externa" })),
      el("div", { class: "acoes" },
        el("button", { class: "destaque", onClick: () => levarAoClaude(promptFotos(id, e), "Roteiro copiado! Cole no Claude para ele montar as fotos.") }, "📋 Roteiro com o Claude"),
        iaNoApp() ? el("button", { class: "secundario", onClick: (ev) => comEspera(ev.currentTarget, async () => {
          e.roteiro = await gerarTexto({ sistema: "Você é diretor de fotografia da Hyper Estratégia Digital. Responda em português do Brasil, em tópicos curtos.", pedido: promptFotos(id, e) });
          renderizar();
        }) }, "✨ Gerar roteiro aqui") : null,
        iaNoApp() ? el("button", { class: "secundario", onClick: (ev) => comEspera(ev.currentTarget, async () => {
          if (!e.assunto) throw new Error("Escreva o que vai fotografar.");
          e.imagem = await gerarImagem({ prompt: promptImagem({ cliente: id, descricao: `Foto de referência: ${e.assunto}${e.local ? `, em ${e.local}` : ""}.`, formato: e.formato }), tamanho: tamanhoAPI(PROPORCAO_FORMATO[e.formato] || [1080, 1350]), qualidade: "low" });
          renderizar();
        }) }, "🖼 Imagem de referência") : null)),
    resultado(e.roteiro, "Roteiro de fotos"),
    e.imagem ? el("section", { class: "bloco" }, el("h3", {}, "Referência (não é a foto final)"),
      el("img", { class: "studio-referencia", src: e.imagem, alt: "Imagem de referência gerada" }),
      el("p", { class: "subtitulo" }, "Use como inspiração de enquadramento, luz e cores. A foto de verdade fica mais autêntica.")) : null
  ];
}

/* ---------------- Studio de conteúdo ---------------- */

function postDoEstado(conta, e) {
  return { tipo: TIPO_CONTEUDO, clienteId: conta.clienteId, marcaId: conta.marcaId, titulo: e.titulo || "", formato: e.formato || "", rede: e.rede || "",
    objetivo: e.objetivo || "", roteiro: e.briefing || "", dataPublicacao: e.dataPublicacao || "", copy: e.copy || "" };
}

function telaConteudo(conta, id, estado, renderizar) {
  const e = (estado.conteudo ??= { formato: "Carrossel", rede: "Instagram" });
  const post = () => postDoEstado(conta, e);
  return [
    el("section", { class: "bloco" },
      el("h2", {}, "A peça"),
      el("div", { class: "grade-campos" },
        campo(e, "titulo", "Tema", { dica: "Ex.: 3 erros de quem começa a treinar" }),
        campo(e, "formato", "Formato", { opcoes: FORMATOS }),
        campo(e, "rede", "Rede", { opcoes: REDES }),
        campo(e, "dataPublicacao", "Data (opcional)", { tipo: "date" }),
        campo(e, "objetivo", "Objetivo", { dica: "Ex.: gerar matrículas, engajar, informar" })),
      campo(e, "briefing", "Briefing / roteiro (opcional)", { tipo: "textarea", linhas: 3, dica: "O que não pode faltar, dados, oferta…" }),
      el("div", { class: "acoes" },
        el("button", { class: "destaque", onClick: () => { if (!e.titulo) return avisar("Escreva o tema.", "erro"); levarAoClaude(promptCopy(post()), "Pedido copiado! Cole no Claude: ele escreve no tom de voz da marca."); } }, "✨ Legenda com o Claude"),
        iaNoApp() ? el("button", { class: "secundario", onClick: (ev) => comEspera(ev.currentTarget, async () => {
          if (!e.titulo) throw new Error("Escreva o tema.");
          e.copy = await gerarTexto({ sistema: "Você é copywriter da Hyper Estratégia Digital. Responda só com a legenda pronta para publicar, em português do Brasil.", pedido: promptCopy(post()) });
          renderizar();
        }) }, "Escrever aqui") : null,
        el("button", { class: "secundario", onClick: () => { if (!e.titulo) return avisar("Escreva o tema.", "erro");
          levarAoClaude(promptCanva({ post: post(), cliente: id, formato: e.formato, tamanho: PROPORCAO_FORMATO[e.formato], texto: {} }), "Pedido de arte copiado! Cole no Claude com o Canva conectado (anexe a foto, se tiver)."); } }, "🎨 Arte no Canva"))),
    el("section", { class: "bloco" },
      el("h2", {}, "Legenda"),
      campo(e, "copy", "Cole aqui a legenda do Claude ou escreva a sua", { tipo: "textarea", linhas: 8 }),
      el("div", { class: "acoes" },
        ehCliente()
          ? el("button", { class: "confirmar", onClick: async (ev) => {
            if (!e.titulo) return avisar("Escreva o tema.", "erro");
            ev.currentTarget.disabled = true;
            try {
              await criarSugestao(conta, { ...e, notas: [e.objetivo ? `Objetivo: ${e.objetivo}` : "", e.briefing].filter(Boolean).join("\n") });
              estado.conteudo = { formato: e.formato, rede: e.rede };
              avisar("Enviado para a Hyper como sugestão de post."); renderizar();
            } catch (erro) { avisar(erro.message, "erro"); ev.currentTarget.disabled = false; }
          } }, "Enviar para a Hyper")
          : el("button", { class: "confirmar", onClick: () => {
            if (!e.titulo) return avisar("Escreva o tema.", "erro");
            const d = e.dataPublicacao || hojeISO();
            abrirTarefa({ ...post(), dataPublicacao: e.dataPublicacao || "", prazo: d, statusConteudo: e.copy ? "producao" : "ideia" });
          } }, "Salvar como post")))
  ];
}

/* ---------------- Ideias ---------------- */

/** Linhas "Formato | Tema | Gancho | Por quê" → ideias. Aceita também listas simples. */
export function lerIdeias(texto = "") {
  return texto.split("\n").map((l) => l.replace(/^\s*(\d+[.)-]|[-*•])\s*/, "").trim()).filter((l) => l && !/^formato\s*\|/i.test(l) && !/^[-|\s]+$/.test(l))
    .map((l) => {
      const p = l.split("|").map((x) => x.trim().replace(/\*\*/g, ""));
      if (p.length >= 2) return { formato: FORMATOS.find((f) => p[0].toLowerCase().includes(f.toLowerCase().split(" ")[0])) || "", tema: p[1], gancho: p[2] || "", porque: p[3] || "" };
      return { formato: "", tema: l.replace(/\*\*/g, ""), gancho: "", porque: "" };
    }).filter((i) => i.tema);
}

function telaIdeias(conta, id, estado, renderizar) {
  const e = (estado.ideias ??= { quantidade: "10", mes: hojeISO().slice(0, 7) });
  const jaPlanejados = dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && t.clienteId === conta.clienteId && (t.marcaId || "") === conta.marcaId && dataPost(t).startsWith(e.mes)).map((t) => t.titulo);
  const pedido = () => promptIdeias(id, { quantidade: Number(e.quantidade) || 10, foco: e.foco, mes: nomeMes(e.mes), jaPlanejados });
  const ideias = lerIdeias(e.texto);
  const usar = async (i, botao) => {
    const v = { titulo: i.tema, formato: i.formato, rede: "Instagram", copy: "", notas: [i.gancho ? `Gancho: ${i.gancho}` : "", i.porque ? `Por quê: ${i.porque}` : ""].filter(Boolean).join("\n") };
    if (!ehCliente()) return abrirTarefa({ tipo: TIPO_CONTEUDO, clienteId: conta.clienteId, marcaId: conta.marcaId, titulo: v.titulo, formato: v.formato, rede: v.rede, notas: v.notas, prazo: hojeISO(), statusConteudo: "ideia" });
    botao.disabled = true;
    try { await criarSugestao(conta, v); botao.textContent = "Enviada ✓"; avisar("Ideia enviada para a Hyper."); }
    catch (erro) { avisar(erro.message, "erro"); botao.disabled = false; }
  };
  return [
    el("section", { class: "bloco" },
      el("h2", {}, "Pedir ideias"),
      el("div", { class: "grade-campos" },
        campo(e, "foco", "Foco do mês", { dica: "Ex.: lançamento da turma nova, Black Friday, autoridade" }),
        campo(e, "mes", "Mês", { tipo: "month" }),
        campo(e, "quantidade", "Quantas ideias", { opcoes: ["5", "10", "15"] })),
      jaPlanejados.length ? el("p", { class: "subtitulo" }, `${jaPlanejados.length} post(s) já planejados neste mês vão junto, para não repetir.`) : null,
      el("div", { class: "acoes" },
        el("button", { class: "destaque", onClick: () => levarAoClaude(pedido(), "Pedido copiado! Cole no Claude e traga as ideias de volta aqui embaixo.") }, "💡 Ideias com o Claude"),
        iaNoApp() ? el("button", { class: "secundario", onClick: (ev) => comEspera(ev.currentTarget, async () => {
          e.texto = await gerarTexto({ sistema: "Você é estrategista de conteúdo da Hyper Estratégia Digital. Responda só com as linhas pedidas, sem introdução.", pedido: pedido() });
          renderizar();
        }) }, "Gerar aqui") : null)),
    el("section", { class: "bloco" },
      el("h2", {}, "Suas ideias"),
      campo(e, "texto", "Cole aqui as ideias do Claude (uma por linha) ou escreva as suas", { tipo: "textarea", linhas: 6 }),
      el("div", { class: "acoes" }, el("button", { class: "secundario mini", onClick: renderizar }, "Organizar ideias")),
      ideias.length ? el("div", { class: "portal-lista compacta" }, ideias.map((i) => el("article", { class: "portal-post", style: { "--selo": corCliente(conta.obj) } },
        el("div", { class: "portal-post-topo" }, i.formato ? el("span", { class: "etiqueta" }, i.formato) : null),
        el("h3", {}, i.tema),
        i.gancho ? el("p", {}, el("strong", {}, "Gancho: "), i.gancho) : null,
        i.porque ? el("p", { class: "subtitulo" }, i.porque) : null,
        el("button", { class: "secundario mini", onClick: (ev) => usar(i, ev.currentTarget) }, ehCliente() ? "Enviar para a Hyper" : "+ Virar post"))))
        : null)
  ];
}

/* ---------------- Tela ---------------- */

export function render({ params = [], estado, renderizar }) {
  const contas = contasDoStudio();
  const selo = el("span", { class: "etiqueta studio-selo" }, "Em desenvolvimento");
  const [chave, modo] = params;
  const conta = contas.find((k) => k.chave === chave);

  if (!conta) {
    if (contas.length === 1) { location.replace(`#/studio/${encodeURIComponent(contas[0].chave)}`); return el("div"); }
    return el("div", { class: "tela tela-studio" },
      cabecalho("Studio", "Crie fotos, textos e ideias já na identidade da marca. Para começar, escolha a marca.", selo),
      contas.length ? el("div", { class: "grade-clientes" }, contas.map((k) => el("a", { class: "cartao-cliente cartao-marca", href: `#/studio/${encodeURIComponent(k.chave)}`, style: { "--selo": corCliente(k.obj) } },
        el("div", { class: "ficha-titulo" }, k.obj.logo ? el("img", { class: "logo-chip", src: k.obj.logo, alt: "" }) : null, el("h3", {}, k.nome)),
        k.grupo && k.marcaId ? el("p", { class: "subtitulo" }, k.grupo) : null)))
        : vazio("Nenhuma marca disponível."));
  }

  const id = identidade(conta.clienteId, conta.marcaId);
  const escolhido = MODOS.find(([v]) => v === modo);
  const voltar = escolhido ? `#/studio/${encodeURIComponent(conta.chave)}` : contas.length > 1 ? "#/studio" : null;
  estado.porConta ??= {};
  const e = (estado.porConta[conta.chave] ??= {});
  const corpo = !escolhido
    ? el("div", { class: "studio-modos" }, MODOS.map(([v, icone, titulo, desc]) => el("a", { class: "studio-modo", href: `#/studio/${encodeURIComponent(conta.chave)}/${v}`, style: { "--selo": corCliente(conta.obj) } },
      el("span", { class: "studio-icone", "aria-hidden": "true" }, icone), el("strong", {}, titulo), el("span", {}, desc))))
    : modo === "foto" ? telaFoto(conta, id, e, renderizar) : modo === "conteudo" ? telaConteudo(conta, id, e, renderizar) : telaIdeias(conta, id, e, renderizar);

  return el("div", { class: "tela tela-studio" },
    voltar ? el("a", { href: voltar, class: "voltar" }, escolhido ? `← Studio · ${conta.nome}` : "← Trocar marca") : null,
    cabecalho(escolhido ? escolhido[2] : `Studio · ${conta.nome}`, escolhido ? conta.nome : "O que você quer criar?", selo),
    kitDaMarca(id, { completo: modo === "conteudo" }),
    corpo);
}
