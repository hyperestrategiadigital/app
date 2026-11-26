// Ponto de entrada: login, navegação entre telas e geração de tarefas recorrentes.
import { auth } from "./firebase.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { conectar, desconectar, aoMudar, migrarParaEspaco, pedirAcesso, arquivarAntigas, dados, espacoInfo, atualizarMeuCadastro, sincronizarNomesClientes, registrarErro, limparAntigos, porId, notificar } from "./db.js";
import { aplicarListas } from "./constantes.js";
import { acompanharRespostas } from "./aprovacoes.js";
import { sincronizar as sincronizarAgenda } from "./agenda.js";
import { avisarAdmins, sincronizarAdmins } from "./emails.js";
import { avatar, abrirTarefa } from "./views/componentes.js";
import { el, avisar, hojeISO, quandoErro } from "./ui.js";
import { eu, pode, ehAdmin, ehCliente, AREAS, AREAS_EQUIPE } from "./permissoes.js";
import { gerarRecorrencias } from "./recorrencias.js";
import { marcarArtesComMarca } from "./arquivos.js";
import { abrirBusca, definirTelas, ativarAtalhoBusca } from "./busca.js";
import { completarPostsSemFormato, migrarReunioes, migrarTipos, migrarFormatos, alinharStatusPosts, marcarCompromissosParaAgenda, reativarGruposSumidos } from "./migracoes.js";

import * as hoje from "./views/hoje.js";
import * as tarefas from "./views/tarefas.js";
import * as clientes from "./views/clientes.js";
import * as calendario from "./views/calendario.js";
import * as financeiro from "./views/financeiro.js";
import * as trafego from "./views/trafego.js";
import * as config from "./views/config.js";
import * as planejamento from "./views/planejamento.js";
import * as rotinas from "./views/rotinas.js";
import * as relatorios from "./views/relatorios.js";
import * as usuarios from "./views/usuarios.js";
import * as conta from "./views/conta.js";
import * as lixeira from "./views/lixeira.js";
import * as creators from "./views/creators.js";
import * as portal from "./views/portal.js";

// `area`: quem não tem essa área não vê a tela ("admin" = só administradores)
// `grupo: "admin"`: fica dentro de "Administração" no menu. `menu: false`: tela sem item no menu.
const ROTAS = {
  hoje: { titulo: "Hoje", icone: "☀", view: hoje },
  // Tarefas e Calendário são uma tela só (visões Calendário, Quadro, Lista e Carga da equipe), com os mesmos filtros
  tarefas: { titulo: "Tarefas", icone: "✓", view: tarefas, estado: "calendario", menu: false },
  calendario: { titulo: "Tarefas", icone: "✓", view: calendario, inclui: ["tarefas"] },
  clientes: { titulo: "Clientes", icone: "◉", view: clientes },
  creators: { titulo: "Creators", icone: "★", view: creators, area: "conteudo", selo: "em breve" },
  trafego: { titulo: "Tráfego pago", icone: "↗", view: trafego, area: "trafego" },
  financeiro: { titulo: "Financeiro", icone: "$", view: financeiro, area: "financeiro" },
  rotinas: { titulo: "Rotinas", icone: "↻", view: rotinas, area: "admin", grupo: "admin" },
  relatorios: { titulo: "Relatórios", icone: "▤", view: relatorios, area: "admin", grupo: "admin" },
  usuarios: { titulo: "Usuários e equipe", icone: "☺", view: usuarios, area: "admin", grupo: "admin" },
  lixeira: { titulo: "Lixeira", icone: "⌫", view: lixeira, area: "admin", grupo: "admin" },
  config: { titulo: "Ajustes", icone: "⚙", view: config, area: "admin", grupo: "admin" },
  conta: { titulo: "Minha conta", icone: "☺", view: conta, menu: false },
  // Link direto para uma tarefa (ex.: e-mail de menção): abre Tarefas com ela aberta
  tarefa: { titulo: "Tarefa", icone: "✓", menu: false, view: { render: ({ params }) => {
    location.replace("#/tarefas");
    setTimeout(() => { const t = porId("tarefas", params[0]); if (t) abrirTarefa(t); else avisar("Essa tarefa não existe mais ou você não tem acesso.", "erro"); }, 300);
    return el("div");
  } } },
  // Abertas a partir do calendário e do post
  // Endereços antigos: o planejamento agora é um modo do Calendário; o Criar e o Studio (imagem) saíram
  planejamento: { titulo: "Planejamento", icone: "☷", view: { render: planejamento.redirecionar }, area: "conteudo", menu: false },
  criar: { titulo: "Criar", icone: "✦", view: { render: () => { location.replace("#/calendario"); return el("div"); } }, menu: false },
  studio: { titulo: "Studio", icone: "✦", view: { render: () => { location.replace("#/calendario"); return el("div"); } }, menu: false }
};
// Pessoa do cliente: o portal do cliente, com as telas dela
const ROTAS_CLIENTE = {
  inicio: { titulo: "Início", icone: "☀", view: portal.inicio },
  calendario: { titulo: "Calendário", icone: "▦", view: portal.calendario },
  marca: { titulo: "Marca", icone: "◉", view: portal.marca },
  resultados: { titulo: "Resultados", icone: "↗", view: portal.resultados },
  conta: { titulo: "Minha conta", icone: "☺", view: conta, menu: false },
  studio: { titulo: "Studio", icone: "✦", menu: false, view: { render: () => { location.replace("#/inicio"); return el("div"); } } }
};
const rotas = () => (ehCliente() ? ROTAS_CLIENTE : ROTAS);
const telaInicial = () => (ehCliente() ? "inicio" : "hoje");
const liberada = (r) => !r.area || (r.area === "admin" ? ehAdmin() : pode(r.area));

