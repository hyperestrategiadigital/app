// Quem é o usuário logado no espaço da Hyper e o que ele pode ver.
// A proteção de verdade dos dados sensíveis (financeiro, tráfego, chave da OpenAI) está nas regras
// do Firestore (firestore.rules); aqui só escondemos o que a pessoa não usa.

export const AREAS = [
  ["conteudo", "Conteúdo", "Calendário de posts, planejamento, criar artes, marca dos clientes"],
  ["trafego", "Tráfego pago", "Contas de anúncio, verbas, manutenções e resultados"],
  ["financeiro", "Financeiro", "Mensalidades, cobranças, orçamentos e valores dos clientes"]
];
export const rotuloArea = (a) => AREAS.find(([v]) => v === a)?.[1] || a;

/** Dados do usuário no espaço: { uid, email, nome, papel: "admin" | "basico", permissoes: [], dono: bool } */
export const eu = { uid: "", email: "", nome: "", papel: "basico", permissoes: [], dono: false, status: "" };

export function definirEu(valores) { Object.assign(eu, { papel: "basico", permissoes: [], dono: false, status: "", acessoClientes: "todos", clientes: [] }, valores); }

export const ehAdmin = () => eu.dono || eu.papel === "admin";
/** Quem vê só alguns clientes (definido pelo administrador em Usuários). */
export const clientesRestritos = () => !ehAdmin() && eu.acessoClientes === "alguns";
export const pode = (area) => ehAdmin() || (eu.permissoes || []).includes(area);

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
  const base = ["clientes", "marcas", "tarefas", "compromissos", "recorrencias", "membros"];
  if (pode("financeiro")) base.push("financeiro", "orcamentos", "contratos");
  if (pode("trafego")) base.push("contasAds", "manutencoes");
  return base;
}
