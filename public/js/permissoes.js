// Quem é o usuário logado no espaço da Hyper e o que ele pode ver.
// A proteção de verdade dos dados sensíveis (financeiro, tráfego, chave da OpenAI) está nas regras
// do Firestore (firestore.rules); aqui só escondemos o que a pessoa não usa.

export const AREAS = [
  ["conteudo", "Conteúdo", "Calendário de posts, planejamento, criar artes, marca dos clientes"],
  ["trafego", "Tráfego pago", "Contas de anúncio, verbas, manutenções e resultados"],
  ["financeiro", "Financeiro", "Mensalidades, cobranças, orçamentos e valores dos clientes"]
];
export const rotuloArea = (a) => AREAS.find(([v]) => v === a)?.[1] || a;
/** Áreas que podem ser dadas à equipe. O Financeiro é só dos administradores. */
export const AREAS_EQUIPE = AREAS.filter(([v]) => v !== "financeiro");

/**
 * Dados do usuário no espaço: { uid, email, nome, papel: "admin" | "basico" | "cliente", permissoes: [], dono: bool }.
 * "cliente": pessoa do cliente (não da equipe). Vê só os posts, a marca e os resultados dos clientes em `clientes`
 * e, se `marcas` tiver itens, só dessas marcas.
 */
export const eu = { uid: "", email: "", nome: "", papel: "basico", permissoes: [], dono: false, status: "" };

export function definirEu(valores) { Object.assign(eu, { papel: "basico", permissoes: [], dono: false, status: "", acessoClientes: "todos", clientes: [], marcas: [] }, valores); }

export const ehAdmin = () => eu.dono || eu.papel === "admin";
/** Pessoa do cliente: usa o portal do cliente (aprovar, calendário, marca, resultados), não as telas da equipe. */
export const ehCliente = () => !eu.dono && eu.papel === "cliente";
/** Quem vê só alguns clientes (definido pelo administrador em Usuários). Cliente sempre vê só os dele. */
export const clientesRestritos = () => !ehAdmin() && (eu.acessoClientes === "alguns" || ehCliente());
/** Cliente limitado a algumas marcas (ex.: só uma marca de um grupo). */
export const marcasRestritas = () => ehCliente() && (eu.marcas || []).length > 0;
export const pode = (area) => ehAdmin() || (area !== "financeiro" && !ehCliente() && (eu.permissoes || []).includes(area));

/** Tipos de tarefa que pertencem a cada área (quem não tem a área não vê essas tarefas). */
const TIPOS_DA_AREA = {
  conteudo: ["Conteúdo", "Produção", "Vídeo / Roteiro", "Planejamento"],
  trafego: ["Tráfego pago"],
  financeiro: ["Financeiro / Comercial"]
};
export function tarefaVisivel(t) {
  if (ehAdmin()) return true;
  for (const [area, tipos] of Object.entries(TIPOS_DA_AREA)) if (tipos.includes(t.tipo) && !pode(area)) return t.responsavel === eu.nome;
  return true;
}

/** Coleções que o usuário pode ler (as outras nem são pedidas ao banco). */
export function colecoesPermitidas() {
  if (ehCliente()) return ["clientes", "marcas", "tarefas", "membros"];
  const base = ["clientes", "marcas", "tarefas", "compromissos", "recorrencias", "membros"];
  if (pode("financeiro")) base.push("financeiro", "orcamentos", "contratos");
  if (pode("trafego")) base.push("contasAds", "manutencoes");
  if (pode("conteudo")) base.push("aprovacoes");
  return base;
}
