// Testes de tela: abrem o app com o Firebase em memória (testes/mocks) e passam pelas telas principais.
//   npm run test:telas
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const MOCKS = { "firebase-app.js": "firebase-app.js", "firebase-auth.js": "firebase-auth.js", "firebase-firestore.js": "firebase-firestore.js" };
const pasta = fileURLToPath(new URL("./mocks/", import.meta.url));

const hoje = new Date();
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dia = (n) => iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n));
const MES = dia(0).slice(0, 7);

// Banco de exemplo (dados fictícios). A conta logada (uid "hyper") é a dona do espaço.
const E = "espacos/hyper";
const BANCO = {
  [E.split("/")[0]]: { hyper: { dono: "hyper" } },
  [`${E}/clientes`]: {
    grupo: { nome: "Grupo Exemplo", ativo: true, paleta: ["#16626A"], cor: "#16626A", servicos: ["Social media"] },
    loja: { nome: "Loja Exemplo", ativo: true, paleta: ["#C98A00"], cor: "#C98A00", tomDeVoz: "Leve e direto" }
  },
  [`${E}/contratos`]: { grupo: { clienteId: "grupo", mensalidade: 2000, diaVencimento: 10 } },
  [`${E}/tarefas`]: {
    t1: { titulo: "Revisar campanhas", tipo: "Tráfego pago", clienteId: "grupo", status: "a_fazer", prazo: dia(0), checklist: [] },
    t2: { titulo: "Roteiro do reels", tipo: "Roteiro", clienteId: "loja", status: "andamento", prazo: dia(2), checklist: [] },
    p1: { titulo: "Promo da semana", tipo: "Conteúdo", clienteId: "loja", status: "concluido", statusConteudo: "ideia", formato: "Feed estático", rede: "Instagram", dataPublicacao: dia(1), prazo: dia(0), checklist: [] },
    velha: { titulo: "Entrega antiga", tipo: "Outro", clienteId: "grupo", status: "concluido", concluidoEm: dia(-200), prazo: dia(-200), checklist: [] }
  }
};

async function abrir(page, { usuario, membros, semMenu = false } = {}) {
  const erros = [];
  if (usuario) await page.addInitScript((u) => { window.__usuario = u; }, usuario);
  page.on("pageerror", (e) => erros.push(String(e)));
  await rotearMocks(page);
  return abrirDepois(page, { membros, semMenu, erros });
}

async function rotearMocks(page) {
  await page.route("**/*", (route) => {
    const nome = route.request().url().split("/").pop();
    if (MOCKS[nome] && route.request().url().includes("gstatic")) return route.fulfill({ path: pasta + MOCKS[nome], contentType: "application/javascript" });
    if (route.request().url().includes("fonts.g")) return route.abort();
    return route.continue();
  });
}

async function abrirDepois(page, { membros, semMenu, erros }) {
  const banco = membros ? { ...BANCO, [`${E}/membros`]: membros } : BANCO;
  await page.addInitScript((b) => { if (!localStorage.getItem("fake-fs-store")) localStorage.setItem("fake-fs-store", JSON.stringify(b)); }, banco);
  await page.goto("/");
  if (semMenu) await page.waitForTimeout(500);
  else await expect(page.locator("#menu")).toContainText("Hoje");
  return erros;
}

test("todas as telas abrem sem erro e o menu agrupa a administração", async ({ page }) => {
  const erros = await abrir(page);
  for (const rota of ["hoje", "tarefas", "calendario", "clientes", "trafego", "financeiro", "rotinas", "relatorios", "usuarios", "config"]) {
    await page.goto(`/#/${rota}`);
    await expect(page.locator("#conteudo h1").first()).toBeVisible();
  }
  await expect(page.locator(".menu-grupo summary")).toHaveText(/Administração/);
  await expect(page.locator("#menu > a")).toHaveCount(7);
  await expect(page.locator("#menu")).toContainText("Creators");
  for (const rota of ["lixeira", "creators"]) { await page.goto(`/#/${rota}`); await expect(page.locator("#conteudo h1").first()).toBeVisible(); }
  expect(erros).toEqual([]);
});

test("ajustes automáticos: tipos novos, status do post e arquivo", async ({ page }) => {
  await abrir(page);
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => window.__store);
  expect(s["espacos/hyper/tarefas"].t2.tipo).toBe("Vídeo / Roteiro");
  expect(s["espacos/hyper/tarefas"].p1.statusConteudo).toBe("publicado");
  expect(s["espacos/hyper/tarefas"].velha).toBeUndefined();
  expect(s["espacos/hyper/tarefasArquivo"].velha.titulo).toBe("Entrega antiga");
});

