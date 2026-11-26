// Listas fixas usadas no app inteiro.

export const STATUS_TAREFA = [
  ["a_fazer", "A fazer"],
  ["andamento", "Em andamento"],
  ["concluido", "Concluído"]
];
export const rotuloStatus = (s) => STATUS_TAREFA.find(([v]) => v === s)?.[1] || s;

// "Conteúdo" é o único tipo que vira post no calendário
export const TIPO_CONTEUDO = "Conteúdo";
// 8 tipos + "Reunião", que não vira tarefa: abre como compromisso
export const TIPO_FINANCEIRO = "Financeiro / Comercial";
export const TIPOS_TAREFA = [
  "Conteúdo", "Produção", "Vídeo / Roteiro", "Tráfego pago", TIPO_FINANCEIRO, "Planejamento", "Organização", "Reunião", "Outro"
];
/** Tipos que não podem sair da lista: Conteúdo vira post; Reunião vira compromisso. */
export const TIPOS_FIXOS = [TIPO_CONTEUDO, "Reunião"];
/** Tipos antigos → novos (aplicado uma vez nas tarefas existentes). */
export const TIPO_ANTIGO = {
  "Roteiro": "Vídeo / Roteiro", "Vídeo": "Vídeo / Roteiro", "Financeiro": TIPO_FINANCEIRO, "Comercial": TIPO_FINANCEIRO,
  "Aprovação": "Produção", "Institucional": "Outro", "Site / LP": "Outro"
};
export const ehConteudo = (t) => t?.tipo === TIPO_CONTEUDO;

export const SERVICOS = ["Social media", "Meta Ads", "Google Ads", "Vídeo", "Site / LP", "Consultoria"];

// Formato = o tipo de peça (a rede é outro campo). Vídeo vale para Reels, TikTok, Shorts e YouTube.
export const FORMATOS = ["Estático", "Carrossel", "Vídeo", "Story", "Artigo", "E-mail marketing", "WhatsApp", "Blog", "Outro"];
export const FORMATO_PADRAO = "Estático";
/** Formato que precisa de roteiro uma semana antes da produção (entra no "Produzir semana" da semana anterior). */
export const FORMATO_VIDEO = "Vídeo";
/**
 * Dias entre o prazo de produção e a publicação, por formato (o prazo do post sai daqui).
 * O administrador muda em Ajustes → Menus e listas.
 */
export const ANTECEDENCIA = { "Vídeo": 3, "Carrossel": 2 };
export const antecedenciaDe = (formato) => Number(ANTECEDENCIA[formato] ?? 1);
/** Formatos antigos → novos (aplicado uma vez nos posts e nos modelos de checklist). */
export const FORMATO_ANTIGO = {
  "Feed estático": "Estático", "Anúncio estático": "Estático", "Reels": "Vídeo", "TikTok": "Vídeo", "Vídeo (YouTube)": "Vídeo",
  "Anúncio em vídeo": "Vídeo", "Sequência de stories": "Story", "Stories": "Story"
};
export const formatoAtual = (f) => FORMATO_ANTIGO[f] || f || "";
export const REDES = ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "WhatsApp", "E-mail", "Site"];

/* Listas dos menus (tipos de tarefa, formatos, redes): o administrador muda em Ajustes → Menus e listas
   (config/listas). As listas acima são trocadas no lugar, então quem importa FORMATOS/TIPOS_TAREFA/REDES vê a versão atual. */
export const LISTAS_PADRAO = { tipos: [...TIPOS_TAREFA], formatos: [...FORMATOS], redes: [...REDES], antecedencia: { ...ANTECEDENCIA } };
const trocar = (lista, novos) => { lista.splice(0, lista.length, ...novos); };
const limpa = (l) => [...new Set((Array.isArray(l) ? l : []).map((x) => String(x || "").trim()).filter(Boolean))];
export function aplicarListas(cfg = null) {
  const tipos = limpa(cfg?.tipos);
  trocar(TIPOS_TAREFA, tipos.length ? [...tipos, ...TIPOS_FIXOS.filter((t) => !tipos.includes(t))] : LISTAS_PADRAO.tipos);
  const formatos = limpa(cfg?.formatos);
  trocar(FORMATOS, formatos.length ? formatos : LISTAS_PADRAO.formatos);
  const redes = limpa(cfg?.redes);
  trocar(REDES, redes.length ? redes : LISTAS_PADRAO.redes);
  for (const k of Object.keys(ANTECEDENCIA)) delete ANTECEDENCIA[k];
  Object.assign(ANTECEDENCIA, cfg?.antecedencia && typeof cfg.antecedencia === "object" ? cfg.antecedencia : LISTAS_PADRAO.antecedencia);
}
/** Opções de um menu sem perder o valor que o item já tem (ex.: um formato que saiu da lista). */
export const comAtual = (lista, atual) => (atual && !lista.includes(atual) ? [...lista, atual] : [...lista]);
/** Prazo de produção do post: X dias antes da publicação, conforme o formato (nunca antes de hoje). */
export function prazoDoPost(dataPublicacao, formato, hoje) {
  if (!dataPublicacao) return "";
  const d = new Date(`${dataPublicacao}T12:00:00`);
  d.setDate(d.getDate() - antecedenciaDe(formato));
  const prazo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return hoje && prazo < hoje ? (dataPublicacao < hoje ? dataPublicacao : hoje) : prazo;
}

