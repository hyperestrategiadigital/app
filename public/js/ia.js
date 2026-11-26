// Motor do pedido de copy para a IA de cada pessoa (Claude ou ChatGPT, no navegador dela). É o único uso de IA
// na plataforma: o app não chama a IA, monta um pedido completo, em camadas, que a pessoa cola na IA dela, e depois
// lê a resposta colada de volta (marcadores como [LEGENDA]). Camadas, sempre nesta ordem:
//   papel → manual da Hyper → marca → exemplos aprovados → o conteúdo → regras do formato/rede → como responder → checklist.
import { dados, porId, identidade, marcasDo } from "./db.js";
import { TIPO_CONTEUDO, rotuloObjetivo } from "./constantes.js";
import { MANUAL_PADRAO } from "./manual.js";
import { datasEntre } from "./datas.js";

/* ---------------- Básicos ---------------- */

/** Manual de escrita da Hyper em uso (Ajustes → Manual da Hyper) ou o padrão. */
export const manualAtual = () => (dados.config.find((c) => c.id === "manual")?.texto || "").trim() || MANUAL_PADRAO;

/** Pilares de conteúdo da marca (um por linha no campo). */
export const pilaresDe = (c) => String(c?.pilares || "").split("\n").map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const dataLonga = (iso) => { if (!iso) return ""; const d = new Date(`${iso}T12:00:00`); return `${DIAS[d.getDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const somar = (data, n) => { const d = new Date(`${data}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const corta = (t, n) => { const s = String(t || "").trim(); return s.length > n ? `${s.slice(0, n).trim()}…` : s; };

/* ---------------- Datas comemorativas (datas.js) ---------------- */

/** Feriados, datas comerciais e as datas da marca de `data` até `dias` depois, mais as do mês todo. */
export function datasPerto(data, dias = 3, clienteId = "", marcaId = "") {
  if (!data) return [];
  const doMes = datasEntre(`${data.slice(0, 7)}-01`, `${data.slice(0, 7)}-28`, { clienteId, marcaId: marcaId || "" }).filter((d) => d.tipo === "mes");
  const perto = datasEntre(data, somar(data, dias), { clienteId, marcaId: marcaId || "" }).filter((d) => d.tipo !== "mes");
  return [...perto, ...doMes.map((d) => ({ ...d, data: "" }))];
}

/* ---------------- Exemplos e completude ---------------- */

/**
 * Exemplos para a IA aprender o estilo da marca: os posts marcados com "★ Usar como exemplo" pela equipe; enquanto
 * não houver nenhum, as copies aprovadas mais recentes. Mesmo formato primeiro.
 */
export function exemplosDaMarca(clienteId, marcaId = "", { formato = "", excluir = "", max = 3 } = {}) {
  const daMarca = dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && t.clienteId === clienteId && (t.marcaId || "") === (marcaId || "")
    && t.id !== excluir && (t.copy || "").trim().length > 40);
  const marcados = daMarca.filter((t) => t.exemplo);
  const lista = marcados.length ? marcados : daMarca.filter((t) => ["aprovado", "agendado", "publicado"].includes(t.statusConteudo));
  return lista.sort((a, b) => ((b.formato === formato) - (a.formato === formato)) || (b.dataPublicacao || "").localeCompare(a.dataPublicacao || "")).slice(0, max);
}

/**
 * Diretrizes da marca para um formato: as linhas que começam com [Formato] (ex.: "[Vídeo] capa sem subtítulo")
 * só valem para esse formato; as outras valem sempre.
 */
export function diretrizesPara(texto = "", formato = "") {
  const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return String(texto).split("\n").filter((l) => {
    const m = l.match(/^\s*[-•*]?\s*\[([^\]]+)\]/);
    return !m || m[1].split(/[,/]/).some((f) => norm(f) === norm(formato));
  }).map((l) => l.replace(/^(\s*[-•*]?\s*)\[[^\]]+\]\s*/, "$1")).join("\n").trim();
}

