// Página pública de aprovação (aprovar.html?t=<token>): o cliente vê os posts do mês e aprova ou pede ajuste.
// Não pede login. Só funciona com um link válido gerado no app (60 dias).
import { app } from "./firebase.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, collection } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { el, fmtData, fmtDiaSemana, avisar } from "./ui.js";

const token = new URLSearchParams(location.search).get("t") || "";
const raiz = document.getElementById("aprovacao");
const BANCOS = ["(default)", "default"];
const caminho = (...p) => ["espacos", "hyper", "aprovacoes", token, ...p];
const chaveNome = "hyper-aprovacao-nome";
const nomeMes = (mes) => { const [a, m] = mes.split("-").map(Number); const t = new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };

function erro(texto) {
  raiz.replaceChildren(el("section", { class: "bloco" }, el("h1", {}, "Link indisponível"), el("p", {}, texto)));
}

async function abrir() {
  if (!/^[a-f0-9]{32}$/.test(token)) return erro("Este link está incompleto. Peça um novo link para a Hyper.");
  for (const id of BANCOS) {
    try {
      const db = id === "(default)" ? getFirestore(app) : getFirestore(app, id);
      const snap = await getDoc(doc(db, ...caminho()));
      if (snap.exists()) return { db, aprovacao: snap.data() };
    } catch (e) { console.warn(id, e.code); }
  }
  return null;
}

