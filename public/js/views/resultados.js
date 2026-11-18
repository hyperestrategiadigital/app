// Aba "Resultados" da ficha do cliente: números do Instagram e do Facebook (Meta) da marca escolhida,
// no período, e de cada post — ligando cada post do Instagram ao post do calendário do app.
import { el, avisar, hojeISO, addDias, fmtData, vazio } from "../ui.js";
import { dados, porId, atualizar, marcasDo } from "../db.js";
import { ehAdmin } from "../permissoes.js";
import { TIPO_CONTEUDO } from "../constantes.js";
import { dataPost } from "../exportacao.js";
import { abrirTarefa, corCliente } from "./componentes.js";
import { metaDisponivel, metaConectada, conectarMeta, contaMeta, paginas, resultados } from "../meta.js";

const fmtNum = (n) => (typeof n === "number" ? n.toLocaleString("pt-BR") : "—");

function periodo(chave) {
  const hoje = hojeISO();
  const [a, m] = hoje.split("-").map(Number);
  if (chave === "7") return [addDias(hoje, -7), addDias(hoje, -1)];
  if (chave === "mes") return [`${hoje.slice(0, 7)}-01`, hoje];
  if (chave === "passado") {
    const ini = hojeISO(new Date(a, m - 2, 1)), fim = hojeISO(new Date(a, m - 1, 0));
    return [ini, addDias(ini, 29) < fim ? addDias(ini, 29) : fim]; // a Meta entrega até 30 dias por vez
  }
  return [addDias(hoje, -30), addDias(hoje, -1)];
}

const cache = new Map(); // chave → { carregando, dados, erro }

