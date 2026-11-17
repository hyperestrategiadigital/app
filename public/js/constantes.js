// Listas fixas usadas no app inteiro.

export const STATUS_TAREFA = [
  ["a_fazer", "A fazer"],
  ["andamento", "Em andamento"],
  ["concluido", "Concluído"]
];
export const rotuloStatus = (s) => STATUS_TAREFA.find(([v]) => v === s)?.[1] || s;

export const TIPOS_TAREFA = [
  "Conteúdo", "Vídeo", "Roteiro", "Tráfego pago", "Planejamento",
  "Aprovação", "Reunião", "Comercial", "Financeiro", "Site / LP", "Organização", "Outro"
];

export const SERVICOS = ["Social media", "Meta Ads", "Google Ads", "Vídeo", "Site / LP", "Consultoria"];

export const FORMATOS = ["Estático", "Carrossel", "Reels", "Story", "Vídeo", "WhatsApp", "Anúncio", "Blog", "Outro"];
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
