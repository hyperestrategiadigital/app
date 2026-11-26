// Página pública de aprovação (aprovar.html?t=<token>): o cliente vê os posts e aprova ou pede revisão.
// Não pede login. Só funciona com um link válido gerado no app (60 dias).
// Para abrir rápido: sem o módulo de login, com o Firestore Lite (só leituras e gravações simples, sem conexão
// "ao vivo") e os textos primeiro; cada imagem aparece quando chega.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, collection } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore-lite.js";
import { firebaseConfig } from "./firebase-config.js";
import { el, fmtData, fmtDiaSemana, avisar } from "./ui.js";

const app = initializeApp(firebaseConfig);
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
  // Respostas são pequenas: vêm antes de mostrar. As imagens (pesadas) vêm depois, uma por post.
  const respostas = await getDocs(collection(db, ...caminho("respostas")))
    .then((s) => Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))).catch(() => ({}));
  const artes = {}; // postId -> dataURL (quando chegar)
  const carregarArte = (postId) => (artes[postId] ??= getDoc(doc(db, ...caminho("artes", postId)))
    .then((s) => (s.exists() ? s.data().dados : null)).catch(() => null));

  let nome = "";
  try { nome = localStorage.getItem(chaveNome) || ""; } catch {}
  const campoNome = el("input", { id: "aprov-nome", type: "text", value: nome, placeholder: "Seu nome", autocomplete: "name" });
  campoNome.addEventListener("input", () => { try { localStorage.setItem(chaveNome, campoNome.value.trim()); } catch {} });

  const responder = async (post, status, comentario, cartao, copyNova) => {
    if (!campoNome.value.trim()) { avisar("Escreva seu nome no topo antes de responder.", "erro"); campoNome.focus(); return false; }
    const r = { status, comentario: comentario || "", nome: campoNome.value.trim().slice(0, 80), em: Date.now() };
    if (copyNova) r.copyNova = copyNova.slice(0, 5000);
    try {
      await setDoc(doc(db, ...caminho("respostas", post.id)), r);
      respostas[post.id] = r;
      cartao.replaceWith(cartaoPost(post));
      atualizarResumo();
      return true;
    } catch (e) { avisar("Não consegui enviar. Confira a internet e tente de novo.", "erro"); return false; }
  };

  const seloResposta = (r) => !r ? null
    : r.status === "aprovado" ? el("span", { class: "etiqueta ok" }, r.copyNova ? "✓ Aprovado com a sua legenda" : "✓ Aprovado")
    : el("span", { class: "etiqueta alerta" }, "✎ Revisão pedida");

  function cartaoPost(post) {
    const r = respostas[post.id];
    const legendaAtual = r?.copyNova || post.copy || "";
    // Revisão: a pessoa edita a legenda ela mesma e/ou escreve o que quer mudar
    const legenda = post.copy ? el("textarea", { rows: Math.min(14, Math.max(5, Math.ceil(legendaAtual.length / 60))), "aria-label": "Legenda" }) : null;
    if (legenda) legenda.value = legendaAtual;
    const comentario = el("textarea", { rows: 3, placeholder: post.copy ? "Quer mudar mais alguma coisa? (imagem, data, outra ideia…) Opcional se você já editou a legenda." : "O que você quer mudar? (tema, ideia, data…)" });
    if (r?.status === "ajuste" && r.comentario) comentario.value = r.comentario;
    const caixaRevisao = el("div", { class: "aprov-ajuste", hidden: true },
      legenda ? el("label", { class: "campo" }, el("span", {}, "Legenda (edite à vontade)"), legenda) : null,
      el("label", { class: "campo" }, el("span", {}, post.copy ? "Pedido para a equipe" : "O que mudar"), comentario),
      post.copy ? el("p", { class: "subtitulo" }, "Se você só editar a legenda, o post fica aprovado com o seu texto. Se escrever um pedido, a equipe ajusta e te mostra de novo.") : null,
      el("div", { class: "acoes" },
        el("button", { class: "negar", onClick: () => (caixaRevisao.hidden = true) }, "Cancelar"),
        el("button", { class: "confirmar", onClick: async (e) => {
          const pedido = comentario.value.trim();
          const editada = legenda && legenda.value.trim() && legenda.value.trim() !== (post.copy || "").trim() ? legenda.value.trim() : "";
          if (!pedido && !editada) { avisar(post.copy ? "Edite a legenda ou conte o que você quer mudar." : "Conte o que você quer mudar.", "erro"); return; }
          e.currentTarget.disabled = true;
          const status = pedido ? "ajuste" : "aprovado";
          if (!(await responder(post, status, pedido, cartao, editada))) e.currentTarget.disabled = false;
        } }, "Enviar revisão")));

    const imagem = el("div", { class: "aprov-imagem-espaco" });
    if (post.temArte !== false) carregarArte(post.id).then((src) => {
      if (src) imagem.replaceChildren(el("img", { class: "aprov-imagem", src, alt: post.titulo }));
      else imagem.remove();
    });
    else imagem.remove();

    const cartao = el("article", { class: `bloco aprov-post ${r ? `respondido ${r.status}` : ""}` },
      el("div", { class: "aprov-data" },
        el("strong", {}, `${fmtDiaSemana(post.data)} · ${fmtData(post.data)}`), post.hora ? el("span", {}, ` às ${post.hora}`) : null,
        el("span", { class: "etiqueta" }, [post.formato, post.rede].filter(Boolean).join(" · ")),
        post.tema ? el("span", { class: "etiqueta alerta" }, "Tema para aprovar") : null, seloResposta(r)),
      imagem,
      el("h2", {}, post.titulo),
      post.objetivo ? el("p", { class: "subtitulo" }, `Objetivo: ${post.objetivo}`) : null,
      legendaAtual ? el("div", { class: "aprov-copy" }, el("span", { class: "subtitulo" }, r?.copyNova ? "Legenda (a sua versão)" : "Legenda"), el("p", {}, legendaAtual))
        : post.roteiro ? el("div", { class: "aprov-copy" }, el("span", { class: "subtitulo" }, "Ideia"), el("p", {}, post.roteiro)) : null,
      r?.comentario ? el("p", { class: "faixa-aviso" }, `Seu pedido: ${r.comentario}`) : null,
      el("div", { class: "acoes" },
        el("button", { class: r?.status === "aprovado" ? "secundario" : "confirmar", onClick: (e) => { e.currentTarget.disabled = true; responder(post, "aprovado", "", cartao, r?.copyNova || ""); } }, r?.status === "aprovado" ? "Aprovado ✓" : post.tema ? "Aprovar tema" : "Aprovar"),
        el("button", { class: "secundario", onClick: () => { caixaRevisao.hidden = false; (legenda || comentario).focus(); } }, r ? "Mudar a revisão" : "Pedir revisão")),
      caixaRevisao);
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
      const editadas = aprovacao.posts.filter((p) => respostas[p.id]?.copyNova).length;
      fetch(aprovacao.emailUrl, { method: "POST", body: JSON.stringify({
        tipo: "aviso-admins", nome: campoNome.value.trim(), email: aprovacao.nome,
        detalhe: `Respondeu a aprovação de ${aprovacao.rotulo || nomeMes(aprovacao.mes)} de ${aprovacao.nome}: ${aprovados} aprovado(s), ${n - aprovados} com revisão${editadas ? `, ${editadas} legenda(s) editada(s) pelo cliente` : ""}.`,
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
      el("p", {}, "Veja cada post e clique em ", el("strong", {}, "Aprovar"), " ou ", el("strong", {}, "Pedir revisão"),
        ". Na revisão você pode editar a legenda você mesma ou escrever o que quer mudar. Suas respostas vão direto para a equipe da Hyper."),
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