const ITENS_COMPLETUDE = [
  ["descricao", "O que é a marca", 15], ["publico", "Público-alvo", 15], ["persona", "Persona", 10], ["tomDeVoz", "Tom de voz", 15],
  ["pilares", "Pilares de conteúdo", 10], ["diretrizes", "Diretrizes de conteúdo", 10], ["evitar", "O que evitar", 10]
];
/** Quanto a identidade está completa (0–100) e o que falta; exemplos aprovados contam 15 pontos. */
export function completudeMarca(clienteId, marcaId = "") {
  const id = identidade(clienteId, marcaId || undefined);
  const tem = (k) => Array.isArray(id[k]) ? id[k].filter(Boolean).length > 0 : String(id[k] || "").trim().length > 2;
  let pct = 0;
  const faltando = [];
  for (const [k, rotulo, peso] of ITENS_COMPLETUDE) tem(k) ? (pct += peso) : faltando.push(rotulo);
  const exemplos = exemplosDaMarca(clienteId, marcaId, { max: 2 }).length;
  pct += exemplos >= 2 ? 15 : exemplos * 7;
  if (exemplos < 2) faltando.push("Posts aprovados com copy (exemplos)");
  return { pct: Math.min(100, pct), faltando };
}

/* ---------------- Camadas ---------------- */

const PAPEIS = {
  copy: "Você é copywriter sênior da Hyper Estratégia Digital, agência de marketing digital, e escreve como a marca abaixo.",
  roteiro: "Você é roteirista de vídeos curtos (Reels, TikTok, Shorts) da Hyper Estratégia Digital e escreve como a marca abaixo.",
  carrossel: "Você é redator e editor de carrosséis da Hyper Estratégia Digital e escreve como a marca abaixo.",
  stories: "Você é estrategista de stories da Hyper Estratégia Digital e escreve como a marca abaixo.",
  videoGravado: "Você é copywriter sênior da Hyper Estratégia Digital e escreve como a marca abaixo.",
  anuncio: "Você é copywriter de tráfego pago da Hyper Estratégia Digital e escreve anúncios para a marca abaixo.",
  artigo: "Você é redator e editor da Hyper Estratégia Digital, com formação jornalística, e escreve como a marca abaixo.",
  email: "Você é redator de e-mail marketing da Hyper Estratégia Digital e escreve como a marca abaixo.",
  whatsapp: "Você é copywriter da Hyper Estratégia Digital e escreve mensagens de WhatsApp como uma pessoa da marca abaixo.",
  texto: "Você é redator sênior da Hyper Estratégia Digital e escreve como a marca abaixo."
};

/** Qual pedido usar para o post (pelo formato) ou para uma tarefa que não é post. */
export function tipoDoPedido(post = {}) {
  if (post.tipo && post.tipo !== TIPO_CONTEUDO) return "texto";
  if (post.formato === "Vídeo") return post.videoGravado ? "videoGravado" : "roteiro";
  return ({ "Carrossel": "carrossel", "Story": "stories", "Anúncio": "anuncio", "Artigo": "artigo", "Blog": "artigo",
    "E-mail marketing": "email", "WhatsApp": "whatsapp" })[post.formato] || "copy";
}

