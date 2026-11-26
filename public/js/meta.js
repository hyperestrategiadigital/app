// Relatórios do Instagram e do Facebook pela API da Meta (Graph API), direto do navegador.
// - O administrador cadastra o App ID do app da Meta em Ajustes (config/meta { appId, configId }). Nada disso é secreto.
//   configId: ID da configuração do "Login do Facebook para Empresas" (apps do tipo Negócio).
// - Cada pessoa conecta o próprio Facebook (o que administra as páginas dos clientes). O acesso dura algumas horas
//   e fica só neste navegador (sessionStorage), nunca no banco.
// - O app da Meta pode ficar em "modo de desenvolvimento": funciona para quem tem função no app (administrador,
//   desenvolvedor ou testador) e acesso às páginas. Não precisa da análise do app pela Meta.
import { dados } from "./db.js";

const VERSAO = "v23.0";
const API = `https://graph.facebook.com/${VERSAO}`;
// ads_read: números dos anúncios (Tráfego pago). No app do tipo Negócio, inclua ads_read também na configuração do login.
const PERMISSOES = "pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights,business_management,ads_read";
const CHAVE = "hyper-meta";

export const configMeta = () => dados.config.find((c) => c.id === "meta") || {};
export const metaDisponivel = () => !!configMeta().appId;

function sessao() { try { const s = JSON.parse(sessionStorage.getItem(CHAVE) || "null"); return s && s.expira > Date.now() ? s : null; } catch { return null; } }
export const metaConectada = () => !!sessao();
export const contaMeta = () => sessao()?.nome || "";

let sdk = null;
function carregarSdk() {
  if (sdk) return sdk;
  sdk = new Promise((pronto, falha) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId: configMeta().appId, cookie: false, xfbml: false, version: VERSAO });
      pronto(window.FB);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.onerror = () => { sdk = null; falha(new Error("Não consegui carregar o Facebook. Um bloqueador de anúncios pode estar impedindo.")); };
    document.head.append(s);
  });
  return sdk;
}

/** Abre a janela do Facebook para a pessoa autorizar a leitura das páginas e do Instagram. */
export async function conectarMeta() {
  if (!metaDisponivel()) throw new Error("O administrador ainda não cadastrou o App ID da Meta em Ajustes.");
  const FB = await carregarSdk();
  // App do tipo "Negócio" usa o Login do Facebook para Empresas: as permissões ficam numa "configuração" (config_id).
  // App comum usa a lista de permissões (scope).
  const { configId } = configMeta();
  const opcoes = configId ? { config_id: configId } : { scope: PERMISSOES, return_scopes: true, auth_type: "rerequest" };
  const r = await new Promise((ok) => FB.login(ok, opcoes));
  if (!r.authResponse) throw new Error("Conexão cancelada.");
  const token = r.authResponse.accessToken;
  const eu = await chamar("me", { fields: "name" }, token);
  const s = { token, nome: eu.name, expira: Date.now() + Math.min((r.authResponse.expiresIn || 3600) * 1000, 2 * 3600 * 1000) };
  try { sessionStorage.setItem(CHAVE, JSON.stringify(s)); } catch {}
  paginasCache = null;
  return s.nome;
}
export function desconectarMeta() { try { sessionStorage.removeItem(CHAVE); } catch {} paginasCache = null; }

async function chamar(caminho, params = {}, token = sessao()?.token) {
  if (!token) throw new Error("Conecte o Facebook para ver os resultados.");
  const url = new URL(`${API}/${caminho}`);
  for (const [k, v] of Object.entries({ ...params, access_token: token })) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  const r = await fetch(url);
  const json = await r.json().catch(() => ({}));
  if (json.error) {
    if (json.error.code === 190) desconectarMeta(); // acesso expirou
    const e = new Error(json.error.error_user_msg || json.error.message || "Erro da Meta");
    e.codigo = json.error.code;
    throw e;
  }
  return json;
}

let paginasCache = null;
/** Páginas que a pessoa administra, com o Instagram profissional ligado a cada uma. */
export async function paginas() {
  if (!paginasCache) {
    const lista = [];
    let depois = "";
    do {
      const r = await chamar("me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username,followers_count,media_count,profile_picture_url}", limit: 100, after: depois });
      lista.push(...(r.data || []));
      depois = r.paging?.next ? r.paging.cursors?.after : "";
    } while (depois);
    paginasCache = lista;
  }
  return paginasCache;
}

const segundos = (iso) => Math.floor(new Date(iso + "T00:00:00").getTime() / 1000);
const soma = (valores = []) => valores.reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);

/** Pede cada métrica separada: se a Meta aposentar uma, as outras continuam aparecendo. */
async function metricas(id, lista, params, token) {
  const r = await Promise.all(lista.map(async ([metrica, rotulo]) => {
    try {
      const j = await chamar(`${id}/insights`, { metric: metrica, ...params }, token);
      const item = j.data?.[0];
      if (!item) return null;
      const valor = item.total_value?.value ?? soma(item.values);
      return { metrica, rotulo, valor };
    } catch (e) { return { metrica, rotulo, erro: e.message }; }
  }));
  return r.filter(Boolean);
}

const METRICAS_IG = [["views", "Visualizações"], ["reach", "Contas alcançadas"], ["accounts_engaged", "Contas com interação"],
  ["total_interactions", "Interações"], ["likes", "Curtidas"], ["comments", "Comentários"], ["shares", "Compartilhamentos"],
  ["saves", "Salvamentos"], ["profile_views", "Visitas ao perfil"], ["follows_and_unfollows", "Novos seguidores (saldo)"]];
