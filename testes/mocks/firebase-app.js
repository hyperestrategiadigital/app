// Só para os testes de tela: substitui o SDK do Firebase (CDN) por uma versão em memória.
export const initializeApp = (cfg, nome) => ({ nome: nome || "principal" });
