// Relatórios do Instagram e do Facebook pela API da Meta (Graph API), direto do navegador.
// - O administrador cadastra o App ID do app da Meta em Ajustes (config/meta { appId }). O App ID não é secreto.
// - Cada pessoa conecta o próprio Facebook (o que administra as páginas dos clientes). O acesso dura algumas horas
//   e fica só neste navegador (sessionStorage), nunca no banco.
// - O app da Meta pode ficar em "modo de desenvolvimento": funciona para quem tem função no app (administrador,
//   desenvolvedor ou testador) e acesso às páginas. Não precisa da análise do app pela Meta.
import { dados } from "./db.js";

const VERSAO = "v23.0";
const API = `https://graph.facebook.com/${VERSAO}`;
const PERMISSOES = "pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights,business_management";
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
  const r = await new Promise((ok) => FB.login(ok, { scope: PERMISSOES, return_scopes: true, auth_type: "rerequest" }));
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