function camadaMarca(clienteId, marcaId, formato = "") {
  const c = identidade(clienteId, marcaId || undefined);
  const pilares = pilaresDe(c);
  const conta = (marcaId && porId("marcas", marcaId)) || porId("clientes", clienteId) || {};
  return [
    "## A marca",
    `- Nome: ${c.nome || "(sem nome)"}${marcaId && c.clienteNome && c.clienteNome !== c.nome ? ` (do grupo ${c.clienteNome})` : ""}`,
    c.segmento ? `- Segmento: ${c.segmento}` : null,
    c.cidade ? `- Cidade: ${c.cidade}` : null,
    c.descricao ? `- O que é: ${c.descricao}` : null,
    c.publico ? `- Público-alvo: ${c.publico}` : null,
    c.persona ? `- Persona: ${c.persona}` : null,
    c.tomDeVoz ? `- Tom de voz: ${c.tomDeVoz}` : null,
    pilares.length ? `- Pilares de conteúdo: ${pilares.join("; ")}` : null,
    c.palavrasChave ? `- Palavras e expressões da marca (use): ${c.palavrasChave}` : null,
    c.evitar ? `- O que evitar (nunca use): ${c.evitar}` : null,
    conta.instagram ? `- Instagram: ${conta.instagram}` : null,
    conta.site ? `- Site: ${conta.site}` : null,
    diretrizesPara(c.diretrizes, formato) ? `\n### Diretrizes de conteúdo da marca (valem mais que o manual)\n${diretrizesPara(c.diretrizes, formato)}` : null,
    camadaMarcasDoGrupo(clienteId, marcaId, c)
  ].filter((l) => l !== null).join("\n");
}

const CAMPOS_GRUPO = [["descricao", "O que é"], ["tomDeVoz", "Tom de voz"], ["publico", "Público-alvo"], ["persona", "Persona"]];
/**
 * Post institucional de um grupo (sem marca): o que o grupo tem preenchido o representa como um todo;
 * o que estiver vazio vem da combinação das marcas dele.
 */
function camadaMarcasDoGrupo(clienteId, marcaId, c) {
  if (marcaId) return null;
  const marcas = marcasDo(clienteId).filter((m) => m.ativo !== false);
  const vazios = CAMPOS_GRUPO.filter(([k]) => !String(c[k] || "").trim());
  if (!marcas.length || !vazios.length) return null;
  return [`\n### Marcas do grupo (o grupo ainda não tem ${vazios.map(([, r]) => r.toLowerCase()).join(", ")} próprios: use a combinação das marcas abaixo, falando pelo grupo como um todo)`,
    ...marcas.map((m) => [`- ${m.nome}`, ...vazios.filter(([k]) => String(m[k] || "").trim()).map(([k, r]) => `  - ${r}: ${corta(m[k], 300)}`)].join("\n"))].join("\n");
}

function camadaExemplos(clienteId, marcaId, formato, excluir) {
  const ex = exemplosDaMarca(clienteId, marcaId, { formato, excluir });
  if (!ex.length) return "";
  return ["## Exemplos de textos aprovados desta marca (copie o estilo, não o conteúdo)",
    ...ex.map((t, i) => `### Exemplo ${i + 1}: ${t.formato || "Post"} · ${t.titulo}\n${corta(t.copy, 900)}`)].join("\n\n");
}

