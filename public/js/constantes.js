// Listas fixas usadas no app inteiro.

export const STATUS_TAREFA = [
  ["a_fazer", "A fazer"],
  ["andamento", "Em andamento"],
  ["concluido", "Concluído"]
];
export const rotuloStatus = (s) => STATUS_TAREFA.find(([v]) => v === s)?.[1] || s;

// "Conteúdo" é o único tipo que vira post no calendário
export const TIPO_CONTEUDO = "Conteúdo";
export const TIPOS_TAREFA = [
  "Conteúdo", "Roteiro", "Vídeo", "Institucional", "Tráfego pago", "Planejamento",
  "Aprovação", "Reunião", "Comercial", "Financeiro", "Site / LP", "Organização", "Outro"
];
export const ehConteudo = (t) => t?.tipo === TIPO_CONTEUDO;

export const SERVICOS = ["Social media", "Meta Ads", "Google Ads", "Vídeo", "Site / LP", "Consultoria"];

export const FORMATOS = [
  "Feed estático", "Carrossel", "Reels", "Story", "Sequência de stories", "Vídeo (YouTube)",
  "TikTok", "Anúncio estático", "Anúncio em vídeo", "WhatsApp", "Blog", "Outro"
];
// Proporção da arte por formato (largura x altura) usada no menu Criar
export const PROPORCAO_FORMATO = {
  "Feed estático": [1080, 1350], "Carrossel": [1080, 1350], "Anúncio estático": [1080, 1350],
  "Story": [1080, 1920], "Sequência de stories": [1080, 1920], "Reels": [1080, 1920], "TikTok": [1080, 1920], "Anúncio em vídeo": [1080, 1920],
  "Vídeo (YouTube)": [1920, 1080], "Blog": [1600, 900], "WhatsApp": [1080, 1080], "Outro": [1080, 1080]
};
export const REDES = ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "WhatsApp", "Site"];

export const STATUS_CONTEUDO = [
  ["ideia", "Ideia"],
  ["producao", "Em produção"],
  ["aprovacao", "Em aprovação"],
  ["aprovado", "Aprovado"],
  ["agendado", "Agendado"],
  ["publicado", "Publicado"]
];
export const rotuloStatusConteudo = (s) => STATUS_CONTEUDO.find(([v]) => v === s)?.[1] || s;

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
