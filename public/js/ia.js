// Motor do pedido de copy para a IA de cada pessoa (Claude ou ChatGPT, no navegador dela). É o único uso de IA
// na plataforma: o app não chama a IA, monta um pedido completo, em camadas, que a pessoa cola na IA dela, e depois
// lê a resposta colada de volta (marcadores como [LEGENDA]). Camadas, sempre nesta ordem:
//   papel → manual da Hyper → marca → exemplos aprovados → o conteúdo → regras do formato/rede → como responder → checklist.
import { dados, porId, identidade, marcasDo } from "./db.js";
import { TIPO_CONTEUDO, FORMATO_VIDEO } from "./constantes.js";
import { MANUAL_PADRAO } from "./manual.js";

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

/* ---------------- Datas comemorativas ---------------- */

function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(ano, mes - 1, dia));
}
const nDomingo = (ano, mes, n) => { const d = new Date(ano, mes - 1, 1); const primeiro = 1 + ((7 - d.getDay()) % 7); return iso(new Date(ano, mes - 1, primeiro + 7 * (n - 1))); };
/** Datas comemorativas comuns no marketing brasileiro. */
export function datasComemorativas(ano) {
  const fixas = { "01-01": "Ano Novo", "03-08": "Dia Internacional da Mulher", "03-15": "Dia do Consumidor", "04-07": "Dia Mundial da Saúde",
    "05-01": "Dia do Trabalhador", "06-12": "Dia dos Namorados", "06-24": "São João", "09-07": "Independência do Brasil", "09-15": "Dia do Cliente",
    "10-12": "Dia das Crianças", "10-15": "Dia do Professor", "11-20": "Dia da Consciência Negra", "12-25": "Natal", "12-31": "Réveillon" };
  const r = Object.fromEntries(Object.entries(fixas).map(([md, nome]) => [`${ano}-${md}`, nome]));
  const p = pascoa(ano);
  r[p] = "Páscoa"; r[somar(p, -47)] = "Carnaval";
  r[nDomingo(ano, 5, 2)] = "Dia das Mães"; r[nDomingo(ano, 8, 2)] = "Dia dos Pais";
  const nov = new Date(ano, 10, 1); const quinta = 1 + ((4 - nov.getDay() + 7) % 7) + 21;
  r[iso(new Date(ano, 10, quinta + 1))] = "Black Friday";
  return r;
}
/** Datas comemorativas de `data` até `dias` depois. */
export function datasPerto(data, dias = 3) {
  if (!data) return [];
  const ano = Number(data.slice(0, 4));
  const todas = { ...datasComemorativas(ano), ...datasComemorativas(ano + 1) };
  return Object.entries(todas).filter(([d]) => d >= data && d <= somar(data, dias)).sort().map(([d, nome]) => ({ data: d, nome }));
}

/* ---------------- Exemplos e completude ---------------- */

/** Copies aprovadas da mesma marca (mesmo formato primeiro): a IA aprende o estilo com elas. */
export function exemplosDaMarca(clienteId, marcaId = "", { formato = "", excluir = "", max = 3 } = {}) {
  const aprovadas = dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && t.clienteId === clienteId && (t.marcaId || "") === (marcaId || "")
    && t.id !== excluir && (t.copy || "").trim().length > 40 && ["aprovado", "agendado", "publicado"].includes(t.statusConteudo))
    .sort((a, b) => ((b.formato === formato) - (a.formato === formato)) || (b.dataPublicacao || "").localeCompare(a.dataPublicacao || ""));
  return aprovadas.slice(0, max);
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
  stories: "Você é estrategista de stories da Hyper Estratégia Digital e escreve como a marca abaixo."
};