async function iniciar() {
  const achado = await abrir();
  if (!achado) return erro("Este link expirou ou não existe mais. Peça um novo link para a Hyper.");
  const { db, aprovacao } = achado;
  if (aprovacao.cor) document.documentElement.style.setProperty("--selo", aprovacao.cor);
  const [artes, respostas] = await Promise.all([
    getDocs(collection(db, ...caminho("artes"))).then((s) => Object.fromEntries(s.docs.map((d) => [d.id, d.data().dados]))).catch(() => ({})),
    getDocs(collection(db, ...caminho("respostas"))).then((s) => Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))).catch(() => ({}))
  ]);
  let nome = "";
  try { nome = localStorage.getItem(chaveNome) || ""; } catch {}
  const campoNome = el("input", { id: "aprov-nome", type: "text", value: nome, placeholder: "Seu nome", autocomplete: "name" });
  campoNome.addEventListener("input", () => { try { localStorage.setItem(chaveNome, campoNome.value.trim()); } catch {} });

  const responder = async (post, status, comentario, cartao) => {
    if (!campoNome.value.trim()) { avisar("Escreva seu nome no topo antes de responder.", "erro"); campoNome.focus(); return false; }
    const r = { status, comentario: comentario || "", nome: campoNome.value.trim().slice(0, 80), em: Date.now() };
    try {
      await setDoc(doc(db, ...caminho("respostas", post.id)), r);
      respostas[post.id] = r;
      cartao.replaceWith(cartaoPost(post));
      atualizarResumo();
      return true;
    } catch (e) { avisar("Não consegui enviar. Confira a internet e tente de novo.", "erro"); return false; }
  };

  const seloResposta = (r) => r ? el("span", { class: `etiqueta ${r.status === "aprovado" ? "ok" : "alerta"}` }, r.status === "aprovado" ? "✓ Aprovado" : "✎ Ajuste pedido") : null;

  function cartaoPost(post) {
    const r = respostas[post.id];
    const comentario = el("textarea", { rows: 3, placeholder: "O que você quer mudar? (texto, imagem, data…)" });
    const caixaAjuste = el("div", { class: "aprov-ajuste", hidden: true }, comentario,
      el("div", { class: "acoes" },
        el("button", { class: "negar", onClick: () => (caixaAjuste.hidden = true) }, "Cancelar"),
        el("button", { class: "confirmar", onClick: async (e) => {
          if (!comentario.value.trim()) { avisar("Conte o que você quer mudar.", "erro"); return; }
          e.currentTarget.disabled = true;
          if (!(await responder(post, "ajuste", comentario.value.trim(), cartao))) e.currentTarget.disabled = false;
        } }, "Enviar ajuste")));
    const cartao = el("article", { class: `bloco aprov-post ${r ? `respondido ${r.status}` : ""}` },
      el("div", { class: "aprov-data" },
        el("strong", {}, `${fmtDiaSemana(post.data)} · ${fmtData(post.data)}`), post.hora ? el("span", {}, ` às ${post.hora}`) : null,
        el("span", { class: "etiqueta" }, [post.formato, post.rede].filter(Boolean).join(" · ")),
        post.tema ? el("span", { class: "etiqueta alerta" }, "Tema para aprovar") : null, seloResposta(r)),
      artes[post.id] ? el("img", { class: "aprov-imagem", src: artes[post.id], alt: post.titulo, loading: "lazy" }) : null,
      el("h2", {}, post.titulo),
      post.objetivo ? el("p", { class: "subtitulo" }, `Objetivo: ${post.objetivo}`) : null,
      post.copy ? el("div", { class: "aprov-copy" }, el("span", { class: "subtitulo" }, "Legenda"), el("p", {}, post.copy))
        : post.roteiro ? el("div", { class: "aprov-copy" }, el("span", { class: "subtitulo" }, "Ideia"), el("p", {}, post.roteiro)) : null,
      r?.comentario ? el("p", { class: "faixa-aviso" }, `Seu comentário: ${r.comentario}`) : null,
      el("div", { class: "acoes" },
        el("button", { class: r?.status === "aprovado" ? "secundario" : "confirmar", onClick: (e) => { e.currentTarget.disabled = true; responder(post, "aprovado", "", cartao); } }, r?.status === "aprovado" ? "Aprovado ✓" : post.tema ? "Aprovar tema" : "Aprovar"),
        el("button", { class: "secundario", onClick: () => { caixaAjuste.hidden = false; comentario.focus(); } }, r?.status === "ajuste" ? "Mudar o pedido de ajuste" : "Pedir ajuste")),
      caixaAjuste);
    cartao.dataset.post = post.id;
    return cartao;
  }

  const resumo = el("p", { class: "subtitulo" });
  const atualizarResumo = () => {
    const n = aprovacao.posts.length, respondidos = aprovacao.posts.filter((p) => respostas[p.id]).length;
    resumo.textContent = respondidos === n ? `Pronto! Você respondeu os ${n} posts. Obrigado — a Hyper já recebeu.` : `${respondidos} de ${n} posts respondidos.`;
    if (respondidos === n && aprovacao.emailUrl && !atualizarResumo.avisado) {
      atualizarResumo.avisado = true;
      const aprovados = aprovacao.posts.filter((p) => respostas[p.id]?.status === "aprovado").length;
      fetch(aprovacao.emailUrl, { method: "POST", body: JSON.stringify({
        tipo: "aviso-admins", nome: campoNome.value.trim(), email: aprovacao.nome,
        detalhe: `Respondeu a aprovação de ${aprovacao.rotulo || nomeMes(aprovacao.mes)} de ${aprovacao.nome}: ${aprovados} aprovado(s), ${n - aprovados} com ajuste.`,
        link: location.origin + location.pathname.replace(/aprovar\.html$/, "") + "#/calendario"
      }) }).catch(() => {});
    }
  };
  atualizarResumo();

  const posts = [...aprovacao.posts].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  raiz.replaceChildren(
    el("header", { class: "tela-topo ficha-topo" },
      el("div", {}, el("h1", {}, aprovacao.nome || "Planejamento"), el("p", { class: "subtitulo" }, `Conteúdo ${aprovacao.rotulo ? `da ${aprovacao.rotulo}` : `de ${nomeMes(aprovacao.mes)}`} · ${posts.length} post(s)`))),
    el("section", { class: "bloco" },
      el("p", {}, "Veja cada post e clique em ", el("strong", {}, "Aprovar"), " ou ", el("strong", {}, "Pedir ajuste"), ". Suas respostas vão direto para a equipe da Hyper."),
      el("label", { class: "campo", for: "aprov-nome" }, el("span", {}, "Seu nome"), campoNome),
      resumo,
      el("div", { class: "acoes" }, el("button", { class: "secundario", onClick: async (e) => {
        if (!campoNome.value.trim()) { avisar("Escreva seu nome antes.", "erro"); campoNome.focus(); return; }
        e.currentTarget.disabled = true;
        for (const p of posts) if (!respostas[p.id]) await responder(p, "aprovado", "", document.querySelector(`[data-post="${p.id}"]`));
      } }, "Aprovar todos os que faltam"))),
    ...posts.map(cartaoPost));
}

iniciar().catch((e) => { console.error(e); erro("Algo deu errado ao abrir. Tente recarregar a página."); });