const REGRAS_FORMATO = {
  "Estático": "Post de imagem única. A arte costuma ter um título curto e, se precisar, um subtítulo; a legenda complementa a arte sem repeti-la mecanicamente.",
  "Carrossel": "Carrossel (em geral de 5 a 10 lâminas). A capa apresenta uma ideia relevante; cada lâmina tem uma função na narrativa, com pouco texto e boa hierarquia; a última pode trazer conclusão, síntese, oferta ou chamada para ação (não precisa ser uma lâmina só de CTA).",
  "Vídeo": "Vídeo vertical. Escreva para ser falado: o início estabelece interesse ou contexto, o desenvolvimento tem progressão compreensível e o encerramento cumpre a proposta. Indique cena, texto na tela e duração quando ajudar a produção; o ritmo depende do conceito e da marca.",
  "Story": "Sequência curta de telas verticais, com pouco texto por tela. Use recursos interativos (enquete, caixa de pergunta, quiz, contagem) só quando ajudarem o objetivo.",
  "Artigo": "Artigo com título forte, introdução que entrega a promessa, intertítulos, parágrafos curtos e conclusão com chamada para ação.",
  "Blog": "Post de blog com título otimizado para busca, introdução direta, intertítulos com as palavras-chave, parágrafos curtos e chamada para ação.",
  "E-mail marketing": "E-mail com assunto (até 50 caracteres), pré-cabeçalho, abertura pessoal, um único assunto e um botão de chamada para ação.",
  "WhatsApp": "Mensagem de WhatsApp curta, pessoal, com no máximo 3 parágrafos curtos e uma pergunta ou ação no final.",
  "Anúncio": "Anúncio pago (Meta Ads, salvo indicação). Oferta, benefício, objeção e ação desejada claramente identificáveis. Texto principal: as primeiras ~125 caracteres aparecem antes do \"ver mais\". Título até 40 caracteres. Respeite as políticas de anúncios (sem promessas de resultado, sem urgência falsa, sem atributos pessoais do tipo \"você que está acima do peso\")."
};
const REGRAS_REDE = {
  "Instagram": "Instagram: a legenda aparece cortada depois de ~125 caracteres, então a abertura importa; limite de 2.200 caracteres. Hashtags conforme as diretrizes da marca (não há quantidade fixa).",
  "Facebook": "Facebook: textos podem ser um pouco mais longos e conversados; link clicável é permitido.",
  "TikTok": "TikTok: linguagem mais solta, legenda curta com palavras que as pessoas buscam.",
  "YouTube": "YouTube: título com a palavra-chave no começo e descrição com resumo e chamada para ação.",
  "LinkedIn": "LinkedIn: relevância, contexto e autoridade, sem tom burocrático nem fórmulas motivacionais; o texto aparece cortado depois de ~200 caracteres.",
  "WhatsApp": "WhatsApp: curto e pessoal, como uma pessoa da marca escrevendo.",
  "E-mail": "E-mail: assunto curto e específico, um assunto só.",
  "Site": "Site: texto escaneável, com intertítulos e palavras-chave."
};

/** Campanha do post (Natal, Black Friday, lançamento…): o contexto comum a todas as peças dela. */
function camadaCampanha(ctx) {
  const c = ctx.post?.campanhaId && porId("campanhas", ctx.post.campanhaId);
  if (!c) return null;
  const pecas = dados.tarefas.filter((t) => t.campanhaId === c.id && t.id !== ctx.post.id).slice(0, 15);
  return [
    "## A campanha deste conteúdo",
    `- Campanha: ${c.nome}${c.inicio || c.fim ? ` (${[c.inicio, c.fim].filter(Boolean).map((d) => `${d.slice(8)}/${d.slice(5, 7)}`).join(" a ")})` : ""}`,
    c.objetivo ? `- Objetivo da campanha: ${c.objetivo}` : null,
    c.mensagem ? `- Mensagem central: ${c.mensagem}` : null,
    c.condicoes ? `- Condições comerciais (use exatamente estas, não invente outras): ${c.condicoes}` : null,
    c.briefing ? `- Briefing da campanha:\n${c.briefing}` : null,
    pecas.length ? `- Outras peças da campanha (cada uma tem uma função; não repita): ${pecas.map((t) => `${t.titulo} (${t.formato || t.tipo})`).join("; ")}` : null
  ].filter((l) => l !== null).join("\n");
}