function camadaMarca(clienteId, marcaId) {
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
    c.diretrizes ? `\n### Diretrizes de conteúdo da marca (valem mais que o manual)\n${c.diretrizes}` : null,
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
  "WhatsApp": "Mensagem de WhatsApp curta, pessoal, com no máximo 3 parágrafos curtos e uma pergunta ou ação no final."
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

function camadaConteudo(ctx) {
  const p = ctx.post || {};
  const datas = datasPerto(p.dataPublicacao, 3);
  const vizinhos = p.dataPublicacao ? dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && t.id !== p.id && t.clienteId === ctx.clienteId
    && (t.marcaId || "") === (ctx.marcaId || "") && t.dataPublicacao >= somar(p.dataPublicacao, -6) && t.dataPublicacao <= somar(p.dataPublicacao, 6)) : [];
  return [
    "## O conteúdo",
    p.titulo ? `- Tema: ${p.titulo}` : null,
    p.formato ? `- Formato: ${p.formato}` : null,
    p.rede ? `- Rede: ${p.rede}` : null,
    p.dataPublicacao ? `- Publicação: ${dataLonga(p.dataPublicacao)}${p.hora ? ` às ${p.hora}` : ""}` : null,
    datas.length ? `- Datas comemorativas perto: ${datas.map((d) => `${d.nome} (${d.data.slice(8)}/${d.data.slice(5, 7)})`).join(", ")}. Use só se tiver relação real com a marca e o tema (veja o manual).` : null,
    p.pilar ? `- Pilar: ${p.pilar}` : null,
    p.objetivo ? `- Objetivo: ${p.objetivo}` : null,
    p.roteiro ? `- Briefing:\n${p.roteiro}` : "- Briefing: não informado. Use o tema e a marca, e marque com [CONFIRMAR] o que precisar de informação.",
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
  stories: ["[SEQUÊNCIA]\nTela 1: texto + o que aparece + interação (se houver)\nTela 2: …", "[LEGENDA]\nSe for repostar no feed, a legenda; senão escreva \"—\"."]
};

const TAREFAS = {
  copy: "Escreva a legenda deste post.",
  roteiro: "Escreva o roteiro deste vídeo e a legenda.",
  carrossel: "Escreva o texto de cada lâmina deste carrossel e a legenda.",
  stories: "Escreva a sequência de stories."
};

const CHECKLIST = {
  base: ["Passe pelo checklist do manual (seção \"Checklist antes da entrega\").", "A abertura é adequada à proposta e o desenvolvimento entrega o que ela promete?",
    "Está no tom de voz da marca e respeita o que ela pede para evitar?", "Se houver chamada para ação, ela é coerente com o objetivo?",
    "Nenhum dado, preço ou data foi inventado? O que falta está marcado com [CONFIRMAR: …]?", "Soa como gente (sem as construções típicas de IA listadas no manual)?", "Cabe no formato e na rede?"]
};

/**
 * Monta o pedido completo para a IA.
 * tipo (pelo formato do post): copy | roteiro | carrossel | stories
 * ctx: { clienteId, marcaId, post: { id, titulo, formato, rede, dataPublicacao, hora, pilar, objetivo, roteiro, copy, textoArte } }
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
    camadaMarca(ctx.clienteId, ctx.marcaId),
    "",
    camadaExemplos(ctx.clienteId, ctx.marcaId, post.formato, post.id),
    `\n${camadaConteudo(ctx)}`,
    (post.copy || post.textoArte) && tipo !== "copy" ? `- Texto que já existe (aproveite o que estiver bom):\n${corta([post.copy, post.textoArte].filter(Boolean).join("\n\n"), 1500)}` : null,
    `\n${camadaRegras(post)}`,
    faltando.length ? `\nAtenção: a ficha da marca ainda não tem ${faltando.join(", ")}. Use bom senso e não invente fatos.` : null,
    "",
    "## Como responder",
    "Responda em português do Brasil, só com os blocos abaixo, cada um começando pelo marcador entre colchetes numa linha sozinha. Sem introdução nem explicação.",
    ...(SAIDAS[tipo] || SAIDAS.copy),
    "",
    "## Antes de responder, confira",
    ...CHECKLIST.base.map((l) => `- ${l}`)
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
  const arte = [
    r.ROTEIRO ? `ROTEIRO\n${r.ROTEIRO}` : "", r.CAPA ? `CAPA\n${r.CAPA}` : "", r.LAMINAS ? `LÂMINAS\n${r.LAMINAS}` : "",
    r.SEQUENCIA ? `SEQUÊNCIA\n${r.SEQUENCIA}` : "", r["TEXTO DA ARTE"] ? `TEXTO DA ARTE\n${r["TEXTO DA ARTE"]}` : ""
  ].filter(Boolean).join("\n\n");
  return { copy: r.LEGENDA || "", textoArte: arte };
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

export const ehVideo = (formato) => formato === FORMATO_VIDEO;