const METRICAS_FB = [["page_media_view", "Visualizações"], ["page_impressions_unique", "Alcance"], ["page_post_engagements", "Engajamento"],
  ["page_views_total", "Visitas à página"], ["page_daily_follows_unique", "Novos seguidores"]];
const METRICAS_POST = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"];

/**
 * Resultados de uma página/Instagram num período (de/ate em AAAA-MM-DD, até 30 dias por vez, limite da Meta).
 * Devolve { pagina, instagram: { conta, metricas, posts }, facebook: { metricas } }.
 */
export async function resultados(pageId, de, ate) {
  const pagina = (await paginas()).find((p) => p.id === pageId);
  if (!pagina) throw new Error("Seu Facebook não administra essa página. Peça acesso a ela no Meta Business Suite ou conecte outra conta.");
  const periodo = { since: segundos(de), until: segundos(ate) + 86399 };
  const ig = pagina.instagram_business_account;
  const [mIg, mFb, posts] = await Promise.all([
    ig ? metricas(ig.id, METRICAS_IG, { period: "day", metric_type: "total_value", ...periodo }, pagina.access_token) : [],
    metricas(pagina.id, METRICAS_FB, { period: "day", ...periodo }, pagina.access_token),
    ig ? postsInstagram(ig.id, de, ate, pagina.access_token) : []
  ]);
  return { pagina: { id: pagina.id, nome: pagina.name }, instagram: ig ? { conta: ig, metricas: mIg, posts } : null, facebook: { metricas: mFb } };
}

async function postsInstagram(igId, de, ate, token) {
  const lista = [];
  let depois = "";
  // A lista vem do mais novo para o mais velho: para quando passa do início do período
  do {
    const r = await chamar(`${igId}/media`, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count", limit: 50, after: depois }, token);
    const pagina = r.data || [];
    lista.push(...pagina);
    const ultimo = pagina[pagina.length - 1]?.timestamp?.slice(0, 10);
    depois = r.paging?.next && ultimo && ultimo >= de && lista.length < 200 ? r.paging.cursors?.after : "";
  } while (depois);
  const doPeriodo = lista.filter((m) => { const d = m.timestamp?.slice(0, 10); return d >= de && d <= ate; });
  return Promise.all(doPeriodo.map(async (m) => {
    const numeros = { likes: m.like_count, comments: m.comments_count };
    try {
      const j = await chamar(`${m.id}/insights`, { metric: METRICAS_POST.join(",") }, token);
      for (const item of j.data || []) numeros[item.name] = item.values?.[0]?.value ?? item.total_value?.value;
    } catch {
      // Alguns tipos de post não aceitam todas as métricas: tenta as básicas
      try { const j = await chamar(`${m.id}/insights`, { metric: "reach,saved" }, token); for (const item of j.data || []) numeros[item.name] = item.values?.[0]?.value; } catch {}
    }
    return { ...m, data: m.timestamp?.slice(0, 10), numeros };
  }));
}

/* ---------------- Anúncios (Tráfego pago) ---------------- */

// Tipos de ação que contam como lead e como conversa iniciada (WhatsApp, Messenger, Direct)
const TIPOS_LEAD = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped"];
const TIPO_CONVERSA = "onsite_conversion.messaging_conversation_started_7d";
const cacheAnuncios = new Map();

/**
 * Números de uma conta de anúncio da Meta num período (de/ate em AAAA-MM-DD): investimento, alcance, impressões,
 * cliques, leads, conversas e custo por lead/conversa. Cada campo é pedido separado (a Meta muda campos com frequência).
 * Precisa da permissão ads_read; o Facebook conectado precisa ter acesso à conta de anúncio.
 */
export async function anuncios(idConta, de, ate) {
  const id = String(idConta || "").replace(/\D/g, "");
  if (!id) throw new Error("Conta de anúncio sem ID. Preencha o ID (act_…) na conta, em Tráfego pago.");
  const chave = `${id}|${de}|${ate}`;
  if (!cacheAnuncios.has(chave)) {
    const params = { level: "account", time_range: JSON.stringify({ since: de, until: ate }) };
    const campo = async (nome) => {
      try { return (await chamar(`act_${id}/insights`, { fields: nome, ...params })).data?.[0]?.[nome]; }
      catch (e) { if (e.codigo === 190 || e.codigo === 200 || e.codigo === 10) throw e; return undefined; } // sem acesso: erro para a tela
    };
    const pedido = Promise.all(["spend", "reach", "impressions", "clicks", "actions"].map(campo)).then(([spend, reach, impressions, clicks, actions]) => {
      const acao = (tipo) => Number((actions || []).find((a) => a.action_type === tipo)?.value || 0);
      const leads = acao("lead") || TIPOS_LEAD.slice(1).reduce((s, t) => s + acao(t), 0);
      const conversas = acao(TIPO_CONVERSA);
      const investido = Number(spend || 0);
      return { investido, alcance: Number(reach || 0), impressoes: Number(impressions || 0), cliques: Number(clicks || 0), leads, conversas,
        custoLead: leads ? investido / leads : null, custoConversa: conversas ? investido / conversas : null };
    });
    cacheAnuncios.set(chave, pedido.catch((e) => { cacheAnuncios.delete(chave); throw e; }));
  }
  return cacheAnuncios.get(chave);
}

/** Soma os números de várias contas (ex.: todas as contas Meta de um cliente). */
export function somarAnuncios(lista) {
  const t = lista.reduce((s, x) => { for (const k of ["investido", "alcance", "impressoes", "cliques", "leads", "conversas"]) s[k] += x[k] || 0; return s; },
    { investido: 0, alcance: 0, impressoes: 0, cliques: 0, leads: 0, conversas: 0 });
  return { ...t, custoLead: t.leads ? t.investido / t.leads : null, custoConversa: t.conversas ? t.investido / t.conversas : null };
}
