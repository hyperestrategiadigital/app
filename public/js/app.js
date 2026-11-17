// Ponto de entrada: login, navegação entre telas e geração de tarefas recorrentes.
import { auth } from "./firebase.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { conectar, desconectar, aoMudar } from "./db.js";
import { el, avisar } from "./ui.js";
import { gerarRecorrencias } from "./recorrencias.js";

import * as hoje from "./views/hoje.js";
import * as tarefas from "./views/tarefas.js";
import * as clientes from "./views/clientes.js";
import * as calendario from "./views/calendario.js";
import * as financeiro from "./views/financeiro.js";
import * as trafego from "./views/trafego.js";
import * as config from "./views/config.js";

const ROTAS = {
  hoje: { titulo: "Hoje", icone: "☀", view: hoje },
  tarefas: { titulo: "Tarefas", icone: "✓", view: tarefas },
  calendario: { titulo: "Conteúdo", icone: "▦", view: calendario },
  clientes: { titulo: "Clientes", icone: "◉", view: clientes },
  trafego: { titulo: "Tráfego pago", icone: "↗", view: trafego },
  financeiro: { titulo: "Financeiro", icone: "$", view: financeiro },
  config: { titulo: "Ajustes", icone: "⚙", view: config }
};

const $ = (id) => document.getElementById(id);
const estadoTela = {}; // filtros e mês selecionado de cada tela, preservados entre renderizações

function rotaAtual() {
  const [nome, ...resto] = location.hash.replace(/^#\/?/, "").split("/");
  return { nome: ROTAS[nome] ? nome : "hoje", params: resto.map(decodeURIComponent) };
}

export function irPara(caminho) { location.hash = "#/" + caminho; }

function montarMenu() {
  const { nome } = rotaAtual();
  $("menu").replaceChildren(...Object.entries(ROTAS).map(([chave, r]) =>
    el("a", { href: `#/${chave}`, class: chave === nome ? "ativo" : "" },
      el("span", { class: "menu-icone", "aria-hidden": "true" }, r.icone), r.titulo)));
}

function renderizar() {
  const { nome, params } = rotaAtual();
  const r = ROTAS[nome];
  montarMenu();
  document.title = `${r.titulo} · Hyper`;
  const area = $("conteudo");
  const rolagem = area.scrollTop;
  const foco = document.activeElement?.id && area.contains(document.activeElement) ? document.activeElement : null;
  const cursor = foco?.selectionStart;
  estadoTela[nome] ??= {};
  area.replaceChildren(r.view.render({ params, estado: estadoTela[nome], renderizar }));
  area.scrollTop = rolagem;
  if (foco) {
    const novo = document.getElementById(foco.id);
    if (novo) { novo.focus(); try { novo.setSelectionRange(cursor, cursor); } catch {} }
  }
}

window.addEventListener("hashchange", () => { $("conteudo").scrollTop = 0; renderizar(); });

/* ---------------- Login ---------------- */
$("btn-entrar").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { avisar("Não foi possível entrar: " + e.message, "erro"); }
});
$("btn-sair").addEventListener("click", () => signOut(auth));

let pararDeOuvir = null;
onAuthStateChanged(auth, async (usuario) => {
  pararDeOuvir?.(); pararDeOuvir = null;
  if (!usuario) {
    desconectar();
    document.body.classList.remove("logado");
    return;
  }
  document.body.classList.add("logado", "carregando");
  $("usuario-nome").textContent = usuario.displayName || usuario.email;
  await conectar(usuario.uid, (e) => avisar("Erro ao carregar dados: " + e.message, "erro"));
  document.body.classList.remove("carregando");
  pararDeOuvir = aoMudar(renderizar);
  renderizar();
  gerarRecorrencias().catch((e) => console.error("Recorrências:", e));
});

/* Menu no celular */
$("btn-menu").addEventListener("click", () => document.body.classList.toggle("menu-aberto"));
$("menu").addEventListener("click", () => document.body.classList.remove("menu-aberto"));