test("busca rápida com Ctrl+K", async ({ page }) => {
  await abrir(page);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("loja");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/clientes\/loja/);
});

test("ficha do cliente: editar só cadastro e contrato; marcas com identidade própria", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/clientes/grupo");
  await page.getByRole("button", { name: "Editar" }).click();
  const campos = await page.locator(".modal .campo > span").allTextContents();
  expect(campos).toContain("Mensalidade (R$)");
  expect(campos).not.toContain("Tom de voz da marca");
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Marca" }).click();
  await page.getByRole("button", { name: "+ Marca" }).click();
  await page.fill("#f-nome", "Marca Um");
  await page.click(".modal button[type=submit]");
  await page.locator(".marcas-seletor button", { hasText: "Marca Um" }).click();
  await page.fill("#marca-tomDeVoz", "Técnico e acolhedor");
  await page.locator(".campo-marca", { has: page.locator("#marca-tomDeVoz") }).getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/marcas"] || {}).find((m) => m.nome === "Marca Um")?.tomDeVoz)).toBe("Técnico e acolhedor");
});

test("juntar clientes como marcas", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/clientes/grupo");
  await page.getByRole("tab", { name: "Marca" }).click();
  await page.getByRole("button", { name: /Juntar outros clientes/ }).click();
  await page.check(".modal input[value=loja]");
  await page.locator(".modal").getByRole("button", { name: "Juntar" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/marcas"]?.["m-loja"]?.tomDeVoz)).toBe("Leve e direto");
  const s = await page.evaluate(() => window.__store);
  expect(s["espacos/hyper/clientes"].loja.ativo).toBe(false);
  expect(s["espacos/hyper/tarefas"].p1).toMatchObject({ clienteId: "grupo", marcaId: "m-loja" });
});

test("post com marca, status único, planejar no calendário e criar dentro do post", async ({ page }) => {
  await abrir(page);
  await page.evaluate(async () => { const db = await import("/js/db.js"); await db.salvarComId("marcas", "mx", { nome: "Marca X", clienteId: "grupo", ativo: true, paleta: ["#B4415A"] }); });
  await page.goto("/#/calendario/grupo");
  await page.getByRole("button", { name: "+ Novo post" }).click();
  await page.fill("#f-titulo", "Post da marca X");
  await page.selectOption("#f-marcaId", { label: "Marca X" });
  await page.selectOption("#f-statusConteudo", "aprovacao");
  await expect(page.locator("#f-status")).toBeHidden();
  await page.click(".modal button[type=submit]");
  const post = await page.evaluate(() => Object.entries(window.__store["espacos/hyper/tarefas"]).find(([, t]) => t.titulo === "Post da marca X"));
  expect(post[1]).toMatchObject({ marcaId: "mx", statusConteudo: "aprovacao", status: "andamento" });

  const prompt = await page.evaluate(async (id) => { const p = await import("/js/prompts.js"); const db = await import("/js/db.js"); return p.promptCopy(db.porId("tarefas", id)); }, post[0]);
  expect(prompt).toContain("marca Marca X, do cliente Grupo Exemplo");

  await page.getByRole("tab", { name: "Planejar mês" }).click();
  await expect(page).toHaveURL(new RegExp(`#/calendario/grupo/${MES}/planejar`));
  await expect(page.locator("#conteudo h1")).toContainText("Planejamento");

  await page.goto(`/#/criar/${post[0]}`);
  await expect(page.locator(".criar-modal")).toBeVisible();
  await expect(page.locator(".criar-modal")).toContainText("Marca X");
});

test("cobrança: concluir marca a mensalidade como paga e o desfazer volta", async ({ page }) => {
  await abrir(page);
  const id = `rec-r1-${MES}-10`;
  await page.evaluate(async ({ id, mes }) => {
    const r = await import("/js/recorrencias.js");
    const db = await import("/js/db.js");
    await r.garantirMensalidade("grupo", mes);
    await db.salvarComId("tarefas", id, { titulo: "Cobrar", tipo: "Financeiro / Comercial", clienteId: "grupo", prazo: `${mes}-10`, status: "a_fazer", rotina: "cobranca", lancamentoId: `mens-grupo-${mes}`, checklist: [] });
  }, { id, mes: MES });
  await page.goto("/#/tarefas");
  await page.evaluate(async (id) => { const c = await import("/js/views/componentes.js"); const db = await import("/js/db.js"); await c.alternarConcluida(db.porId("tarefas", id)); }, id);
  await expect.poll(() => page.evaluate((mes) => window.__store["espacos/hyper/financeiro"][`mens-grupo-${mes}`].status, MES)).toBe("pago");
  await page.locator(".aviso .desfazer").click();
  await expect.poll(() => page.evaluate((mes) => window.__store["espacos/hyper/financeiro"][`mens-grupo-${mes}`].status, MES)).toBe("pendente");
  await expect.poll(() => page.evaluate((id) => window.__store["espacos/hyper/tarefas"][id].status, id)).toBe("a_fazer");
});

test("usuário básico não vê valores nem a administração", async ({ page }) => {
  const erros = await abrir(page, {
    usuario: { uid: "bia", displayName: "Bia", email: "bia@x.com" },
    membros: { bia: { nome: "Bia", papel: "basico", permissoes: [], status: "ativo" } }
  });
  await expect(page.locator("#menu")).not.toContainText("Administração");
  await expect(page.locator("#menu")).not.toContainText("Financeiro");
  await page.goto("/#/clientes");
  await expect(page.locator("#conteudo h1")).toHaveText("Clientes");
  await expect(page.locator("#conteudo")).not.toContainText("R$");
  expect(erros).toEqual([]);
});

test("menu do usuário: Minha conta com nome, acesso e conexões", async ({ page }) => {
  await abrir(page);
  await page.locator("#btn-usuario").click();
  await page.locator("#menu-usuario").getByText("Minha conta").click();
  await expect(page.locator("#conteudo h1")).toHaveText("Minha conta");
  await expect(page.locator("#conteudo")).toContainText("Google Agenda");
  await page.fill("#conta-nome", "Hyper Agência");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/membros"]?.hyper?.nome)).toBe("Hyper Agência");
  await expect(page.locator("#btn-usuario")).toContainText("Hyper Agência");
  await page.fill("#conta-email-agenda", "Pessoal@iCloud.com");
  await page.getByRole("button", { name: "Salvar e-mail da agenda" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/membros"]?.hyper?.emailAgenda)).toBe("pessoal@icloud.com");
});

test("administrador adiciona usuário por e-mail e ele entra já liberado, só com os clientes escolhidos", async ({ browser }) => {
  const admin = await browser.newPage();
  await abrir(admin, { membros: { hyper: { nome: "Hyper", email: "hyperestrategiadigital@gmail.com", papel: "admin", permissoes: ["conteudo", "trafego", "financeiro"], status: "ativo" } } });
  await admin.goto("/#/usuarios");
  await admin.getByRole("button", { name: "+ Adicionar usuário" }).click();
  await admin.fill("#f-nome", "Luísa");
  await admin.fill("#f-email", "Luisa@Exemplo.com");
  await admin.locator(".modal .chip-check", { hasText: "Conteúdo" }).locator("input").check();
  await admin.locator(".modal select[aria-label=Clientes]").selectOption("alguns");
  await admin.locator(".modal .lista-clientes-acesso .chip-check", { hasText: "Loja Exemplo" }).locator("input").check();
  await admin.click(".modal button[type=submit]");
  await expect(admin.locator("#conteudo")).toContainText("Convites aguardando");
  const banco = await admin.evaluate(() => localStorage.getItem("fake-fs-store"));
  expect(JSON.parse(banco)["espacos/hyper/convites"]["luisa@exemplo.com"]).toMatchObject({ permissoes: ["conteudo"], acessoClientes: "alguns", clientes: ["loja"] });

  // A Luísa entra pela primeira vez (outro navegador, mesmo banco)
  const ctx = await browser.newContext();
  const luisa = await ctx.newPage();
  await luisa.addInitScript((b) => localStorage.setItem("fake-fs-store", b), banco);
  await abrir(luisa, { usuario: { uid: "luisa", displayName: "Luísa", email: "luisa@exemplo.com" } });
  await expect(luisa.locator(".aviso")).toContainText("Bem-vindo");
  const s = await luisa.evaluate(() => window.__store);
  expect(s["espacos/hyper/membros"].luisa).toMatchObject({ status: "ativo", acessoClientes: "alguns", clientes: ["loja"] });
  expect(s["espacos/hyper/convites"]["luisa@exemplo.com"]).toBeUndefined();
  await luisa.goto("/#/clientes");
  await expect(luisa.locator("#conteudo")).toContainText("Loja Exemplo");
  await expect(luisa.locator("#conteudo")).not.toContainText("Grupo Exemplo");
  await luisa.goto("/#/tarefas");
  await expect(luisa.locator("#conteudo")).not.toContainText("Revisar campanhas");
  await ctx.close();
});

test("primeiro acesso sem convite: pede acesso e o administrador libera", async ({ browser }) => {
  const ctx = await browser.newContext();
  const novo = await ctx.newPage();
  await abrir(novo, { usuario: { uid: "matheus", displayName: "Matheus", email: "matheus@exemplo.com" }, semMenu: true });
  await expect(novo.locator("#conteudo h1")).toContainText("Bem-vindo à Hyper");
  await novo.locator(".chip-check", { hasText: "Administração" }).locator("input").check();
  await novo.fill("#acesso-clientes", "todos");
  await novo.getByRole("button", { name: "Pedir acesso" }).click();
  await expect(novo.locator("#conteudo h1")).toContainText("Pedido enviado");
  const banco = await novo.evaluate(() => localStorage.getItem("fake-fs-store"));
  expect(JSON.parse(banco)["espacos/hyper/membros"].matheus).toMatchObject({ status: "pendente", pedido: { admin: true } });
  await ctx.close();

  const ctx2 = await browser.newContext();
  const admin = await ctx2.newPage();
  await admin.addInitScript((b) => localStorage.setItem("fake-fs-store", b), banco);
  await abrir(admin);
  await admin.goto("/#/usuarios");
  const cartao = admin.locator(".cartao-membro", { hasText: "Matheus" });
  await expect(cartao).toContainText("Aguardando liberação");
  await cartao.locator(".destaque-admin input").check();
  await cartao.getByRole("button", { name: "Liberar acesso" }).click();
  await expect.poll(() => admin.evaluate(() => window.__store["espacos/hyper/membros"].matheus)).toMatchObject({ status: "ativo", papel: "admin", pedido: null });
  await ctx2.close();
});

test("Hoje pessoal, primeiros passos e carga da equipe", async ({ page }) => {
  const erros = await abrir(page);
  await expect(page.getByRole("tab", { name: "Minhas" })).toBeVisible();
  await page.getByRole("tab", { name: "Equipe" }).click();
  await expect(page.locator("#conteudo")).toContainText("Revisar campanhas");
  await expect(page.locator(".primeiros-passos")).toContainText("Primeiros passos");
  await page.goto("/#/tarefas");
  await page.getByRole("tab", { name: "Carga da equipe" }).click();
  await expect(page.locator(".tabela-carga")).toBeVisible();
  expect(erros).toEqual([]);
});

test("excluir vai para a lixeira e o administrador restaura", async ({ page }) => {
  await abrir(page);
  await page.evaluate(async () => { const db = await import("/js/db.js"); await db.excluir("tarefas", "t1"); });
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/lixeira"]?.["tarefas__t1"]?.titulo)).toBe("Revisar campanhas");
  await page.goto("/#/lixeira");
  await page.locator(".linha-tabela", { hasText: "Revisar campanhas" }).getByRole("button", { name: "Restaurar" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].t1?.titulo)).toBe("Revisar campanhas");
});

test("comentário com @menção e histórico na tarefa", async ({ page }) => {
  await abrir(page, { membros: {
    hyper: { nome: "Hyper", email: "hyper@x.com", papel: "admin", permissoes: [], status: "ativo" },
    bia: { nome: "Bia Souza", email: "bia@x.com", papel: "basico", permissoes: [], status: "ativo" } } });
  await page.evaluate(async () => { const c = await import("/js/views/componentes.js"); const db = await import("/js/db.js"); c.abrirTarefa(db.porId("tarefas", "t1")); });
  await page.locator(".secao-atividade textarea").fill("Pode revisar, @Bia?");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator(".comentario")).toContainText("Pode revisar, @Bia?");
  const ativ = await page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas/t1/atividade"] || {}));
  expect(ativ[0]).toMatchObject({ tipo: "comentario", mencoes: ["Bia Souza"] });
  await page.fill("#f-prazo", "2030-01-10");
  await page.click(".modal button[type=submit]");
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas/t1/atividade"]).some((a) => a.tipo === "mudanca" && a.texto.includes("prazo")))).toBe(true);
});

test("aprovação do cliente por link: o cliente aprova e o post muda de etapa", async ({ page, context }) => {
  await abrir(page);
  await page.evaluate(async () => { const db = await import("/js/db.js"); await db.salvarComId("tarefas", "p2", { titulo: "Post para aprovar", tipo: "Conteúdo", clienteId: "grupo", formato: "Reels", rede: "Instagram", dataPublicacao: new Date().toISOString().slice(0, 10), statusConteudo: "producao", status: "andamento", checklist: [] }); });
  await page.evaluate(async () => { const a = await import("/js/aprovacoes.js"); await a.gerarLinkAprovacao("grupo", new Date().toISOString().slice(0, 7)); });
  const link = await page.locator(".modal input[readonly]").inputValue();
  expect(link).toMatch(/aprovar\.html\?t=[a-f0-9]{32}$/);
  const cliente = await context.newPage();
  await rotearMocks(cliente);
  await cliente.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(cliente.locator("article.aprov-post", { hasText: "Post para aprovar" })).toBeVisible();
  await cliente.fill("#aprov-nome", "Dona do Grupo");
  await cliente.locator("article.aprov-post", { hasText: "Post para aprovar" }).getByRole("button", { name: "Aprovar" }).click();
  await expect(cliente.locator("article.aprov-post", { hasText: "Post para aprovar" })).toContainText("Aprovado");
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].p2.statusConteudo), { timeout: 10000 }).toBe("aprovado");
});