export const STATUS_CONTEUDO = [
  ["ideia", "Ideia"],
  ["producao", "Em produção"],
  ["aprovacao", "Em aprovação"],
  ["aprovado", "Aprovado"],
  ["agendado", "Agendado"],
  ["publicado", "Publicado"]
];
export const rotuloStatusConteudo = (s) => STATUS_CONTEUDO.find(([v]) => v === s)?.[1] || s;
/** As mesmas etapas com nomes simples, para o cliente (portal). */
export const ETAPAS_CLIENTE = { ideia: "Ideia", producao: "Fazendo", aprovacao: "Para você aprovar", aprovado: "Aprovado", agendado: "Pronto", publicado: "Publicado" };
export const rotuloEtapaCliente = (s) => ETAPAS_CLIENTE[s || "ideia"] || rotuloStatusConteudo(s);

// Post tem um status só: a etapa. O status de tarefa (quadro A fazer/Em andamento/Concluído) sai dela.
/** Etapa do post → status da tarefa. */
export const statusDaEtapa = (etapa = "ideia") => etapa === "publicado" ? "concluido" : etapa === "ideia" || !etapa ? "a_fazer" : "andamento";
/** Status da tarefa (ex.: arrastado no quadro) → etapa do post, mantendo a etapa atual quando ela já combina. */
export function etapaDoStatus(status, atual = "ideia") {
  if (statusDaEtapa(atual) === status) return atual;
  return status === "concluido" ? "publicado" : status === "a_fazer" ? "ideia" : "producao";
}

export const CATEGORIAS_FIN = {
  receita: ["Mensalidade", "Projeto", "Avulso", "Outro"],
  despesa: ["Ferramentas", "Impostos", "Equipe", "Equipamentos", "Anúncios", "Outro"]
};

export const STATUS_ORCAMENTO = [
  ["rascunho", "Rascunho"],
  ["enviado", "Enviado"],
  ["aprovado", "Aprovado"],
  ["recusado", "Recusado"]
];

export const PLATAFORMAS = ["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads"];

export const DIAS_SEMANA = [
  ["1", "Segunda"], ["2", "Terça"], ["3", "Quarta"], ["4", "Quinta"],
  ["5", "Sexta"], ["6", "Sábado"], ["0", "Domingo"]
];

// Modelos de checklist: tarefa ou post novo sem checklist já nasce com estes passos.
// O administrador muda em Ajustes → Modelos de checklist (config/modelos).
export const MODELOS_PADRAO = {
  "Estático": ["Briefing", "Copy", "Arte no Canva", "Aprovação do cliente", "Agendar"],
  "Carrossel": ["Roteiro das lâminas", "Copy", "Arte no Canva", "Aprovação do cliente", "Agendar"],
  "Vídeo": ["Roteiro", "Gravação", "Edição", "Capa", "Legenda", "Aprovação do cliente", "Agendar"],
  "Story": ["Roteiro", "Arte ou gravação", "Publicar"],
  "Artigo": ["Pauta com o autor", "Texto", "Revisão", "Imagem de capa", "Aprovação do cliente", "Publicar"],
  "E-mail marketing": ["Texto", "Layout do e-mail", "Lista de envio", "Aprovação do cliente", "Agendar envio"],
  "Tráfego pago": ["Conferir resultados", "Ajustar orçamentos", "Pausar o que não performa", "Registrar manutenção"],
  "Planejamento": ["Planejar os posts no calendário", "Enviar link de aprovação ao cliente", "Ajustar com o retorno"],
  "Vídeo / Roteiro": ["Roteiro", "Gravação", "Edição", "Revisão"]
};
/**
 * Redes sociais e canais de cada conta (cliente sem marcas ou cada marca de um grupo), na aba Contas.
 * [campo, rótulo, dica, tipo]. tipo "perfil" = @usuário; "link" = endereço completo; "id" = número.
 */
export const CAMPOS_REDES = [
  ["instagram", "Instagram", "@perfil", "perfil"],
  ["facebook", "Facebook", "https://facebook.com/pagina", "link"],
  ["facebookPageId", "ID da página do Facebook", "Para agendar e ver os resultados (dá para escolher na aba Resultados)", "id"],
  ["tiktok", "TikTok", "@perfil", "perfil"],
  ["youtube", "YouTube", "https://youtube.com/@canal", "link"],
  ["linkedin", "LinkedIn", "https://linkedin.com/company/...", "link"],
  ["googleMeuNegocio", "Google Meu Negócio", "Link do Perfil da Empresa no Google (Maps)", "link"],
  ["whatsappNegocio", "WhatsApp Business", "(11) 99999-9999", "telefone"],
  ["pinterest", "Pinterest", "@perfil", "perfil"],
  ["threads", "Threads", "@perfil", "perfil"],
  ["x", "X (Twitter)", "@perfil", "perfil"],
  ["site", "Site", "https://...", "link"]
];