function camadaConteudo(ctx) {
  const p = ctx.post || {};
  const datas = datasPerto(p.dataPublicacao, 3, ctx.clienteId, ctx.marcaId);
  const vizinhos = p.dataPublicacao ? dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && t.id !== p.id && t.clienteId === ctx.clienteId
    && (t.marcaId || "") === (ctx.marcaId || "") && t.dataPublicacao >= somar(p.dataPublicacao, -6) && t.dataPublicacao <= somar(p.dataPublicacao, 6)) : [];
  return [
    "## O conteúdo",
    p.titulo ? `- Tema: ${p.titulo}` : null,
    p.formato ? `- Formato: ${p.formato}` : null,
    p.rede ? `- Rede: ${p.rede}` : null,
    p.dataPublicacao ? `- Publicação: ${dataLonga(p.dataPublicacao)}${p.hora ? ` às ${p.hora}` : ""}` : null,
    datas.length ? `- Datas comemorativas perto: ${datas.map((d) => d.data ? `${d.nome} (${d.data.slice(8)}/${d.data.slice(5, 7)})` : `${d.nome} (o mês todo)`).join(", ")}. Use só se tiver relação real com a marca e o tema (veja o manual).` : null,
    p.pilar ? `- Pilar: ${p.pilar}` : null,
    p.objetivo ? `- Objetivo: ${rotuloObjetivo(p.objetivo)}${rotuloObjetivo(p.objetivo) !== p.objetivo ? " (etapa do funil; veja o manual, seção 12)" : ""}` : null,
    p.roteiro ? `- Briefing:\n${p.roteiro}` : "- Briefing: não informado. Use o tema e a marca, e marque com [CONFIRMAR] o que precisar de informação.",
    p.videoGravado && p.transcricao ? `- Transcrição do vídeo já gravado (use só o que foi dito; não invente falas nem argumentos):\n${corta(p.transcricao, 5000)}` : null,
    vizinhos.length ? `- Outros posts perto desta data (dê continuidade sem repetir argumentos, frases ou estruturas): ${vizinhos.map((t) => t.titulo).join("; ")}` : null
  ].filter((l) => l !== null).join("\n");
}

function camadaRegras(post = {}) {
  return ["## Regras do formato e da rede",
    REGRAS_FORMATO[post.formato] || (post.formato ? `Formato: ${post.formato}.` : null),
    REGRAS_REDE[post.rede] || null].filter(Boolean).join("\n");
}

/** Marcadores de cada tipo de pedido: a pessoa cola a resposta e o app distribui pelos campos. */
const SAIDAS = {
  copy: ["[ABERTURAS]\n3 opções de abertura, uma por linha, com abordagens diferentes.", "[LEGENDA]\nA legenda completa, pronta para publicar, com a melhor abertura.", "[TEXTO DA ARTE]\nTítulo curto e, se precisar, subtítulo para a arte."],
  roteiro: ["[ROTEIRO]\nCena por cena: tempo (ex.: 0–3s), o que aparece, a fala e o texto na tela.", "[CAPA]\nTexto curto da capa do vídeo.", "[LEGENDA]\nA legenda do vídeo, pronta para publicar."],
  carrossel: ["[LÂMINAS]\nLâmina 1 (capa): …\nLâmina 2: …\n(uma linha por lâmina)", "[LEGENDA]\nA legenda do carrossel, pronta para publicar."],
  stories: ["[SEQUÊNCIA]\nTela 1: texto + o que aparece + interação (se houver)\nTela 2: …", "[LEGENDA]\nSe for repostar no feed, a legenda; senão escreva \"—\"."],
  videoGravado: ["[LEGENDA]\nA legenda do vídeo, pronta para publicar, a partir da transcrição.", "[CAPA]\nTexto curto da capa do vídeo, com palavras que estão na fala."],
  anuncio: ["[TEXTO PRINCIPAL]\n3 variações completas, testando abordagens diferentes (dor, desejo, benefício, conceito), separadas por uma linha com ---.", "[TÍTULO]\n3 opções de título (até 40 caracteres), uma por linha.", "[DESCRIÇÃO]\nUma linha de descrição (até 30 caracteres), ou \"—\".", "[TEXTO DA ARTE]\nTítulo curto para o criativo."],
  artigo: ["[TÍTULO]\n3 opções de título, uma por linha.", "[TEXTO]\nO texto completo, com intertítulos (## Intertítulo).", "[RESUMO]\n2 ou 3 linhas para divulgar o texto nas redes ou no e-mail."],
  email: ["[ASSUNTO]\n3 opções de assunto (até 50 caracteres), uma por linha.", "[PRÉ-CABEÇALHO]\nO texto que aparece ao lado do assunto (até 90 caracteres).", "[TEXTO]\nO corpo do e-mail completo.", "[BOTÃO]\nO texto do botão de chamada para ação."],
  whatsapp: ["[MENSAGEM]\nA mensagem pronta para enviar."],
  texto: ["[TEXTO]\nO texto pronto para usar.", "[OBSERVAÇÕES]\nO que precisa ser confirmado ou decidido antes de usar, ou \"—\"."]
};

