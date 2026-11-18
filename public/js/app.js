// Ponto de entrada: login, navegação entre telas e geração de tarefas recorrentes.
import { auth } from "./firebase.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { conectar, desconectar, aoMudar, migrarParaEspaco, pedirAcesso, arquivarAntigas } from "./db.js";
import { el, avisar } from "./ui.js";
import { eu, pode, ehAdmin, AREAS } from "./permissoes.js";
import { gerarRecorrencias } from "./recorrencias.js";
import { abrirBusca, definirTelas, ativarAtalhoBusca } from "./busca.js";
import { completarPostsSemFormato, migrarReunioes, migrarTipos, alinharStatusPosts } from "./migracoes.js";

import * as hoje from "./views/hoje.js";
import * as tarefas from "./views/tarefas.js";
import * as clientes from "./views/clientes.js";
import * as calendario from "./views/calendario.js";
import * as financeiro from "./views/financeiro.js";
import * as trafego from "./views/trafego.js";
import * as config from "./views/config.js";
import * as planejamento from "./views/planejamento.js";
import * as criar from "./views/criar.js";
import * as rotinas from "./views/rotinas.js";
import * as relatorios from "./views/relatorios.js";
import * as usuarios from "./views/usuarios.js";

// `area`: quem não tem essa área não vê a tela ("admin" = só administradores)
// `grupo: "admin"`: fica dentro de "Administração" no menu. `menu: false`: tela sem item no menu.
const ROTAS = {
  hoje: { titulo: "Hoje", icone: "☀", view: hoje },
  tarefas: { titulo: "Tarefas", icone: "✓", view: tarefas },
  calendario: { titulo: "Calendário", icone: "▦", view: calendario },
  clientes: { titulo: "Clientes", icone: "◉", view: clientes },
  trafego: { titulo: "Tráfego pago", icone: "↗", view: trafego, area: "trafego" },
  financeiro: { titulo: "Financeiro", icone: "$", view: financeiro, area: "financeiro" },
  rotinas: { titulo: "Rotinas", icone: "↻", view: rotinas, area: "admin", grupo: "admin" },
  relatorios: { titulo: "Relatórios", icone: "▤", view: relatorios, area: "admin", grupo: "admin" },
  usuarios: { titulo: "Usuários e equipe", icone: "☺", view: usuarios, area: "admin", grupo: "admin" },
  config: { titulo: "Ajustes", icone: "⚙", view: config, grupo: "admin" },
  // Abertas a partir do calendário e do post
  planejamento: { titulo: "Planejamento", icone: "☷", view: planejamento, area: "conteudo", menu: false },
  criar: { titulo: "Criar", icone: "✦", view: criar, area: "conteudo", menu: false }
};
const liberada = (r) => !r.area || (r.area === "admin" ? ehAdmin() : pode(r.area));

const $ = (id) => document.getElementById(id);
const estadoTela = {}; // filtros e mês selecionado de cada tela, preservados entre renderizações

function rotaAtual() {
  const [nome, ...resto] = location.hash.replace(/^#\/?/, "").split("/");
  return { nome: ROTAS[nome] && liberada(ROTAS[nome]) ? nome : "hoje", params: resto.map(decodeURIComponent) };
}

export function irPara(caminho) { location.hash = "#/" + caminho; }

let adminAberto = null; // grupo "Administração" aberto/fechado (lembra a escolha)
function montarMenu() {
  const { nome } = rotaAtual();
  const item = ([chave, r]) => el("a", { href: `#/${chave}`, class: chave === nome ? "ativo" : "" },
    el("span", { class: "menu-icone", "aria-hidden": "true" }, r.icone), r.titulo);
  const visiveis = Object.entries(ROTAS).filter(([, r]) => liberada(r) && r.menu !== false);
  const principais = visiveis.filter(([, r]) => r.grupo !== "admin" || !ehAdmin()).map(item);
  const busca = el("button", { class: "menu-busca", onClick: abrirBusca, title: "Ctrl+K" },
    el("span", { class: "menu-icone", "aria-hidden": "true" }, "⌕"), "Buscar", el("kbd", {}, "Ctrl K"));
  if (!ehAdmin()) return $("menu").replaceChildren(busca, ...principais);
  const doGrupo = visiveis.filter(([, r]) => r.grupo === "admin");
  const dentro = doGrupo.some(([chave]) => chave === nome);
  const grupo = el("details", { class: "menu-grupo", onToggle: (e) => (adminAberto = e.currentTarget.open) },
    el("summary", { class: dentro ? "ativo-grupo" : "" }, el("span", { class: "menu-icone", "aria-hidden": "true" }, "▣"), "Administração"),
    ...doGrupo.map(item));
  grupo.open = adminAberto ?? dentro;
  $("menu").replaceChildren(busca, ...principais, grupo);
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
  area.replaceChildren(faixaPendente(), r.view.render({ params, estado: estadoTela[nome], renderizar }));
  area.scrollTop = rolagem;
  if (foco) {
    const novo = document.getElementById(foco.id);
    if (novo) { novo.focus(); try { novo.setSelectionRange(cursor, cursor); } catch {} }
  }
}

definirTelas(() => Object.entries(ROTAS).filter(([, r]) => liberada(r) && r.menu !== false)
  .map(([chave, r]) => ({ titulo: r.titulo, icone: r.icone, href: `#/${chave}` })));
ativarAtalhoBusca();

window.addEventListener("hashchange", () => { $("conteudo").scrollTop = 0; renderizar(); });

/* ---------------- Login ---------------- */
$("btn-entrar").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { avisar("Não foi possível entrar: " + e.message, "erro"); }
});
$("btn-sair").addEventListener("click", () => signOut(auth));

let pararDeOuvir = null;
let usuarioAtual = null;