export function abaResultados(c, estado, renderizar) {
  estado.resMarca ??= "";
  estado.resPeriodo ??= "30";
  const marcas = marcasDo(c.id);
  const marca = estado.resMarca ? porId("marcas", estado.resMarca) : null;
  const alvo = marca || c;
  const pageId = alvo.facebookPageId || "";
  const seletorMarca = marcas.length ? el("div", { class: "marcas-seletor" },
    [["", `${c.nome} (principal)`, c], ...marcas.map((m) => [m.id, m.nome, m])].map(([id, nome, obj]) =>
      el("button", { class: `legenda-item ${estado.resMarca === id ? "ativo" : ""}`, style: { "--selo": corCliente(obj) }, onClick: () => { estado.resMarca = id; renderizar(); } },
        el("span", { class: "bolinha" }), nome))) : null;

  if (!metaDisponivel()) return el("div", {}, seletorMarca,
    vazio("Os relatórios do Instagram e do Facebook ainda não foram ligados.",
      ehAdmin() ? el("a", { href: "#/config", class: "link" }, "Ligar em Ajustes →") : el("span", { class: "subtitulo" }, "Peça para um administrador ligar em Ajustes.")));

  if (!metaConectada()) return el("div", {}, seletorMarca,
    el("div", { class: "bloco-vazio" },
      el("p", {}, "Conecte o seu Facebook (o que administra as páginas dos clientes) para ver os números. O acesso vale por algumas horas e fica só neste navegador."),
      el("button", { class: "destaque", onClick: async (e) => {
        e.currentTarget.disabled = true;
        try { const nome = await conectarMeta(); avisar(`Facebook conectado: ${nome}.`); renderizar(); }
        catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
      } }, "Conectar Facebook / Instagram")));

  if (!pageId) return el("div", {}, seletorMarca, ligarPagina(c, marca, renderizar));

  const [de, ate] = periodo(estado.resPeriodo);
  const chave = `${pageId}|${de}|${ate}`;
  let item = cache.get(chave);
  if (!item) {
    item = { carregando: true };
    cache.set(chave, item);
    resultados(pageId, de, ate).then((r) => { item.carregando = false; item.dados = r; renderizar(); })
      .catch((e) => { item.carregando = false; item.erro = e.message; renderizar(); });
  }
  const topo = el("div", { class: "filtros" },
    el("select", { "aria-label": "Período", onChange: (e) => { estado.resPeriodo = e.target.value; renderizar(); } },
      [["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["mes", "Este mês"], ["passado", "Mês passado"]]
        .map(([v, r]) => el("option", { value: v, selected: v === estado.resPeriodo }, r))),
    el("span", { class: "subtitulo" }, `${fmtData(de, true)} a ${fmtData(ate, true)} · conectado como ${contaMeta()}`),
    el("span", { class: "espaco" }),
    el("button", { class: "link", onClick: () => { cache.delete(chave); renderizar(); } }, "Atualizar"),
    el("button", { class: "link", onClick: async () => { await atualizar(marca ? "marcas" : "clientes", alvo.id, { facebookPageId: "" }); renderizar(); } }, "Trocar página"));

  if (item.carregando) return el("div", {}, seletorMarca, topo, el("p", { class: "subtitulo" }, "Buscando os números na Meta…"));
  if (item.erro) return el("div", {}, seletorMarca, topo, el("p", { class: "faixa-alerta" }, "Não consegui ler os resultados: ", item.erro));
  const r = item.dados;
  return el("div", { class: "aba-resultados" }, seletorMarca, topo, painel(r, c, marca));
}

/** Escolher qual página do Facebook (e o Instagram ligado a ela) é deste cliente ou marca. */
function ligarPagina(c, marca, renderizar) {
  const caixa = el("div", { class: "bloco-vazio" }, el("p", { class: "subtitulo" }, "Carregando as suas páginas…"));
  paginas().then((lista) => {
    if (!lista.length) { caixa.replaceChildren(el("p", {}, "Seu Facebook não administra nenhuma página. Confira o acesso no Meta Business Suite.")); return; }
    const sel = el("select", { "aria-label": "Página" }, lista.map((p) => el("option", { value: p.id },
      `${p.name}${p.instagram_business_account ? ` · Instagram @${p.instagram_business_account.username}` : " · sem Instagram ligado"}`)));
    caixa.replaceChildren(
      el("p", {}, `Qual é a página de ${marca ? marca.nome : c.nome}? O Instagram profissional ligado a ela vem junto.`), sel,
      el("div", { class: "acoes" }, el("button", { class: "destaque", onClick: async () => {
        await atualizar(marca ? "marcas" : "clientes", (marca || c).id, { facebookPageId: sel.value });
        avisar("Página ligada.");
        renderizar();
      } }, "Usar esta página")));
  }).catch((e) => caixa.replaceChildren(el("p", { class: "faixa-alerta" }, e.message)));
  return caixa;
}

function painel(r, c, marca) {
  const blocoMetricas = (titulo, lista) => el("div", {},
    el("h3", {}, titulo),
    el("div", { class: "resumo resumo-metricas" }, lista.map((m) => el("div", { class: "numero", title: m.erro || "" },
      el("strong", {}, m.erro ? "—" : fmtNum(m.valor)), el("span", {}, m.rotulo)))));
  const postsApp = dados.tarefas.filter((t) => t.tipo === TIPO_CONTEUDO && t.clienteId === c.id && (!marca || t.marcaId === marca.id));
  const ig = r.instagram;
  const resumoTexto = () => [
    `Resultados de ${marca ? marca.nome : c.nome}`,
    ig ? `Instagram @${ig.conta.username}: ${fmtNum(ig.conta.followers_count)} seguidores` : "",
    ...(ig?.metricas || []).filter((m) => !m.erro).map((m) => `- ${m.rotulo}: ${fmtNum(m.valor)}`),
    ...(r.facebook.metricas || []).filter((m) => !m.erro).map((m) => `- Facebook · ${m.rotulo}: ${fmtNum(m.valor)}`),
    ig?.posts?.length ? `${ig.posts.length} post(s) no período` : ""
  ].filter(Boolean).join("\n");
  return el("div", {},
    ig ? el("div", { class: "conta-ig" },
      ig.conta.profile_picture_url ? el("img", { class: "avatar grande", src: ig.conta.profile_picture_url, alt: "", referrerpolicy: "no-referrer" }) : null,
      el("div", {}, el("strong", {}, `@${ig.conta.username}`), el("div", { class: "subtitulo" }, `${fmtNum(ig.conta.followers_count)} seguidores · ${fmtNum(ig.conta.media_count)} publicações · página ${r.pagina.nome}`)),
      el("span", { class: "espaco" }),
      el("button", { class: "secundario mini", onClick: async () => { await navigator.clipboard.writeText(resumoTexto()).catch(() => {}); avisar("Resumo copiado (cole no relatório ou no WhatsApp)."); } }, "Copiar resumo"))
      : el("p", { class: "faixa-aviso" }, `A página ${r.pagina.nome} não tem Instagram profissional ligado.`),
    ig ? blocoMetricas("Instagram", ig.metricas) : null,
    r.facebook.metricas.some((m) => !m.erro) ? blocoMetricas("Facebook", r.facebook.metricas) : null,
    ig ? [
      el("h3", {}, `Posts do Instagram no período (${ig.posts.length})`),
      ig.posts.length ? el("div", { class: "grade-posts-ig" }, ig.posts.sort((a, b) => b.data.localeCompare(a.data)).map((p) => {
        const doApp = postsApp.find((t) => dataPost(t) === p.data);
        return el("article", { class: "post-ig" },
          el("a", { href: p.permalink, target: "_blank", rel: "noopener" },
            el("img", { src: p.thumbnail_url || p.media_url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" })),
          el("div", { class: "post-ig-info" },
            el("div", { class: "subtitulo" }, `${fmtData(p.data, true)} · ${p.media_product_type === "REELS" ? "Reels" : p.media_type === "CAROUSEL_ALBUM" ? "Carrossel" : p.media_product_type === "STORY" ? "Story" : "Feed"}`),
            el("p", { class: "post-ig-legenda" }, (p.caption || "").slice(0, 90)),
            el("div", { class: "cartao-meta" },
              [["views", "👁"], ["reach", "alcance"], ["likes", "❤"], ["comments", "💬"], ["shares", "↗"], ["saved", "🔖"]]
                .filter(([k]) => p.numeros[k] != null).map(([k, r]) => el("span", { class: "etiqueta", title: k }, `${r} ${fmtNum(p.numeros[k])}`))),
            doApp ? el("button", { class: "link", onClick: () => abrirTarefa(doApp) }, `Post do app: ${doApp.titulo}`) : null));
      })) : vazio("Nenhum post no Instagram neste período.")
    ] : null);
}