test("resultados sem a Meta ligada mostram o caminho", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/clientes/grupo");
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(page.locator("#conteudo")).toContainText("ainda não foram ligados");
});

test("importar planejamento: cria marcas e posts sem duplicar", async ({ page }) => {
  await abrir(page);
  const plano = { tipo: "planejamento-hyper", cliente: "Grupo Exemplo", marcas: [{ nome: "Marca Azul", cor: "#2D6CDF" }], posts: [
    { data: "2030-03-04", marca: "Marca Azul", formato: "Carrossel", rede: "Instagram", titulo: "Tema A", prazo: "2030-03-01" },
    { data: "2030-03-05", marca: "", formato: "Artigo", rede: "LinkedIn", titulo: "Tema B (Autor)", prazo: "2030-03-01" },
    { data: "2030-03-06", marca: "", formato: "E-mail marketing", rede: "E-mail", titulo: "Newsletter", prazo: "2030-03-01" }] };
  const arquivo = { name: "plano.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(plano)) };
  for (let vez = 0; vez < 2; vez++) {
    await page.goto("/#/config");
    await page.getByRole("button", { name: "Importar planejamento (.json)" }).click();
    await page.setInputFiles(".modal input[type=file]", arquivo);
    await expect(page.locator(".modal #imp-cliente")).toHaveValue("grupo");
    await page.locator(".modal").getByRole("button", { name: "Importar planejamento" }).click();
    await expect(page).toHaveURL(/#\/calendario\/grupo\/2030-03/);
  }
  const s = await page.evaluate(() => window.__store);
  const posts = Object.values(s["espacos/hyper/tarefas"]).filter((t) => t.origem === "importacao-planejamento");
  expect(posts).toHaveLength(3);
  const marca = Object.values(s["espacos/hyper/marcas"]).find((m) => m.nome === "Marca Azul");
  expect(posts.find((t) => t.titulo === "Tema A")).toMatchObject({ marcaId: expect.any(String), formato: "Carrossel", statusConteudo: "ideia", prazo: "2030-03-01" });
  expect(posts.find((t) => t.titulo === "Tema A").checklist.length).toBeGreaterThan(0);
  expect(marca.paleta).toEqual(["#2D6CDF"]);
});

test("organizar grupos: cliente separado vira marca e posts soltos vão para a principal", async ({ page }) => {
  await abrir(page);
  const estrutura = { tipo: "estrutura-hyper", grupos: [{ cliente: "Grupo Exemplo", moverPostsSemMarca: true, marcas: [
    { nome: "Exemplo Principal", principal: true, cor: "#14A37F" }, { nome: "Loja Exemplo", juntarCliente: ["Loja Exemplo"] }, { nome: "Nova Marca" }] }] };
  await page.goto("/#/config");
  await page.getByRole("button", { name: "Organizar grupos (.json)" }).click();
  await page.setInputFiles(".modal input[type=file]", { name: "g.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(estrutura)) });
  await expect(page.locator(".modal")).toContainText('o cliente "Loja Exemplo" vira esta marca');
  await page.locator(".modal").getByRole("button", { name: "Organizar" }).click();
  await expect(page).toHaveURL(/#\/clientes\/grupo/);
  const s = await page.evaluate(() => window.__store);
  const marcas = Object.values(s["espacos/hyper/marcas"]).filter((m) => m.clienteId === "grupo").map((m) => m.nome).sort();
  expect(marcas).toEqual(["Exemplo Principal", "Loja Exemplo", "Nova Marca"]);
  expect(s["espacos/hyper/clientes"].loja.ativo).toBe(false);
  await page.getByRole("tab", { name: "Marca" }).click();
  await expect(page.locator(".marcas-seletor")).toContainText("Grupo Exemplo (institucional)");
  await expect(page.locator(".marca-cabeca h3")).toHaveText("Grupo Exemplo · Exemplo Principal");
});