/** Aviso para quem entrou e ainda está só com o acesso básico. */
function faixaPendente() {
  if (ehAdmin() || eu.permissoes?.length) return "";
  return el("p", { class: "faixa-aviso faixa-topo" }, "Você está com o acesso básico (Hoje, Tarefas, compromissos e lista de clientes). Para mais áreas, fale com o administrador.");
}

function telaCheia(...filhos) {
  document.body.classList.remove("carregando");
  $("conteudo").replaceChildren(el("div", { class: "tela tela-estreita" }, ...filhos));
}

async function entrar(usuario) {
  const estado = await conectar(usuario, (e) => avisar("Erro ao carregar dados: " + e.message, "erro"));
  const papel = ehAdmin() ? "Administrador" : eu.permissoes?.length ? eu.permissoes.map((a) => AREAS.find(([v]) => v === a)?.[1]).join(", ") : "Acesso básico";
  $("usuario-nome").textContent = `${eu.nome || usuario.email} · ${papel}`;

  if (estado === "migrar") return telaCheia(
    el("h1", {}, "Criar o espaço da Hyper"),
    el("p", {}, "A partir de agora o app é compartilhado: cada pessoa entra com o próprio Google e vê o que tiver permissão. Esta conta tem os dados atuais (clientes, tarefas, posts, financeiro…) e vai virar a administradora do espaço."),
    el("p", { class: "subtitulo" }, "Os dados são copiados para o espaço novo. A cópia antiga continua guardada como backup."),
    (() => {
      const status = el("p", { class: "subtitulo" });
      const botao = el("button", { class: "destaque", onClick: async () => {
        botao.disabled = true;
        try {
          await migrarParaEspaco(usuario, (msg) => (status.textContent = msg));
          status.textContent = "Pronto!";
          location.reload();
        } catch (e) { avisar("Erro ao criar o espaço: " + e.message, "erro"); botao.disabled = false; }
      } }, "Criar o espaço e copiar meus dados");
      return el("div", {}, botao, status);
    })());

  if (estado === "pendente") return telaCheia(
    el("h1", {}, "Pedido enviado ✓"),
    el("p", {}, `Olá, ${eu.nome || usuario.email}! Seu pedido de acesso foi para o administrador da Hyper.`),
    el("p", { class: "subtitulo" }, "Esta tela atualiza sozinha quando ele liberar. Você entra com o acesso básico e ele libera as outras áreas."),
    el("button", { class: "link", onClick: () => signOut(auth) }, "Sair"));

  if (estado === "sem-espaco") return telaCheia(
    el("h1", {}, "Espaço da Hyper ainda não criado"),
    el("p", {}, "O administrador (conta da Hyper) precisa entrar primeiro para criar o espaço. Depois disso, entre de novo com esta conta para pedir acesso."),
    el("button", { class: "secundario", onClick: () => signOut(auth) }, "Sair"));

  if (estado === "novo") {
    const nome = el("input", { id: "acesso-nome", type: "text", value: usuario.displayName || "", placeholder: "Seu nome" });
    const funcoes = el("div", { class: "multi" }, [["admin", "Administração (tudo)"], ...AREAS.map(([v, r]) => [v, r])].map(([v, r]) =>
      el("label", { class: "chip-check" }, el("input", { type: "checkbox", value: v }), r)));
    return telaCheia(
      el("h1", {}, "Bem-vindo à Hyper"),
      el("p", {}, `Você entrou como ${usuario.email}. Para usar o app, peça acesso ao espaço da Hyper.`),
      el("label", { class: "campo", for: "acesso-nome" }, el("span", {}, "Seu nome"), nome),
      el("div", { class: "campo" }, el("span", {}, "Qual é o seu tipo de acesso? (o administrador confirma)"), funcoes),
      el("p", { class: "subtitulo" }, "Você entra com o acesso básico e o administrador libera as áreas depois."),
      el("div", { class: "acoes" },
        el("button", { class: "destaque", onClick: async (e) => {
          if (!nome.value.trim()) { avisar("Digite seu nome.", "erro"); return; }
          e.currentTarget.disabled = true;
          try {
            await pedirAcesso({ nome: nome.value.trim(), funcoes: [...funcoes.querySelectorAll("input:checked")].map((i) => i.value) });
            location.reload();
          } catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
        } }, "Pedir acesso"),
        el("button", { class: "link", onClick: () => signOut(auth) }, "Sair")));
  }

  document.body.classList.remove("carregando");
  pararDeOuvir = aoMudar(renderizar);
  renderizar();
  // Rotinas automáticas e ajustes de dados antigos: só o administrador roda
  if (ehAdmin()) {
    gerarRecorrencias().catch((e) => console.error("Recorrências:", e));
    completarPostsSemFormato().then(migrarReunioes).then(migrarTipos).then(alinharStatusPosts).then(arquivarAntigas).catch((e) => console.error("Migração:", e));
  }
}

onAuthStateChanged(auth, async (usuario) => {
  pararDeOuvir?.(); pararDeOuvir = null;
  usuarioAtual = usuario;
  if (!usuario) {
    desconectar();
    document.body.classList.remove("logado");
    return;
  }
  document.body.classList.add("logado", "carregando");
  $("usuario-nome").textContent = usuario.displayName || usuario.email;
  try {
    await entrar(usuario);
  } catch (e) {
    console.error(e);
    telaCheia(
      el("h1", {}, "Não consegui abrir seus dados"),
      el("p", { class: "faixa-alerta" }, e.message),
      el("button", { onClick: () => location.reload() }, "Tentar de novo"));
  }
});

/* Menu no celular */
$("btn-menu").addEventListener("click", () => document.body.classList.toggle("menu-aberto"));
$("menu").addEventListener("click", () => document.body.classList.remove("menu-aberto"));