const $ = (id) => document.getElementById(id);
const estadoTela = {}; // filtros e mês selecionado de cada tela, preservados entre renderizações

function rotaAtual() {
  const [nome, ...resto] = location.hash.replace(/^#\/?/, "").split("/");
  const R = rotas();
  return { nome: R[nome] && liberada(R[nome]) ? nome : telaInicial(), params: resto.map(decodeURIComponent) };
}

export function irPara(caminho) { location.hash = "#/" + caminho; }

let adminAberto = null; // grupo "Administração" aberto/fechado (lembra a escolha)
function montarMenu() {
  const { nome } = rotaAtual();
  const item = ([chave, r]) => el("a", { href: `#/${chave === "calendario" ? ultimaVisao() : chave}`, class: chave === nome || r.inclui?.includes(nome) ? "ativo" : "" },
    el("span", { class: "menu-icone", "aria-hidden": "true" }, r.icone), r.titulo, r.selo ? el("small", { class: "menu-selo" }, r.selo) : null);
  const visiveis = Object.entries(rotas()).filter(([, r]) => liberada(r) && r.menu !== false);
  if (ehCliente()) return $("menu").replaceChildren(...visiveis.map(([chave, r]) => el("a", { href: `#/${chave}`, class: chave === nome ? "ativo" : "" },
    el("span", { class: "menu-icone", "aria-hidden": "true" }, r.icone), r.titulo)));
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

/** Volta para a última visão usada de Tarefas (calendário, quadro…). */
const ultimaVisao = () => { const v = estadoTela.calendario?.visao; return v && v !== "calendario" ? "tarefas" : "calendario"; };

/** Celular: atalhos fixos embaixo (Hoje, Tarefas, + Nova, Clientes e Financeiro ou Minha conta), com o "+" no meio. */
function montarNavMovel(nome) {
  const item = (rota, icone, titulo, ativo = rota === nome) => el("a", { href: `#/${rota}`, class: ativo ? "ativo" : "" }, el("span", { "aria-hidden": "true" }, icone), titulo);
  if (ehCliente()) return $("nav-movel").replaceChildren(
    item("inicio", "☀\uFE0E", "Início"), item("calendario", "▦\uFE0E", "Calendário"),
    el("button", { class: "nav-novo", onClick: () => portal.sugerirPost() }, el("span", { "aria-hidden": "true" }, "+"), "Sugerir"),
    item("marca", "◉\uFE0E", "Marca"), item("resultados", "↗\uFE0E", "Resultados"));
  $("nav-movel").replaceChildren(
    item("hoje", "☀\uFE0E", "Hoje"), item(ultimaVisao(), "✓\uFE0E", "Tarefas", ["tarefas", "calendario"].includes(nome)),
    el("button", { class: "nav-novo", onClick: () => abrirTarefa({ prazo: hojeISO() }) }, el("span", { "aria-hidden": "true" }, "+"), "Nova"),
    item("clientes", "◉\uFE0E", "Clientes"),
    pode("financeiro") ? item("financeiro", "$", "Financeiro") : item("conta", "☺\uFE0E", "Conta"));
}

function renderizar() {
  aplicarListas(dados.config.find((c) => c.id === "listas")); // menus configurados em Ajustes → Menus e listas
  const { nome, params } = rotaAtual();
  const r = rotas()[nome];
  document.body.classList.toggle("modo-cliente", ehCliente());
  montarMenu();
  montarNavMovel(nome);
  document.title = `${r.titulo} · Hyper Studio`;
  const area = $("conteudo");
  const rolagem = area.scrollTop;
  const foco = document.activeElement?.id && area.contains(document.activeElement) ? document.activeElement : null;
  const cursor = foco?.selectionStart;
  const chaveEstado = r.estado || nome;
  estadoTela[chaveEstado] ??= {};
  area.replaceChildren(faixaPendente(), r.view.render({ params, estado: estadoTela[chaveEstado], renderizar }));
  area.scrollTop = rolagem;
  if (foco) {
    const novo = document.getElementById(foco.id);
    if (novo) { novo.focus(); try { novo.setSelectionRange(cursor, cursor); } catch {} }
  }
}

definirTelas(() => Object.entries(rotas()).filter(([, r]) => liberada(r) && r.menu !== false)
  .map(([chave, r]) => ({ titulo: r.titulo, icone: r.icone, href: `#/${chave}` })));
ativarAtalhoBusca();

window.addEventListener("hashchange", () => { $("conteudo").scrollTop = 0; renderizar(); });

/** Manutenção feita pelo administrador quando os dados mudam (com folga, para não gravar a cada tecla). */
let esperaAdmin = null;
function tarefasDeAdmin() {
  clearTimeout(esperaAdmin);
  esperaAdmin = setTimeout(() => {
    sincronizarNomesClientes().catch((e) => console.warn("Nomes dos clientes:", e.message));
    sincronizarAdmins().catch((e) => console.warn("Admins no script de e-mail:", e.message));
  }, 3000);
}

/* ---------------- Registro de erros ---------------- */
quandoErro((msg) => registrarErro(msg, "aviso mostrado na tela"));
window.addEventListener("error", (e) => registrarErro(e.message || "Erro", `${e.filename || ""}:${e.lineno || ""} ${e.error?.stack || ""}`));
window.addEventListener("unhandledrejection", (e) => registrarErro(e.reason?.message || String(e.reason), e.reason?.stack || ""));

/* ---------------- App instalável (celular e computador) ---------------- */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker:", e.message));
}

/* ---------------- Login ---------------- */
$("btn-entrar").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { avisar("Não foi possível entrar: " + e.message, "erro"); }
});

