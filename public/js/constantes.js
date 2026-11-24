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
/** Formatos antigos → novos (aplicado uma vez nos posts e nos modelos de checklist). */
export const FORMATO_ANTIGO = {
  "Feed estático": "Estático", "Anúncio estático": "Estático", "Reels": "Vídeo", "TikTok": "Vídeo", "Vídeo (YouTube)": "Vídeo",
  "Anúncio em vídeo": "Vídeo", "Sequência de stories": "Story", "Stories": "Story"
};
export const formatoAtual = (f) => FORMATO_ANTIGO[f] || f || "";
// Proporção da arte por formato (largura x altura) usada no menu Criar
export const PROPORCAO_FORMATO = {
  "Estático": [1080, 1350], "Carrossel": [1080, 1350], "Vídeo": [1080, 1920], "Story": [1080, 1920],
  "Blog": [1600, 900], "Artigo": [1600, 900], "E-mail marketing": [1200, 628], "WhatsApp": [1080, 1080], "Outro": [1080, 1080]
};
export const REDES = ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "WhatsApp", "E-mail", "Site"];

export const STATUS_CONTEUDO = [
  ["ideia", "Ideia"],
  ["producao", "Em produção"],
  ["aprovacao", "Em aprovação"],
  ["aprovado", "Aprovado"],
  ["agendado", "Agendado"],
  ["publicado", "Publicado"]
];
export const rotuloStatusConteudo = (s) => STATUS_CONTEUDO.find(([v]) => v === s)?.[1] || s;

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
