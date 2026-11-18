// Creators (em breve): cadastro de influenciadoras e criadores de conteúdo.
// Por enquanto é só um marcador no menu, com o que a tela vai ter, para não esquecer de desenvolver.
import { el } from "../ui.js";
import { cabecalho } from "./componentes.js";

const PLANO = [
  ["Perfil de cada creator", "Nome, @ das redes, contato, cidade, nicho e faixa de preço."],
  ["Público", "Para quem ela fala: idade, região, interesses e números de alcance e engajamento."],
  ["Histórico com a Hyper", "Quais clientes e marcas ela já atendeu, campanhas, entregas e resultados."],
  ["Busca e filtros", "Encontrar a creator certa por nicho, cidade, público ou cliente parecido."],
  ["Ligação com os posts", "Marcar no calendário os conteúdos feitos com cada creator."]
];

export function render() {
  return el("div", { class: "tela tela-estreita" },
    cabecalho("Creators", "Influenciadoras e criadores de conteúdo"),
    el("section", { class: "bloco em-breve" },
      el("span", { class: "etiqueta compromisso" }, "Em breve"),
      el("h2", {}, "Esta área está sendo preparada"),
      el("p", {}, "Aqui vai ficar o cadastro das creators que a Hyper trabalha. O que está previsto:"),
      el("ul", { class: "lista-em-breve" }, PLANO.map(([titulo, texto]) => el("li", {}, el("strong", {}, titulo), " — ", texto)))));
}