/* ---------------- Menu do usuário (clique no nome) ---------------- */
function montarUsuario() {
  const meu = dados.membros.find((m) => m.id === eu.uid) || eu;
  const papel = ehAdmin() ? "Administrador" : ehCliente() ? "Cliente" : eu.permissoes?.length ? eu.permissoes.map((a) => AREAS.find(([v]) => v === a)?.[1]).join(", ") : "Acesso básico";
  $("btn-usuario").replaceChildren(avatar(meu), el("span", { class: "usuario-textos" }, el("strong", {}, meu.nome || eu.email), el("small", {}, papel)), el("span", { "aria-hidden": "true" }, "▴"));
}
function fecharMenuUsuario() { $("menu-usuario").hidden = true; $("btn-usuario").setAttribute("aria-expanded", "false"); }
$("btn-usuario").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = $("menu-usuario");
  menu.hidden = !menu.hidden;
  $("btn-usuario").setAttribute("aria-expanded", String(!menu.hidden));
});
document.addEventListener("click", (e) => { if (!$("menu-usuario").hidden && !$("menu-usuario").contains(e.target)) fecharMenuUsuario(); });
$("menu-usuario").addEventListener("click", (e) => { if (e.target.closest("a")) { fecharMenuUsuario(); document.body.classList.remove("menu-aberto"); } });
$("btn-sair").addEventListener("click", () => { fecharMenuUsuario(); signOut(auth); });

let pararDeOuvir = null;
let usuarioAtual = null;

/** Aviso para quem entrou e ainda está só com o acesso básico. */
function faixaPendente() {
  if (ehAdmin() || ehCliente() || eu.permissoes?.length) return "";
  return el("p", { class: "faixa-aviso faixa-topo" }, "Você está com o acesso básico (Hoje, Tarefas, compromissos e lista de clientes). Para mais áreas, fale com o administrador.");
}

function telaCheia(...filhos) {
  document.body.classList.remove("carregando");
  $("conteudo").replaceChildren(el("div", { class: "tela tela-estreita" }, ...filhos));
}