const TAREFAS = {
  copy: "Escreva a legenda deste post.",
  roteiro: "Escreva o roteiro deste vídeo e a legenda.",
  carrossel: "Escreva o texto de cada lâmina deste carrossel e a legenda.",
  stories: "Escreva a sequência de stories.",
  videoGravado: "Escreva a legenda deste vídeo, que já foi gravado, a partir da transcrição.",
  anuncio: "Escreva o texto deste anúncio, com variações para teste.",
  artigo: "Escreva este texto (artigo ou post de blog).",
  email: "Escreva este e-mail marketing.",
  whatsapp: "Escreva esta mensagem de WhatsApp.",
  texto: "Escreva o texto pedido nesta tarefa (pode ser apresentação, e-book, página, mensagem ou outro material)."
};

// O checklist completo está no manual (seção 26); aqui só o que é deste pedido
const CHECKLIST = ["Passe pelo checklist do manual (seção \"Checklist antes da entrega\").",
  "Respeita o que a marca pede para evitar e as condições da campanha, sem inventar outras?",
  "O que falta está marcado com [CONFIRMAR: …]?", "Cabe nos limites do formato e da rede?"];

/**
 * Monta o pedido completo para a IA.
 * tipo (`tipoDoPedido`): copy | roteiro | carrossel | stories | videoGravado | anuncio | artigo | email | whatsapp | texto
 * ctx: { clienteId, marcaId, post: { id, titulo, formato, rede, dataPublicacao, hora, pilar, objetivo, roteiro, copy, textoArte,
 *        videoGravado, transcricao, campanhaId } }
 */
export function montarPedido(tipo, ctx = {}) {
  const post = ctx.post || {};
  const tarefa = TAREFAS[tipo] || TAREFAS.copy;
  const { faltando } = completudeMarca(ctx.clienteId, ctx.marcaId);
  return [
    PAPEIS[tipo] || PAPEIS.copy,
    `Tarefa: ${tarefa}`,
    "",
    "## Manual de escrita da Hyper (siga sempre)",
    manualAtual(),
    "",
    camadaMarca(ctx.clienteId, ctx.marcaId, post.formato),
    "",
    tipo === "texto" ? null : camadaExemplos(ctx.clienteId, ctx.marcaId, post.formato, post.id),
    camadaCampanha(ctx) ? `\n${camadaCampanha(ctx)}` : null,
    tipo === "texto" ? `\n## O que escrever\n- Tarefa: ${post.titulo || "(sem título)"}\n${post.notas ? `- Briefing:\n${post.notas}` : "- Briefing: não informado. Marque com [CONFIRMAR] o que precisar de informação."}` : `\n${camadaConteudo(ctx)}`,
    (post.copy || post.textoArte) && tipo !== "copy" && tipo !== "texto" ? `- Texto que já existe (aproveite o que estiver bom):\n${corta([post.copy, post.textoArte].filter(Boolean).join("\n\n"), 1500)}` : null,
    tipo === "texto" ? null : `\n${camadaRegras(post)}`,
    faltando.length ? `\nAtenção: a ficha da marca ainda não tem ${faltando.join(", ")}. Use bom senso e não invente fatos.` : null,
    "",
    "## Como responder",
    "Responda em português do Brasil, só com os blocos abaixo, cada um começando pelo marcador entre colchetes numa linha sozinha. Sem introdução nem explicação.",
    ...(SAIDAS[tipo] || SAIDAS.copy),
    "",
    "## Antes de responder, confira",
    ...CHECKLIST.map((l) => `- ${l}`)
  ].filter((l) => l !== null && l !== undefined).join("\n");
}

/* ---------------- Resposta colada de volta ---------------- */

