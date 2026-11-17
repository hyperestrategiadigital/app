// Aba "Contas" da ficha do cliente: redes sociais e contas de anúncio, com atalhos para agendar
// (Meta Business Suite, LinkedIn) e para os gerenciadores de anúncios.
// A publicação/leitura automática pela API fica para uma etapa futura (exige app aprovado e servidor).
import { el, formulario, avisar, linkExterno, fmtMoeda, vazio } from "../ui.js";
import { dados, atualizar } from "../db.js";
import { abrirConta } from "./trafego.js";

const soNumeros = (s) => String(s || "").replace(/\D/g, "");
const comHttp = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `https://${u}`);

export const linkAgendadorMeta = (c) => c.facebookPageId
  ? `https://business.facebook.com/latest/content_calendar?asset_id=${soNumeros(c.facebookPageId)}`
  : "https://business.facebook.com/latest/content_calendar";
export const linkInstagram = (c) => c.instagram ? `https://instagram.com/${c.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}` : "";
export const linkLinkedinAdmin = (c) => c.linkedin ? comHttp(c.linkedin).replace(/\/?$/, "/admin/page-posts/published/") : "";
export const linkGerenciadorMeta = (conta) => soNumeros(conta.idConta) ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${soNumeros(conta.idConta)}` : "https://adsmanager.facebook.com/";
export const linkGoogleAds = () => "https://ads.google.com/aw/overview";

export function editarContas(c) {
  return formulario(`Contas · ${c.nome}`, [
    { tipo: "secao", rotulo: "Redes sociais" },
    { nome: "instagram", rotulo: "Instagram", dica: "@perfil", largura: "metade" },
    { nome: "facebook", rotulo: "Página do Facebook (link)", dica: "https://facebook.com/pagina", largura: "metade" },
    { nome: "facebookPageId", rotulo: "ID da página do Facebook", dica: "Configurações da página → Transparência (só números)", largura: "metade" },
    { nome: "linkedin", rotulo: "Página do LinkedIn (link)", dica: "https://linkedin.com/company/...", largura: "metade" },
    { nome: "tiktok", rotulo: "TikTok", dica: "@perfil", largura: "metade" },
    { nome: "youtube", rotulo: "YouTube (link)", largura: "metade" },
    { nome: "site", rotulo: "Site", largura: "metade" },
    { tipo: "secao", rotulo: "Negócios" },
    { nome: "businessManagerId", rotulo: "ID do Gerenciador de Negócios (Meta)", largura: "metade" },
    { nome: "googleAdsId", rotulo: "ID do cliente no Google Ads", dica: "123-456-7890", largura: "metade" }
  ], c, {
    largo: true,
    aoSalvar: async (v) => { await atualizar("clientes", c.id, v); avisar("Contas salvas."); }
  });
}

export function abaContas(c) {
  const contasAds = dados.contasAds.filter((x) => x.clienteId === c.id);
  const linha = (rotulo, valor, link, extra) => el("div", { class: "linha-conta-cliente" },
    el("span", { class: "rotulo-conta" }, rotulo),
    valor ? el("strong", {}, valor) : el("span", { class: "subtitulo" }, "não cadastrado"),
    link ? linkExterno(link, "abrir ↗") : null, extra || null);

  return el("div", { class: "aba-contas" },
    el("div", { class: "com-acao" }, el("h3", {}, "Redes sociais"), el("button", { class: "mini", onClick: () => editarContas(c) }, "Editar contas")),
    linha("Instagram", c.instagram, linkInstagram(c)),
    linha("Facebook", c.facebook ? c.facebook.replace(/^https?:\/\/(www\.)?/, "") : "", comHttp(c.facebook)),
    linha("LinkedIn", c.linkedin ? c.linkedin.replace(/^https?:\/\/(www\.)?/, "") : "", comHttp(c.linkedin)),
    linha("TikTok", c.tiktok, c.tiktok ? `https://www.tiktok.com/@${c.tiktok.replace(/^@/, "")}` : ""),
    linha("YouTube", c.youtube ? "canal" : "", comHttp(c.youtube)),
    linha("Site", c.site ? c.site.replace(/^https?:\/\/(www\.)?/, "") : "", comHttp(c.site)),

    el("h3", {}, "Agendar publicações"),
    el("div", { class: "atalhos-agendamento" },
      el("a", { class: "botao-link", href: linkAgendadorMeta(c), target: "_blank", rel: "noopener" }, "Instagram + Facebook · Meta Business Suite ↗"),
      c.linkedin ? el("a", { class: "botao-link secundario", href: linkLinkedinAdmin(c), target: "_blank", rel: "noopener" }, "LinkedIn · página ↗") : null),
    !c.facebookPageId ? el("p", { class: "subtitulo" }, "Cadastre o ID da página do Facebook para o atalho abrir direto no planejador deste cliente.") : null,

    el("div", { class: "com-acao" }, el("h3", {}, "Contas de anúncio"), el("button", { class: "mini", onClick: () => abrirConta({ clienteId: c.id }) }, "+ Conta de anúncio")),
    contasAds.length ? contasAds.map((x) => el("div", { class: "linha-conta-cliente" },
      el("span", { class: "rotulo-conta" }, x.plataforma),
      el("strong", {}, x.idConta || "sem ID"),
      x.verbaMensal ? el("span", {}, `${fmtMoeda(x.verbaMensal)}/mês`) : null,
      linkExterno(x.plataforma === "Google Ads" ? linkGoogleAds() : linkGerenciadorMeta(x), "gerenciador ↗"),
      el("button", { class: "link", onClick: () => abrirConta(x) }, "editar")))
      : vazio("Nenhuma conta de anúncio cadastrada."),
    el("p", { class: "nota" }, "Publicar e puxar resultados automaticamente pelas APIs da Meta, LinkedIn e Google exige um app aprovado por eles e um servidor (plano Blaze). Por enquanto o app guarda as contas e abre cada ferramenta no lugar certo."));
}