async function entrar(usuario) {
  const estado = await conectar(usuario, (e) => avisar("Erro ao carregar dados: " + e.message, "erro"));
  montarUsuario();

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
    el("p", {}, `Olá, ${eu.nome || usuario.email}! Seu pedido de acesso foi para os administradores da Hyper.`),
    eu.pedido ? el("p", { class: "subtitulo" }, "Você pediu: ", conta.descreverPedido(eu.pedido)) : null,
    el("p", { class: "subtitulo" }, "Esta tela atualiza sozinha quando um administrador liberar, e você também recebe um e-mail."),
    el("button", { class: "link", onClick: () => signOut(auth) }, "Sair"));

  if (estado === "sem-espaco") return telaCheia(
    el("h1", {}, "Espaço da Hyper ainda não criado"),
    el("p", {}, "O administrador (conta da Hyper) precisa entrar primeiro para criar o espaço. Depois disso, entre de novo com esta conta para pedir acesso."),
    el("button", { class: "secundario", onClick: () => signOut(auth) }, "Sair"));

  if (estado === "novo") {
    const nome = el("input", { id: "acesso-nome", type: "text", value: usuario.displayName || "", placeholder: "Seu nome" });
    const funcoes = el("div", { class: "multi" }, [...AREAS_EQUIPE.map(([v, r]) => [v, r]), ["admin", "Administração (tudo)"]].map(([v, r]) =>
      el("label", { class: "chip-check" }, el("input", { type: "checkbox", value: v }), r)));
    const clientes = el("textarea", { id: "acesso-clientes", rows: 2, placeholder: "Ex.: os nomes dos clientes com quem vai trabalhar. Deixe em branco se for trabalhar com todos." });
    const mensagem = el("textarea", { id: "acesso-mensagem", rows: 2, placeholder: "Ex.: sou a nova social media, começo segunda" });
    return telaCheia(
      el("h1", {}, "Bem-vindo ao Hyper Studio"),
      el("p", {}, `Você entrou como ${usuario.email}. Para usar o app, peça acesso: um administrador da Hyper aprova e você recebe um e-mail.`),
      el("label", { class: "campo", for: "acesso-nome" }, el("span", {}, "Seu nome"), nome),
      el("div", { class: "campo" }, el("span", {}, "O que você precisa acessar?"), funcoes),
      el("label", { class: "campo", for: "acesso-clientes" }, el("span", {}, "Com quais clientes você vai trabalhar?"), clientes),
      el("label", { class: "campo", for: "acesso-mensagem" }, el("span", {}, "Recado para o administrador (opcional)"), mensagem),
      el("div", { class: "acoes" },
        el("button", { class: "destaque", onClick: async (e) => {
          if (!nome.value.trim()) { avisar("Digite seu nome.", "erro"); return; }
          e.currentTarget.disabled = true;
          const marcadas = [...funcoes.querySelectorAll("input:checked")].map((i) => i.value);
          const pedido = { areas: marcadas.filter((a) => a !== "admin"), admin: marcadas.includes("admin"), clientesTexto: clientes.value.trim(), mensagem: mensagem.value.trim() };
          try {
            await pedirAcesso({ nome: nome.value.trim(), pedido });
            await avisarAdmins({ nome: nome.value.trim(), email: usuario.email, detalhe: `Primeiro acesso. ${conta.descreverPedido(pedido) || "Sem detalhes."}` });
            location.reload();
          } catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
        } }, "Pedir acesso"),
        el("button", { class: "link", onClick: () => signOut(auth) }, "Sair")));
  }

  document.body.classList.remove("carregando");
  pararDeOuvir = aoMudar(() => { montarUsuario(); renderizar(); if (ehAdmin()) tarefasDeAdmin(); if (!ehCliente()) acompanharRespostas(notificar); });
  if (!ehCliente()) acompanharRespostas(notificar);
  renderizar();
  if (espacoInfo.boasVindas) avisar("Bem-vindo! Seu acesso já estava liberado pelo convite.");
  // Foto do Google como foto inicial (dá para trocar em Minha conta)
  const meu = dados.membros.find((m) => m.id === eu.uid);
  if (meu && meu.foto === undefined && usuario.photoURL) atualizarMeuCadastro({ foto: usuario.photoURL }).catch(() => {});
  // Rotinas automáticas e ajustes de dados antigos: só o administrador roda
  if (ehAdmin()) {
    gerarRecorrencias().catch((e) => console.error("Recorrências:", e));
    marcarArtesComMarca().catch((e) => console.warn("Criativos:", e.message));
    reativarGruposSumidos().then(completarPostsSemFormato).then(migrarReunioes).then(migrarTipos).then(migrarFormatos).then(alinharStatusPosts).then(arquivarAntigas).then(limparAntigos).then(marcarCompromissosParaAgenda).then((n) => { if (n) sincronizarAgenda(); }).catch((e) => console.error("Migração:", e));
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
  $("btn-usuario").replaceChildren(el("span", { class: "usuario-textos" }, el("strong", {}, usuario.displayName || usuario.email)));
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
$("btn-busca-movel").addEventListener("click", abrirBusca);
$("menu").addEventListener("click", () => document.body.classList.remove("menu-aberto"));