const normalizarMarcador = (m) => m.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
/**
 * Lê a resposta da IA: blocos que começam com [MARCADOR] (aceita **[MARCADOR]** e ## [MARCADOR]).
 * Retorna { LEGENDA, "TEXTO DA ARTE", ROTEIRO, LAMINAS, … }; sem marcadores, o texto todo vira LEGENDA.
 */
export function lerResposta(texto = "") {
  const partes = {};
  let atual = null;
  for (const linha of String(texto).replace(/\r/g, "").split("\n")) {
    const m = linha.match(/^\s*(?:#+\s*)?\**\s*\[([^\]]{2,40})\]\s*\**\s*:?\s*(.*)$/);
    if (m) { atual = normalizarMarcador(m[1]); partes[atual] = m[2] ? [m[2]] : []; continue; }
    if (atual) partes[atual].push(linha);
  }
  const limpo = Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, v.join("\n").trim().replace(/^```\w*\n?|```$/g, "").trim()]).filter(([, v]) => v && v !== "—" && v !== "-"));
  if (!Object.keys(limpo).length && String(texto).trim()) limpo.LEGENDA = String(texto).trim();
  return limpo;
}

/** O que vai para cada campo do post a partir da resposta lida. */
export function camposDaResposta(r) {
  const bloco = (k, rotulo) => (r[k] ? `${rotulo}\n${r[k]}` : "");
  const arte = [
    bloco("ROTEIRO", "ROTEIRO"), bloco("CAPA", "CAPA"), bloco("LAMINAS", "LÂMINAS"), bloco("SEQUENCIA", "SEQUÊNCIA"),
    bloco("ASSUNTO", "ASSUNTO"), bloco("PRE-CABECALHO", "PRÉ-CABEÇALHO"), bloco("BOTAO", "BOTÃO"),
    bloco("TITULO", "TÍTULO"), bloco("DESCRICAO", "DESCRIÇÃO"), bloco("RESUMO", "RESUMO"), bloco("TEXTO DA ARTE", "TEXTO DA ARTE"),
    bloco("OBSERVACOES", "OBSERVAÇÕES")
  ].filter(Boolean).join("\n\n");
  return { copy: r.LEGENDA || r["TEXTO PRINCIPAL"] || r.TEXTO || r.MENSAGEM || "", textoArte: arte };
}

/* ---------------- Abrir a IA da pessoa ---------------- */

export const IAS = { claude: ["Claude", "https://claude.ai/new"], chatgpt: ["ChatGPT", "https://chatgpt.com/"] };
export const iaPreferida = () => { try { return localStorage.getItem("hyper-ia") || "claude"; } catch { return "claude"; } };
export const guardarIaPreferida = (ia) => { try { localStorage.setItem("hyper-ia", ia); } catch {} };
/** Copia o pedido e abre a IA escolhida numa conversa nova. Retorna true se copiou. */
export async function levarParaIA(texto, ia = iaPreferida()) {
  let copiou = true;
  try { await navigator.clipboard.writeText(texto); } catch { copiou = false; }
  window.open((IAS[ia] || IAS.claude)[1], "_blank", "noopener");
  return copiou;
}

/** Ajustes pedidos pelos clientes nos posts desta marca (viram sugestões para "o que evitar"). */
export function ajustesPedidos(clienteId, marcaId = "", dias = 90) {
  const limite = Date.now() - dias * 86400000;
  return dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && t.clienteId === clienteId && (t.marcaId || "") === (marcaId || ""))
    .flatMap((t) => [
      t.aprovacaoCliente?.decisao === "ajuste" && (t.aprovacaoCliente.em || 0) >= limite ? { post: t, texto: t.aprovacaoCliente.comentario, em: t.aprovacaoCliente.em } : null,
      t.ajusteCliente ? { post: t, texto: t.ajusteCliente, em: t.atualizadoEm || 0 } : null
    ]).filter((x) => x && x.texto && x.em >= limite).sort((a, b) => b.em - a.em);
}

