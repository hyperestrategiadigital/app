// Aba "Contas" da ficha do cliente: redes sociais e canais, com atalhos para agendar (Meta Business Suite, LinkedIn).
// Igual para todos: cliente sem marcas preenche direto; grupo escolhe a marca (ou o institucional) e preenche cada uma.
// Contas de anúncio ficam só na tela Tráfego pago.
// A publicação/leitura automática pela API fica para uma etapa futura (exige app aprovado e servidor).
import { el, formulario, avisar, linkExterno } from "../ui.js";
import { atualizar, porId } from "../db.js";
import { marcaEscolhida } from "./marca.js";
import { CAMPOS_REDES } from "../constantes.js";

const soNumeros = (s) => String(s || "").replace(/\D/g, "");
const comHttp = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `https://${u}`);

export const linkAgendadorMeta = (c) => c.facebookPageId
  ? `https://business.facebook.com/latest/content_calendar?asset_id=${soNumeros(c.facebookPageId)}`
  : "https://business.facebook.com/latest/content_calendar";
export const linkLinkedinAdmin = (c) => c.linkedin ? comHttp(c.linkedin).replace(/\/?$/, "/admin/page-posts/published/") : "";

const semProtocolo = (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const perfil = (v) => String(v || "").replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
const BASE_PERFIL = { instagram: "https://instagram.com/", tiktok: "https://www.tiktok.com/@", pinterest: "https://pinterest.com/", threads: "https://www.threads.net/@", x: "https://x.com/" };

/** Texto e link de cada rede, conforme o tipo do campo. */
function exibir(campo, tipo, valor) {
  if (!valor) return ["", ""];
  if (tipo === "perfil") return [`@${perfil(valor)}`, /^https?:/i.test(valor) ? valor : BASE_PERFIL[campo] + perfil(valor)];
  if (tipo === "telefone") return [valor, `https://wa.me/55${soNumeros(valor).replace(/^55/, "")}`];
  if (tipo === "id") return [valor, ""];
  return [semProtocolo(valor), comHttp(valor)];
}

/** Redes de um post/tarefa: as da marca, se tiver; senão as do cliente. Rede não passa do grupo para a marca. */
export function redesDe(clienteId, marcaId) {
  return (marcaId && porId("marcas", marcaId)) || porId("clientes", clienteId) || {};
}

/** Editar as redes de uma conta: o cliente (sem marcas ou institucional do grupo) ou uma marca. */
export function editarContas(c, marca = null) {
  const alvo = marca || c;
  return formulario(`Redes sociais · ${marca ? `${c.nome} · ${marca.nome}` : c.nome}`, [
    ...CAMPOS_REDES.map(([nome, rotulo, dica]) => ({ nome, rotulo, dica, largura: "metade" })),
    ...(marca ? [] : [
      { tipo: "secao", rotulo: "Negócios (Meta e Google)" },
      { nome: "businessManagerId", rotulo: "ID do Gerenciador de Negócios (Meta)", largura: "metade" },
      { nome: "googleAdsId", rotulo: "ID do cliente no Google Ads", dica: "123-456-7890", largura: "metade" }])
  ], alvo, {
    largo: true,
    aoSalvar: async (v) => { await atualizar(marca ? "marcas" : "clientes", alvo.id, v); avisar("Redes salvas."); }
  });
}

/** Cartão com as redes de uma conta (cliente ou marca) e os atalhos para agendar. */
function cartaoConta(c, marca, titulo) {
  const alvo = marca || c;
  const linha = (rotulo, valor, link) => el("div", { class: "linha-conta-cliente" },
    el("span", { class: "rotulo-conta" }, rotulo), el("strong", {}, valor), link ? linkExterno(link, "abrir ↗") : null);
  const preenchidas = CAMPOS_REDES.filter(([k]) => alvo[k]);
  return el("div", { class: "cartao-conta", style: { "--selo": alvo.paleta?.[0] || alvo.cor || "var(--hyper-roxo)" } },
    el("div", { class: "com-acao" }, el("h3", {}, titulo),
      el("button", { class: "secundario mini", onClick: () => editarContas(c, marca) }, "Editar redes")),
    preenchidas.length ? preenchidas.map(([k, rotulo, , tipo]) => linha(rotulo, ...exibir(k, tipo, alvo[k])))
      : el("p", { class: "subtitulo" }, "Nenhuma rede cadastrada ainda."),
    el("div", { class: "atalhos-agendamento" },
      el("a", { class: "botao-link mini", href: linkAgendadorMeta(alvo), target: "_blank", rel: "noopener" }, "Agendar · Meta Business Suite ↗"),
      alvo.linkedin ? el("a", { class: "botao-link secundario mini", href: linkLinkedinAdmin(alvo), target: "_blank", rel: "noopener" }, "LinkedIn ↗") : null,
      alvo.googleMeuNegocio ? el("a", { class: "botao-link secundario mini", href: comHttp(alvo.googleMeuNegocio), target: "_blank", rel: "noopener" }, "Google Meu Negócio ↗") : null));
}

/**
 * Aba Contas: as redes da conta aberta na ficha. Cliente sem marcas: as dele. Grupo: as da marca escolhida
 * (ou as do próprio grupo, no geral). Os mesmos campos para todos.
 */
export function abaContas(c, estado = {}) {
  const { marca, grupo } = marcaEscolhida(c, estado);
  return el("div", { class: "aba-contas" },
    cartaoConta(c, marca, marca ? `Redes · ${marca.nome}` : grupo ? `Redes · ${c.nome} (institucional)` : "Redes sociais"),
    !marca && (c.businessManagerId || c.googleAdsId) ? el("p", { class: "nota" },
      [c.businessManagerId ? `Gerenciador de Negócios (Meta): ${c.businessManagerId}` : "", c.googleAdsId ? `Google Ads: ${c.googleAdsId}` : ""].filter(Boolean).join(" · ")) : null,
    el("p", { class: "nota" }, "Para o atalho de agendar abrir direto na página certa, preencha o ID da página do Facebook. As contas de anúncio ficam na tela Tráfego pago."));
}
