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
    p1: { titulo: "Promo da semana", tipo: "Conteúdo", clienteId: "loja", status: "concluido", statusConteudo: "ideia", formato: "Estático", rede: "Instagram", dataPublicacao: dia(1), prazo: dia(0), checklist: [] },
    velha: { titulo: "Entrega antiga", tipo: "Outro", clienteId: "grupo", status: "concluido", concluidoEm: dia(-200), prazo: dia(-200), checklist: [] }
  }
};

async function abrir(page, { usuario, membros, semMenu = false, extra = null } = {}) {
  const erros = [];
  if (usuario) await page.addInitScript((u) => { window.__usuario = u; }, usuario);
  page.on("pageerror", (e) => erros.push(String(e)));
  await rotearMocks(page);
  return abrirDepois(page, { membros, semMenu, erros, extra });
}

async function rotearMocks(page) {
  await page.route("**/*", (route) => {
    const nome = route.request().url().split("/").pop();
    if (MOCKS[nome] && route.request().url().includes("gstatic")) return route.fulfill({ path: pasta + MOCKS[nome], contentType: "application/javascript" });
    if (route.request().url().includes("fonts.g")) return route.abort();
    return route.continue();
  });
}

async function abrirDepois(page, { membros, semMenu, erros, extra = null }) {
  const banco = { ...BANCO, ...(membros ? { [`${E}/membros`]: membros } : {}) };
  // extra: coleções a mais ou a juntar (ex.: { tarefas: {...} })
  for (const [col, docs] of Object.entries(extra || {})) banco[`${E}/${col}`] = { ...(banco[`${E}/${col}`] || {}), ...docs };
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
  await expect(page.locator("#menu > a")).toHaveCount(5); // Tarefas e Calendário são um item só
  await expect(page.locator("#menu")).not.toContainText("Studio");
  for (const rota of ["lixeira"]) { await page.goto(`/#/${rota}`); await expect(page.locator("#conteudo h1").first()).toBeVisible(); }
  expect(erros).toEqual([]);
});

test("ajustes automáticos: tipos novos, status do post e arquivo", async ({ page }) => {
  await abrir(page);
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => window.__store);
  expect(s["espacos/hyper/tarefas"].t2.tipo).toBe("Produção");
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

test("ficha do cliente: cadastro na aba Marca, contrato na janela; marcas com identidade própria", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/clientes/grupo");
  await expect(page.locator(".ficha-topo").getByRole("button", { name: /^Editar/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Marca" }).click();
  await page.fill("#cadastro-segmento", "Varejo de teste");
  await page.locator(".cadastro-cliente").getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/clientes"].grupo.segmento)).toBe("Varejo de teste");
  await page.getByRole("button", { name: "Contrato, status e excluir…" }).click();
  const campos = await page.locator(".modal .campo > span").allTextContents();
  expect(campos).toContain("Mensalidade (R$)");
  expect(campos).not.toContain("Tom de voz da marca");
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Marca" }).click();
  await page.getByRole("button", { name: "+ Marca" }).click();
  await page.fill("#f-nome", "Marca Um");
  await page.click(".modal button[type=submit]");
  // virou grupo: a ficha abre direto na marca nova
  await expect(page).toHaveURL(/#\/clientes\/grupo\/marca\//);
  await expect(page.locator("#conteudo h1")).toHaveText("Marca Um");
  await page.getByRole("tab", { name: "Marca" }).click();
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

test("post com marca, status único, planejar no calendário e sem geração de imagem", async ({ page }) => {
  await abrir(page);
  await page.evaluate(async () => { const db = await import("/js/db.js"); await db.salvarComId("marcas", "mx", { nome: "Marca X", clienteId: "grupo", ativo: true, paleta: ["#B4415A"] }); });
  await page.goto("/#/calendario/grupo");
  await page.getByRole("button", { name: /\+ Novo/ }).click();
  await page.getByRole("menuitem", { name: /Post/ }).click();
  await page.fill("#f-titulo", "Post da marca X");
  await page.selectOption("#f-marcaId", { label: "Marca X" });
  await page.locator("#f-statusConteudo").getByRole("radio", { name: "Em aprovação" }).click();
  await expect(page.locator("#f-statusConteudo .escolha.ativo")).toHaveText("Em aprovação");
  await expect(page.locator("#f-status")).toBeHidden();
  await page.click(".modal button[type=submit]");
  const post = await page.evaluate(() => Object.entries(window.__store["espacos/hyper/tarefas"]).find(([, t]) => t.titulo === "Post da marca X"));
  expect(post[1]).toMatchObject({ marcaId: "mx", statusConteudo: "aprovacao", status: "andamento" });

  const prompt = await page.evaluate(async (id) => { const ia = await import("/js/ia.js"); const db = await import("/js/db.js"); const t = db.porId("tarefas", id); return ia.montarPedido("copy", { clienteId: t.clienteId, marcaId: t.marcaId, post: t }); }, post[0]);
  expect(prompt).toContain("Nome: Marca X (do grupo Grupo Exemplo)");

  await page.getByRole("button", { name: /Ações do mês/ }).click();
  await page.getByRole("menuitem", { name: /Planejar mês/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/calendario/grupo/${MES}/planejar`));
  await expect(page.locator("#conteudo h1")).toContainText("Planejamento");

  // O Criar (imagem + Canva) e o Studio saíram: os endereços antigos só levam ao calendário
  for (const antigo of [`/#/criar/${post[0]}`, "/#/studio"]) {
    await page.goto(antigo);
    await expect(page).toHaveURL(/#\/calendario/);
  }
  await expect(page.locator(".criar-modal")).toHaveCount(0);
  await page.evaluate(async (id) => { const c = await import("/js/views/componentes.js"); const db = await import("/js/db.js"); c.abrirTarefa(db.porId("tarefas", id)); }, post[0]);
  await expect(page.locator(".modal").last()).toContainText("Anexar criativo final");
  await expect(page.locator(".modal").last()).not.toContainText("Criar arte");
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
  await admin.locator(".modal .lista-clientes-acesso:visible .chip-check", { hasText: "Loja Exemplo" }).locator("input").check();
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
  await expect(novo.locator("#conteudo h1")).toContainText("Bem-vindo ao Hyper Studio");
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
  await cartao.locator(".tipo-acesso label", { hasText: "Administrador" }).locator("input").check();
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
  await page.getByRole("tab", { name: "☺ Equipe" }).click();
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
  await page.evaluate(async () => { const db = await import("/js/db.js"); await db.salvarComId("tarefas", "p2", { titulo: "Post para aprovar", tipo: "Conteúdo", clienteId: "grupo", formato: "Vídeo", rede: "Instagram", dataPublicacao: new Date().toISOString().slice(0, 10), statusConteudo: "producao", status: "andamento", checklist: [] }); });
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

test("juntar cliente solto numa marca de mesmo nome não duplica a marca", async ({ page }) => {
  await abrir(page);
  await page.evaluate(async () => { const db = await import("/js/db.js"); await db.salvarComId("marcas", "m-loja-ja", { clienteId: "grupo", nome: "Loja Exemplo", ativo: true, paleta: [] }); });
  await page.goto("/#/clientes/grupo");
  await page.getByRole("button", { name: /Juntar outros clientes/ }).click();
  await page.check(".modal input[value=loja]");
  await page.locator(".modal").getByRole("button", { name: "Juntar" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/clientes"].loja.ativo)).toBe(false);
  const s = await page.evaluate(() => window.__store);
  expect(Object.values(s["espacos/hyper/marcas"]).filter((m) => m.nome === "Loja Exemplo")).toHaveLength(1);
  expect(s["espacos/hyper/marcas"]["m-loja-ja"].tomDeVoz).toBe("Leve e direto");
  expect(s["espacos/hyper/tarefas"].p1.marcaId).toBe("m-loja-ja");
});

test("tarefas e calendário são uma tela só: tarefas aparecem no calendário e as visões trocam", async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 900 });
  const erros = await abrir(page);
  await expect(page.locator("#menu > a", { hasText: "Tarefas" })).toHaveCount(1);
  await page.goto("/#/calendario");
  await expect(page.getByRole("tab", { name: "▦ Calendário" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".chip-tarefa", { hasText: "Revisar campanhas" })).toBeVisible();
  await page.getByRole("tab", { name: "☰ Lista" }).click();
  await expect(page).toHaveURL(/#\/tarefas$/);
  await expect(page.getByRole("tab", { name: "☰ Lista" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#menu a.ativo")).toHaveText(/Tarefas/);
  await page.getByRole("tab", { name: "▦ Calendário" }).click();
  await expect(page).toHaveURL(/#\/calendario$/);
  expect(erros).toEqual([]);
});

test("separar uma marca do grupo devolve o cliente com os posts dele", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/clientes/grupo");
  await page.getByRole("tab", { name: "Marca" }).click();
  await page.getByRole("button", { name: /Juntar outros clientes/ }).click();
  await page.check(".modal input[value=loja]");
  await page.locator(".modal").getByRole("button", { name: "Juntar" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].p1.marcaId)).toBe("m-loja");
  await page.locator(".cartao-marca", { hasText: "Loja Exemplo" }).click();
  await page.getByRole("tab", { name: "Marca" }).click();
  await page.getByRole("button", { name: "Separar em cliente próprio…" }).click();
  await page.locator(".modal").getByRole("button", { name: "Confirmar" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/clientes"].loja.ativo)).toBe(true);
  const s = await page.evaluate(() => window.__store);
  expect(s["espacos/hyper/tarefas"].p1).toMatchObject({ clienteId: "loja", marcaId: "" });
  expect(s["espacos/hyper/tarefas"].t2.clienteId).toBe("loja");
  expect(s["espacos/hyper/marcas"]?.["m-loja"]).toBeUndefined();
  expect(s["espacos/hyper/clientes"].loja.tomDeVoz).toBe("Leve e direto");
});

test("passar tarefas para uma pessoa e responsável padrão sem a conta da Hyper", async ({ page }) => {
  await abrir(page, { membros: {
    hyper: { nome: "Hyper Estratégia Digital", email: "hyper@exemplo.com", papel: "admin", status: "ativo" },
    ana: { nome: "Ana", email: "ana@exemplo.com", papel: "basico", status: "ativo", permissoes: ["conteudo"] }
  } });
  await page.goto("/#/usuarios");
  await page.selectOption("#passar-de", "*");
  await expect(page.locator("#passar-para option")).toHaveText(["Ana"]);
  await page.getByRole("button", { name: "Passar tarefas" }).click();
  await page.locator(".modal").getByRole("button", { name: "Confirmar" }).click();
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas"]).every((t) => t.responsavel === "Ana"))).toBe(true);
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefasArquivo"] || {}).every((t) => t.responsavel === "Ana" && !("arquivada" in t)))).toBe(true);
});

test("financeiro: mensalidade do mês entra sozinha e a aba Contratos mostra quanto cada cliente paga", async ({ page }) => {
  const erros = await abrir(page);
  await page.goto("/#/financeiro");
  await expect.poll(() => page.evaluate((m) => window.__store["espacos/hyper/financeiro"]?.[`mens-grupo-${m}`]?.valor, MES)).toBe(2000);
  await page.getByRole("tab", { name: "Contratos" }).click();
  await expect(page.locator("#conteudo")).toContainText("Grupo Exemplo");
  await expect(page.locator("#conteudo")).toContainText("Sem valor de contrato (1)");
  expect(erros).toEqual([]);
});


test("valores por extenso e dia útil", async ({ page }) => {
  await abrir(page);
  const r = await page.evaluate(async () => {
    const c = await import("/js/comercial.js");
    return [c.valorExtenso(800), c.valorExtenso(1221), c.valorExtenso(2310), c.valorExtenso(1200), c.valorExtenso(100), c.valorExtenso(1234.5), c.valorExtenso(1000000), c.valorExtenso(439.5), c.diaUtil("2026-12", 5)];
  });
  expect(r).toEqual(["oitocentos reais", "mil duzentos e vinte e um reais", "dois mil trezentos e dez reais", "mil e duzentos reais", "cem reais",
    "mil duzentos e trinta e quatro reais e cinquenta centavos", "um milhão de reais", "quatrocentos e trinta e nove reais e cinquenta centavos", "2026-12-07"]);
});

test("contrato: o administrador gera o contrato do cliente e os dados ficam guardados", async ({ page }) => {
  const erros = await abrir(page);
  await page.evaluate(async () => { const db = await import("/js/db.js"); await db.salvarComId("config", "comercial", { contratada: { nome: "Fulano de Tal", documento: "CNPJ 00.000.000/0001-00", cidade: "Cidade/SP", foro: "Cidade/SP" } }); });
  await page.goto("/#/financeiro/contratos");
  await page.locator(".linha-tabela", { hasText: "Grupo Exemplo" }).getByRole("button", { name: /contrato/i }).click();
  await page.fill("#f-contratante", "Empresa Exemplo LTDA");
  await page.fill("#f-documento", "CNPJ 11.111.111/0001-11");
  await page.locator(".chip-check", { hasText: "Gestão de tráfego pago" }).locator("input").check();
  await page.getByRole("button", { name: "Ver contrato" }).click();
  const texto = (await page.locator(".previa-contrato").inputValue()).replace(/\u00a0/g, " ");
  expect(texto).toContain("CONTRATANTE EMPRESA EXEMPLO LTDA, registrada sob o CNPJ 11.111.111/0001-11");
  expect(texto).toContain("CONTRATADA FULANO DE TAL");
  expect(texto).toContain("R$ 2.000,00 (dois mil reais)");
  expect(texto).toContain("(a) Manutenção e organização");
  expect(texto).toContain("5º - O valor destinado aos anúncios");
  expect(texto).toContain("foro da cidade de Cidade/SP");
  const k = await page.evaluate(() => window.__store["espacos/hyper/contratos"].grupo);
  expect(k.dadosContrato).toMatchObject({ contratante: "Empresa Exemplo LTDA" });
  expect(erros).toEqual([]);
});

test("orçamento: monta com os serviços do catálogo e calcula o total com desconto", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/financeiro/orcamentos");
  await page.getByRole("button", { name: "+ Orçamento" }).click();
  await page.locator(".modal input[placeholder='Nome da empresa ou pessoa']").fill("Padaria Exemplo");
  await page.locator(".item-orcamento input[aria-label='Preço (R$)']").fill("1000");
  await page.locator(".modal label", { hasText: "Desconto sobre a tabela (%)" }).locator("input").fill("10");
  await expect(page.locator(".totais-orcamento")).toContainText("900,00/mês");
  await page.locator(".modal").getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/orcamentos"] || {})[0]?.valorMensal)).toBe(900);
  const o = await page.evaluate(() => Object.values(window.__store["espacos/hyper/orcamentos"])[0]);
  expect(o).toMatchObject({ para: "Padaria Exemplo", desconto: 10, recorrente: true });
  expect(o.itens[0].nome).toContain("tráfego");
});

test("contrato puxa o preço da tabela dos serviços e aplica o desconto", async ({ page }) => {
  await abrir(page);
  await page.evaluate(async () => {
    const db = await import("/js/db.js");
    const c = await import("/js/comercial.js");
    await db.salvarComId("config", "comercial", { servicos: c.SERVICOS_PADRAO.map((s) => ({ ...s, preco: s.id === "trafego" ? 800 : s.id === "landing" ? 1200 : 0 })) });
    (await import("/js/views/comercial.js")).abrirGeradorContrato("loja");
  });
  await page.locator(".chip-check", { hasText: "Gestão de tráfego pago" }).locator("input").check();
  await expect(page.locator("#f-mensalidade")).toHaveValue("800");
  await page.locator(".chip-check", { hasText: "Criação de landing page" }).locator("input").check();
  await expect(page.locator("#f-valorUnico")).toHaveValue("1200");
  await page.fill("#f-desconto", "10");
  await expect(page.locator("#f-mensalidade")).toHaveValue("720");
  await expect(page.locator("#f-valorUnico")).toHaveValue("1080");
  await page.fill("#f-mensalidade", "700");
  await expect(page.locator(".tabela-precos")).toContainText("12,5% de desconto");
  await page.fill("#f-contratante", "Loja Exemplo LTDA");
  await page.getByRole("button", { name: "Ver contrato" }).click();
  const texto = (await page.locator(".previa-contrato").inputValue()).replace(/ /g, " ");
  expect(texto).toContain("R$ 700,00 (setecentos reais)");
  expect(texto).toContain("R$ 1.080,00 (mil e oitenta reais)");
  expect(await page.evaluate(() => window.__store["espacos/hyper/contratos"].loja.mensalidade)).toBe(700);
});


test("proposta: condições de pagamento e escopo no formato da Hyper", async ({ page }) => {
  await abrir(page);
  const r = await page.evaluate(async () => {
    const c = await import("/js/comercial.js");
    const o = { para: "Academia Exemplo", titulo: "Aniversário", parcelas: 2, descontoAvista: 5,
      itens: [{ nome: "Criação gráfica", preco: 750, qtd: 1, tipo: "unico", detalhes: ["Carrosséis", "Convites"], nota: "Um total de 14 criativos." },
        { nome: "Produção de 2 vídeos", preco: 250, qtd: 2, tipo: "unico", detalhes: [] }] };
    return { pag: c.textoPagamento(o), html: await c.documentoOrcamento(o) };
  });
  expect(r.pag.replace(/ /g, " ")).toBe("Pagamento em 2x de R$ 625,00 ou desconto de 5% para pagamento à vista (R$ 1.187,50)!");
  expect(r.html).toContain("1. CRIAÇÃO GRÁFICA");
  expect(r.html).toContain("<li>Convites</li>");
  expect(r.html).toContain("Um total de 14 criativos.");
  expect(r.html.replace(/ /g, " ")).toContain("Valor total do projeto: R$ 1.250,00");
});


test("confirmar é verde e cancelar é vermelho", async ({ page }) => {
  await abrir(page);
  await page.evaluate(async () => { (await import("/js/ui.js")).confirmar("Tudo certo?"); });
  const cor = (nome) => page.locator(".modal").getByRole("button", { name: nome, exact: true }).evaluate((b) => getComputedStyle(b).backgroundColor);
  expect(await cor("Confirmar")).toBe("rgb(30, 142, 78)");
  expect(await page.locator(".modal").getByRole("button", { name: "Cancelar" }).evaluate((b) => getComputedStyle(b).color)).toBe("rgb(179, 38, 30)");
});



test("celular: barra de baixo com 5 atalhos e o + no meio", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  const itens = page.locator("#nav-movel > *");
  await expect(itens).toHaveCount(5);
  await expect(itens.nth(2)).toHaveClass(/nav-novo/);
  const caixa = await itens.nth(2).boundingBox();
  expect(Math.abs(caixa.x + caixa.width / 2 - 195)).toBeLessThan(6);
  await page.goto("/#/financeiro");
  for (const n of await page.locator(".numero strong").all()) expect(await n.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
});

test("status da tarefa em botões", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/tarefas");
  await page.getByRole("button", { name: /\+ Novo/ }).click();
  await page.getByRole("menuitem", { name: /Tarefa/ }).click();
  await page.fill("#f-titulo", "Estúdio");
  await page.selectOption("#f-tipo", { index: 1 });
  await expect(page.locator("#f-clienteId option", { hasText: "Grupo Exemplo" })).toHaveCount(1);
  await page.selectOption("#f-clienteId", "grupo");
  const status = page.locator("#f-status");
  await expect(status).toBeVisible();
  await status.getByRole("radio", { name: "Em andamento" }).click();
  await page.click(".modal button[type=submit]");
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas"]).find((t) => t.titulo === "Estúdio")?.status)).toBe("andamento");
});


test("topo de Tarefas igual nas quatro visões e logo leva para o Hoje", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/tarefas");
  const medidas = [];
  for (const visao of ["Calendário", "Quadro", "Lista", "Equipe"]) {
    await page.locator(".visoes-tarefas").getByRole("tab", { name: new RegExp(visao) }).click();
    await expect(page.locator(".visoes-tarefas [aria-selected=true]")).toContainText(visao);
    await expect(page.locator("#conteudo h1")).toHaveText("Tarefas");
    await expect(page.getByRole("button", { name: /\+ Novo/ })).toBeVisible();
    await expect(page.locator("#busca-tarefas")).toBeVisible();
    medidas.push(await page.locator(".filtros-tarefas").evaluate((e) => Math.round(e.getBoundingClientRect().top)));
    await expect(page.locator(".navegador-mes")).toBeVisible({ visible: visao === "Calendário" });
  }
  expect(new Set(medidas).size, JSON.stringify(medidas)).toBe(1); // os filtros não mudam de lugar
  await page.getByRole("button", { name: /\+ Novo/ }).click();
  await expect(page.getByRole("menuitem")).toHaveCount(3);
  await page.locator("#conteudo h1").click();
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await page.locator(".lateral-menu a.marca").click();
  await expect(page).toHaveURL(/#\/hoje/);
});

test("grupo: escolhe a marca antes e a ficha fica igual à de um cliente comum", async ({ page }) => {
  await abrir(page);
  await page.evaluate(async () => {
    const db = await import("/js/db.js");
    await db.salvarComId("marcas", "ma", { nome: "Marca A", clienteId: "grupo", ativo: true, paleta: ["#2D6CDF"] });
    await db.salvarComId("marcas", "mb", { nome: "Marca B", clienteId: "grupo", ativo: true, paleta: ["#B4415A"], instagram: "@marcab" });
  });
  await page.goto("/#/clientes/grupo");
  await expect(page.locator("#conteudo")).toContainText("Qual marca você quer abrir?");
  await expect(page.locator(".cartao-marca")).toHaveCount(3); // Marca A, Marca B e o geral do grupo
  await page.locator(".cartao-marca", { hasText: "Marca A" }).click();
  await expect(page).toHaveURL(/#\/clientes\/grupo\/marca\/ma/);
  await expect(page.locator("#conteudo h1")).toHaveText("Marca A");
  const abas = await page.locator(".ficha .abas [role=tab]").allTextContents();
  expect(abas).toEqual(["Marca", "Campanhas", "Contas", "Resultados", "Tráfego pago"]); // contrato, escopo e financeiro ficam no geral do grupo
  await page.getByRole("tab", { name: "Contas" }).click();
  await expect(page.locator(".cartao-conta")).toHaveCount(1);
  await page.getByRole("button", { name: "Editar redes" }).click();
  await page.fill("#f-googleMeuNegocio", "https://g.page/marca-a");
  await page.fill("#f-linkedin", "linkedin.com/company/marca-a");
  await page.click(".modal button[type=submit]");
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/marcas"].ma.googleMeuNegocio)).toBe("https://g.page/marca-a");
  expect(await page.evaluate(() => window.__store["espacos/hyper/clientes"].grupo.linkedin || "")).toBe("");
  await expect(page.locator(".cartao-conta")).toContainText("Google Meu Negócio");

  // Tarefas da marca: abre Tarefas filtrado pelo cliente e pela marca
  await page.getByRole("link", { name: /Tarefas \(/ }).click();
  await expect(page).toHaveURL(/#\/tarefas\/grupo\/ma/);
  await expect(page.locator(".filtros-tarefas select[aria-label=Marca]")).toHaveValue("ma");

  // Geral do grupo: tem tráfego e financeiro
  await page.goto("/#/clientes/grupo/marca/grupo");
  await expect(page.locator(".ficha .abas").getByRole("tab", { name: "Financeiro" })).toHaveCount(1);

  // Cliente comum: abre direto, mesmas abas de redes, sem Tarefas/Conteúdo
  await page.goto("/#/clientes/loja");
  await expect(page.locator(".ficha .abas").getByRole("tab", { name: "Tarefas" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Contas" }).click();
  await page.getByRole("button", { name: "Editar redes" }).click();
  await expect(page.locator("#f-googleMeuNegocio")).toBeVisible();
});

test("portal do cliente: só as marcas dele, aprova, pede ajuste e sugere post", async ({ page }) => {
  const erros = await abrir(page, {
    usuario: { uid: "cli", displayName: "Carla Cliente", email: "carla@exemplo.com" }, semMenu: true,
    membros: {
      hyper: { nome: "Hyper", email: "hyper@exemplo.com", papel: "admin", status: "ativo" },
      cli: { nome: "Carla Cliente", email: "carla@exemplo.com", papel: "cliente", status: "ativo", permissoes: [], acessoClientes: "alguns", clientes: ["grupo"], marcas: ["ma"] }
    },
    extra: {
      marcas: { ma: { nome: "Marca A", clienteId: "grupo", ativo: true, paleta: ["#2D6CDF"], tomDeVoz: "Animado e próximo", instagram: "@marcaa" },
        mb: { nome: "Marca B", clienteId: "grupo", ativo: true, paleta: ["#B4415A"] } },
      tarefas: {
        pa: { titulo: "Post para aprovar", tipo: "Conteúdo", clienteId: "grupo", marcaId: "ma", status: "andamento", statusConteudo: "aprovacao", dataPublicacao: dia(3), prazo: dia(3), copy: "Legenda do post A", checklist: [] },
        pc: { titulo: "Post com ajuste", tipo: "Conteúdo", clienteId: "grupo", marcaId: "ma", status: "andamento", statusConteudo: "aprovacao", dataPublicacao: dia(4), prazo: dia(4), checklist: [] },
        pb: { titulo: "Post da outra marca", tipo: "Conteúdo", clienteId: "grupo", marcaId: "mb", status: "andamento", statusConteudo: "aprovacao", dataPublicacao: dia(3), prazo: dia(3), checklist: [] }
      }
    }
  });
  await expect(page.locator("#menu")).toContainText("Início");
  const menu = await page.locator("#menu a").allTextContents();
  expect(menu.join(" ")).not.toMatch(/Tarefas|Financeiro|Clientes|Ajustes/);
  await expect(page.locator("#conteudo")).toContainText("Para aprovar (2)");
  await expect(page.locator(".portal-post").first()).toContainText("Para você aprovar"); // etapas com nomes simples
  await expect(page.locator("#conteudo")).not.toContainText("Post da outra marca");
  await expect(page.locator("#conteudo")).not.toContainText("Revisar campanhas");

  await page.locator(".portal-post", { hasText: "Post para aprovar" }).getByRole("button", { name: /Aprovar/ }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].pa.statusConteudo)).toBe("aprovado");

  await page.locator(".portal-post", { hasText: "Post com ajuste" }).getByRole("button", { name: "Pedir ajuste" }).click();
  await page.fill("#f-comentario", "Trocar a foto");
  await page.click(".modal button[type=submit]");
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].pc.aprovacaoCliente?.comentario)).toBe("Trocar a foto");
  expect(await page.evaluate(() => window.__store["espacos/hyper/tarefas"].pc.statusConteudo)).toBe("producao");

  await page.getByRole("button", { name: "+ Sugerir um post" }).click();
  await page.fill("#f-titulo", "Ideia da Carla");
  await page.click(".modal button[type=submit]");
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas"]).find((t) => t.titulo === "Ideia da Carla")))
    .toMatchObject({ tipo: "Conteúdo", clienteId: "grupo", marcaId: "ma", statusConteudo: "ideia", sugeridoPeloCliente: "Carla Cliente" });

  await page.goto("/#/marca");
  await expect(page.locator("#conteudo")).toContainText("Animado e próximo");
  await page.goto("/#/financeiro"); // tela da equipe: volta para o Início
  await expect(page.locator("#conteudo h1")).toContainText("Olá, Carla");
  expect(erros).toEqual([]);
});

test("administrador adiciona uma pessoa do cliente com uma marca só; financeiro não é área da equipe", async ({ page }) => {
  await abrir(page, { extra: { marcas: { ma: { nome: "Marca A", clienteId: "grupo", ativo: true, paleta: [] } } } });
  await page.goto("/#/usuarios");
  await page.getByRole("button", { name: /Adicionar usuário/ }).click();
  await expect(page.locator(".modal .chip-check", { hasText: "Financeiro" })).toHaveCount(0);
  await page.fill("#f-nome", "Carla");
  await page.fill("#f-email", "Carla@Exemplo.com");
  await page.locator(".modal .tipo-acesso label", { hasText: "Cliente" }).click();
  await page.locator(".modal .lista-clientes-acesso:visible .chip-check", { hasText: "Grupo Exemplo" }).locator("input").check();
  await page.locator(".modal .lista-marcas-acesso .chip-check", { hasText: "Marca A" }).locator("input").check();
  await page.click(".modal button[type=submit]");
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/convites"]?.["carla@exemplo.com"]))
    .toMatchObject({ papel: "cliente", acessoClientes: "alguns", clientes: ["grupo"], marcas: ["ma"], permissoes: [] });
});

test("portal do cliente: sem Studio; sugere post e cria a copy pelo pedido", async ({ page }) => {
  await abrir(page, {
    usuario: { uid: "cli", displayName: "Carla Cliente", email: "carla@exemplo.com" }, semMenu: true,
    membros: {
      hyper: { nome: "Hyper", email: "hyper@exemplo.com", papel: "admin", status: "ativo" },
      cli: { nome: "Carla Cliente", email: "carla@exemplo.com", papel: "cliente", status: "ativo", permissoes: [], acessoClientes: "alguns", clientes: ["loja"], marcas: [] }
    }
  });
  await expect(page.locator("#menu")).not.toContainText("Studio");
  await page.goto("/#/studio");
  await expect(page).toHaveURL(/#\/inicio/);
  await page.getByRole("button", { name: "+ Sugerir um post" }).click();
  await page.fill("#f-titulo", "Promoção de inverno");
  await page.getByRole("button", { name: "✨ Criar copy" }).click();
  const janela = page.locator(".modal").last();
  await janela.locator("summary", { hasText: "Ver o pedido" }).click();
  await expect(janela.locator(".pedido-ia")).toContainText("[LEGENDA]");
  await janela.locator("#ia-resposta").fill("[LEGENDA]\nChegou o inverno na Loja!");
  await janela.getByRole("button", { name: "Usar resposta" }).click();
  await expect(page.locator("#f-copy")).toHaveValue("Chegou o inverno na Loja!");
  await page.getByRole("button", { name: "Enviar sugestão" }).click();
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas"]).find((t) => t.titulo === "Promoção de inverno")))
    .toMatchObject({ clienteId: "loja", statusConteudo: "ideia", copy: "Chegou o inverno na Loja!", sugeridoPeloCliente: "Carla Cliente" });
});

test("Produzir semana: posts planejados viram checklist dentro da tarefa; extras ficam soltos", async ({ page }) => {
  const erros = await abrir(page, { extra: { tarefas: {
    prod: { titulo: "Produzir semana — Loja Exemplo", tipo: "Produção", clienteId: "loja", prazo: dia(0), status: "a_fazer", semanaInicio: dia(2), rotina: "producao", checklist: [] },
    pA: { titulo: "Post planejado A", tipo: "Conteúdo", clienteId: "loja", formato: "Carrossel", rede: "Instagram", dataPublicacao: dia(3), prazo: dia(2), statusConteudo: "ideia", status: "a_fazer", checklist: [] },
    pB: { titulo: "Post planejado B", tipo: "Conteúdo", clienteId: "loja", formato: "Reels", rede: "Instagram", dataPublicacao: dia(4), prazo: dia(3), statusConteudo: "ideia", status: "a_fazer", checklist: [] },
    pX: { titulo: "Post extra X", tipo: "Conteúdo", clienteId: "loja", formato: "Story", rede: "Instagram", dataPublicacao: dia(3), prazo: dia(2), statusConteudo: "ideia", status: "a_fazer", extra: true, checklist: [] }
  } } });
  // Formato antigo vira o novo
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].pB.formato)).toBe("Vídeo");

  await page.goto("/#/tarefas");
  await page.locator(".visoes-tarefas").getByRole("tab", { name: /Quadro/ }).click();
  await expect(page.locator("#conteudo")).toContainText("Produzir semana — Loja Exemplo");
  await expect(page.locator(".cartao-tarefa", { hasText: "Produzir semana" })).toContainText("0/2 posts");
  await expect(page.locator(".cartao-tarefa", { hasText: "Post planejado A" })).toHaveCount(0);
  await expect(page.locator(".cartao-tarefa", { hasText: "Post extra X" })).toHaveCount(1);
  // Na aba Posts aparecem todos
  await page.locator(".filtros-tarefas").getByRole("tab", { name: "Posts" }).click();
  await expect(page.locator(".cartao-tarefa", { hasText: "Post planejado A" })).toHaveCount(1);
  await page.locator(".filtros-tarefas").getByRole("tab", { name: "Tudo" }).click();

  await page.locator(".cartao-tarefa", { hasText: "Produzir semana" }).click();
  await expect(page.locator(".checklist-producao li")).toHaveCount(2);
  // Clicar no item abre o post por cima; Esc fecha só o post
  await page.locator(".item-producao", { hasText: "Post planejado A" }).click();
  await expect(page.locator(".modal")).toHaveCount(2);
  await expect(page.locator(".modal").last()).toContainText("Editar post");
  await expect(page.locator(".modal").last().locator(".faixa-info")).toContainText("Produzir semana");
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(1);
  // Ticar = produzido
  await page.locator(".checklist-producao li", { hasText: "Post planejado A" }).locator("input").check();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].pA.produzido)).toBe(true);
  await expect(page.locator(".semana-producao")).toContainText("1/2 produzidos");
  expect(erros).toEqual([]);
});

test("post novo: formatos novos, nasce como extra e Criar copy preenche a copy e o texto da arte", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/tarefas");
  await page.getByRole("button", { name: /\+ Novo/ }).click();
  await page.getByRole("menuitem", { name: /Post/ }).click();
  const opcoes = await page.locator("#f-formato option").allTextContents();
  expect(opcoes).toEqual(["Estático", "Carrossel", "Vídeo", "Story", "Anúncio", "Artigo", "E-mail marketing", "WhatsApp", "Blog", "Outro"]);
  const tipos = await page.locator("#f-tipo option").allTextContents();
  expect(tipos[tipos.length - 1]).toBe("Outro");
  await expect(page.locator("#f-extra")).toBeChecked();
  await page.selectOption("#f-clienteId", "loja");
  await page.fill("#f-titulo", "Post com IA");
  await page.getByRole("button", { name: "✨ Criar copy" }).click();
  const janela = page.locator(".modal").last();
  await expect(janela).toContainText("Ficha da marca para a IA");
  // Só copy: sem escolher outro tipo, sem imagem e sem escrever pela OpenAI aqui dentro
  await expect(janela.getByRole("radio", { name: /Imagem|Anúncio|Adaptar/ })).toHaveCount(0);
  await expect(janela).not.toContainText("OpenAI");
  await expect(janela).toContainText("Sem briefing");
  await janela.locator("summary", { hasText: "Ver o pedido" }).click();
  await expect(janela.locator(".pedido-ia")).toContainText("Manual de escrita da Hyper");
  await expect(janela.locator(".pedido-ia")).toContainText("[LEGENDA]");
  await janela.locator("#ia-resposta").fill("**[LEGENDA]**\nChegou a coleção nova!\n\n## [TEXTO DA ARTE]\nColeção de verão");
  await janela.getByRole("button", { name: "Usar resposta" }).click();
  await expect(page.locator("#f-copy")).toHaveValue("Chegou a coleção nova!");
  await expect(page.locator("#f-textoArte")).toHaveValue(/Coleção de verão/);
});

test("motor de pedidos: manual, marca, exemplos aprovados, data comemorativa e leitura da resposta", async ({ page }) => {
  await abrir(page, { extra: {
    clientes: { loja: { nome: "Loja Exemplo", ativo: true, paleta: ["#C98A00"], tomDeVoz: "Leve e direto", publico: "Mulheres 25-40", evitar: "gírias" } },
    tarefas: { ap: { titulo: "Post aprovado antigo", tipo: "Conteúdo", clienteId: "loja", formato: "Estático", statusConteudo: "publicado", status: "concluido", concluidoEm: dia(-5), dataPublicacao: dia(-5), prazo: dia(-6), copy: "Esta é uma legenda aprovada da loja, com o jeito dela de falar e uma chamada para ação.", checklist: [] } }
  } });
  const r = await page.evaluate(async () => {
    const ia = await import("/js/ia.js");
    const pedido = ia.montarPedido("copy", { clienteId: "loja", marcaId: "", post: { titulo: "Natal na loja", formato: "Carrossel", rede: "Instagram", dataPublicacao: "2026-12-23", roteiro: "Presentes até R$ 100" } });
    const lida = ia.lerResposta("Aqui vai:\n[LEGENDA]\nTexto final\n[LÂMINAS]\nLâmina 1: capa");
    const nada = ia.lerResposta("Só um texto sem marcador");
    return { pedido, lida, nada, medidor: ia.completudeMarca("loja", ""), video: ia.montarPedido("roteiro", { clienteId: "loja", post: { titulo: "x", formato: "Vídeo" } }) };
  });
  expect(r.pedido).toContain("Manual de escrita da Hyper");
  expect(r.pedido).toContain("Tom de voz: Leve e direto");
  expect(r.pedido).toContain("O que evitar (nunca use): gírias");
  expect(r.pedido).toContain("Esta é uma legenda aprovada da loja");
  expect(r.pedido).toContain("Natal (25/12)");
  expect(r.pedido).toContain("Carrossel (em geral de 5 a 10 lâminas)");
  expect(r.pedido).toContain("As três camadas da escrita"); // manual da Hyper (versão do Matheus)
  expect(r.pedido).toContain("Presentes até R$ 100");
  expect(r.lida).toEqual({ LEGENDA: "Texto final", LAMINAS: "Lâmina 1: capa" });
  expect(r.nada).toEqual({ LEGENDA: "Só um texto sem marcador" });
  expect(r.pedido).not.toContain("Estilo de imagem");
  expect(r.pedido).not.toContain("### Visual");
  expect(r.video).toContain("[ROTEIRO]");
  expect(r.medidor.pct).toBeGreaterThan(0);
  expect(r.medidor.faltando).toContain("Persona");
});

test("marca: medidor, aprendizados dos ajustes, sem botões de IA, e manual editável em Ajustes", async ({ page }) => {
  await abrir(page, { extra: { tarefas: {
    aj: { titulo: "Post com ajuste", tipo: "Conteúdo", clienteId: "loja", formato: "Estático", statusConteudo: "producao", status: "andamento", dataPublicacao: dia(3), prazo: dia(2),
      aprovacaoCliente: { decisao: "ajuste", comentario: "Não usar a palavra barato", em: Date.now() }, checklist: [] } } } });
  await page.goto("/#/clientes/loja");
  await page.getByRole("tab", { name: "Marca" }).click();
  await expect(page.locator(".medidor-marca")).toContainText("Ficha da marca para a IA");
  await expect(page.getByRole("button", { name: /Kit da marca|Sugerir melhoria/ })).toHaveCount(0);
  await expect(page.locator("#marca-estiloVisual, #marca-identidadeVisual")).toHaveCount(0);
  await expect(page.locator("#marca-fontes")).toHaveCount(1);
  await page.locator(".aprendizados summary").click();
  await page.locator(".aprendizados").getByRole("button", { name: "Só em Estático" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/clientes"].loja.diretrizes || "")).toContain("[Estático] Não usar a palavra barato");
  const soEstatico = await page.evaluate(async () => { const ia = await import("/js/ia.js");
    return [ia.montarPedido("copy", { clienteId: "loja", post: { titulo: "x", formato: "Estático" } }), ia.montarPedido("carrossel", { clienteId: "loja", post: { titulo: "x", formato: "Carrossel" } })]; });
  expect(soEstatico[0]).toContain("- Não usar a palavra barato");
  expect(soEstatico[1]).not.toContain("Não usar a palavra barato");

  await page.goto("/#/config");
  await expect(page.locator("#conteudo")).not.toContainText("OpenAI");
  await page.locator("summary", { hasText: "Manual de escrita da Hyper" }).click();
  await page.getByText("Ver e editar o manual").click();
  await page.fill("#manual-hyper", "# Manual de teste\nSempre falar de você.");
  await page.getByRole("button", { name: "Salvar manual" }).click();
  await expect.poll(() => page.evaluate(async () => (await import("/js/ia.js")).montarPedido("copy", { clienteId: "loja", post: { titulo: "x" } }))).toContain("Sempre falar de você.");
});

test("Hoje: cada dia dos próximos 7 dias abre e fecha", async ({ page }) => {
  await abrir(page, { extra: { tarefas: {
    d2: { titulo: "Tarefa depois de amanhã", tipo: "Organização", clienteId: "", prazo: dia(2), status: "a_fazer", checklist: [] }
  } } });
  await page.goto("/#/hoje");
  await page.getByRole("tab", { name: "Equipe" }).click();
  const dia2 = page.locator("details.grupo-dia", { hasText: "Tarefa depois de amanhã" });
  await expect(dia2).toHaveAttribute("open", "");
  await dia2.locator("summary").click();
  await expect(page.locator(".cartao-tarefa", { hasText: "Tarefa depois de amanhã" })).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("hyper-dias-recolhidos") || "")).toContain("-");
  await page.reload();
  await page.getByRole("tab", { name: "Equipe" }).click();
  await expect(page.locator(".cartao-tarefa", { hasText: "Tarefa depois de amanhã" })).toBeHidden(); // lembra que fechou
  await page.getByRole("button", { name: "Abrir todos" }).click();
  await expect(page.locator(".cartao-tarefa", { hasText: "Tarefa depois de amanhã" })).toBeVisible();
});

test("Produzir semana: roteiros dos vídeos da semana seguinte, alerta, aprovação e copiar semana", async ({ page }) => {
  const erros = await abrir(page, { extra: { tarefas: {
    prod: { titulo: "Produzir semana — Loja Exemplo", tipo: "Produção", clienteId: "loja", prazo: dia(0), status: "a_fazer", semanaInicio: dia(2), rotina: "producao", checklist: [] },
    pA: { titulo: "Post da semana A", tipo: "Conteúdo", clienteId: "loja", formato: "Estático", rede: "Instagram", dataPublicacao: dia(2), prazo: dia(1), statusConteudo: "producao", status: "andamento", copy: "Legenda A", checklist: [] },
    pB: { titulo: "Post da semana B", tipo: "Conteúdo", clienteId: "loja", formato: "Carrossel", rede: "Instagram", dataPublicacao: dia(5), prazo: dia(3), statusConteudo: "ideia", status: "a_fazer", checklist: [] },
    vid: { titulo: "Vídeo da outra semana", tipo: "Conteúdo", clienteId: "loja", formato: "Vídeo", rede: "Instagram", dataPublicacao: dia(10), prazo: dia(7), statusConteudo: "ideia", status: "a_fazer", checklist: [] }
  } } });
  await page.goto("/#/tarefas");
  await page.locator(".visoes-tarefas").getByRole("tab", { name: /Quadro/ }).click();
  await expect(page.locator(".cartao-tarefa", { hasText: "Produzir semana" })).toContainText("perto da data");
  await page.locator(".cartao-tarefa", { hasText: "Produzir semana" }).click();
  await expect(page.locator(".semana-producao .faixa-alerta")).toContainText("2 dias");
  // Roteiro do vídeo da semana seguinte
  await expect(page.locator(".semana-producao")).toContainText("Roteiros dos vídeos da semana seguinte");
  await page.locator(".checklist-producao li", { hasText: "Vídeo da outra semana" }).locator("input").check();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].vid.roteiroPronto)).toBe(true);
  // Produzido → mandar a semana para aprovação (link da semana)
  await page.locator(".checklist-producao li", { hasText: "Post da semana A" }).locator("input").check();
  await expect(page.locator(".aviso")).toContainText("Mandar para aprovação");
  await page.getByRole("button", { name: /Mandar para aprovação \(1\)/ }).click();
  await expect(page.locator(".modal").last()).toContainText("Link de aprovação");
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].pA.statusConteudo)).toBe("aprovacao");
  expect(await page.evaluate(() => typeof window.__store["espacos/hyper/tarefas"].pA.aprovacaoDesde)).toBe("number");
  expect(await page.evaluate(() => Object.values(window.__store["espacos/hyper/aprovacoes"] || {})[0]?.rotulo)).toContain("semana de");
  await page.keyboard.press("Escape");
  // Copiar os posts para a semana seguinte
  await page.getByRole("button", { name: /Copiar para outra semana/ }).click();
  await page.locator(".modal").last().locator("button[type=submit]").click();
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas"]).filter((t) => t.titulo === "Post da semana B").length)).toBe(2);
  expect(erros).toEqual([]);
});

test("Ajustes: menus configuráveis aparecem no card; prazo automático, pilar, briefing e duplicar", async ({ page }) => {
  await abrir(page, { extra: { clientes: { loja: { nome: "Loja Exemplo", ativo: true, paleta: [], cor: "#C98A00", tomDeVoz: "Leve e direto", pilares: "Educativo\nOferta" } } } });
  await page.goto("/#/config");
  await page.locator("summary", { hasText: "Menus e listas" }).click();
  await page.getByText("Editar menus").click();
  const tipos = page.locator(".editor-lista", { hasText: "Tipos de tarefa" });
  await expect(tipos.locator("li", { hasText: "Conteúdo" }).getByRole("button", { name: /Tirar/ })).toHaveCount(0); // fixo
  await tipos.locator("input[type=text]").fill("Jurídico");
  await tipos.getByRole("button", { name: "+ Adicionar" }).click();
  const formatos = page.locator(".editor-lista", { hasText: "Formatos de post" });
  await formatos.locator("li", { hasText: "Vídeo" }).locator("input[type=number]").fill("4");
  await page.getByRole("button", { name: "Salvar menus" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/config"]?.listas?.tipos)).toContain("Jurídico");
  // Espera o app aplicar a configuração nova (chega pelo ouvinte do banco)
  await expect.poll(() => page.evaluate(async () => (await import("/js/constantes.js")).ANTECEDENCIA["Vídeo"])).toBe(4);

  await page.goto("/#/tarefas");
  await page.getByRole("button", { name: /\+ Novo/ }).click();
  await page.getByRole("menuitem", { name: /Post/ }).click();
  expect(await page.locator("#f-tipo option").allTextContents()).toContain("Jurídico");
  await page.selectOption("#f-clienteId", "loja");
  await page.selectOption("#f-formato", "Vídeo");
  await page.fill("#f-dataPublicacao", dia(10));
  await page.locator("#f-dataPublicacao").dispatchEvent("change");
  await expect(page.locator("#f-prazo")).toHaveValue(dia(6)); // 4 dias antes (configurado)
  expect(await page.locator("#f-pilar option").allTextContents()).toEqual(["—", "Educativo", "Oferta"]);
  await page.selectOption("#f-pilar", "Oferta");
  await page.getByRole("button", { name: "Montar briefing" }).click();
  await page.locator(".modal").last().locator("#f-assunto").fill("Aula experimental");
  await page.locator(".modal").last().locator("#f-cta").fill("Chamar no WhatsApp");
  await page.locator(".modal").last().locator("button[type=submit]").click();
  await expect(page.locator("#f-roteiro")).toHaveValue(/Assunto: Aula experimental[\s\S]*Chamada para ação: Chamar no WhatsApp/);
  await page.fill("#f-titulo", "Post com pilar");
  await page.locator(".modal button[type=submit]").click();
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas"]).find((t) => t.titulo === "Post com pilar")?.pilar)).toBe("Oferta");

  // Duplicar
  const id = await page.evaluate(() => Object.entries(window.__store["espacos/hyper/tarefas"]).find(([, t]) => t.titulo === "Post com pilar")[0]);
  await page.evaluate(async (id) => { const c = await import("/js/views/componentes.js"); const db = await import("/js/db.js"); c.abrirTarefa(db.porId("tarefas", id)); }, id);
  await page.getByRole("button", { name: "⧉ Duplicar" }).click();
  await expect(page.locator("#f-titulo")).toHaveValue("Post com pilar (cópia)");
  await page.keyboard.press("Escape");

  // Pilares do mês no calendário (cliente filtrado)
  await page.goto(`/#/calendario/loja/${dia(10).slice(0, 7)}`);
  await expect(page.locator(".resumo-pilares")).toContainText("Oferta · 1");
  await expect(page.locator(".resumo-pilares")).toContainText("Educativo · 0");
});

test("pedido de copy certo para cada formato, vídeo já gravado, anúncio, exemplos marcados e texto de tarefa", async ({ page }) => {
  await abrir(page, { extra: { tarefas: {
    ex1: { titulo: "Post marcado", tipo: "Conteúdo", clienteId: "loja", formato: "Estático", statusConteudo: "ideia", status: "a_fazer", dataPublicacao: dia(-3), prazo: dia(-4), exemplo: true, copy: "Esta é a copy marcada como exemplo pela equipe, com o jeito da loja.", checklist: [] },
    ex2: { titulo: "Post aprovado comum", tipo: "Conteúdo", clienteId: "loja", formato: "Estático", statusConteudo: "publicado", status: "concluido", concluidoEm: dia(-2), dataPublicacao: dia(-2), prazo: dia(-3), copy: "Copy aprovada mas que ninguém marcou como exemplo para a IA aprender.", checklist: [] } } } });
  const r = await page.evaluate(async () => {
    const ia = await import("/js/ia.js");
    const p = (post) => ia.montarPedido(ia.tipoDoPedido(post), { clienteId: "loja", marcaId: "", post: { titulo: "Tema", ...post } });
    return {
      tipos: ["Estático", "Carrossel", "Vídeo", "Story", "Anúncio", "Artigo", "Blog", "E-mail marketing", "WhatsApp", "Outro"].map((formato) => ia.tipoDoPedido({ tipo: "Conteúdo", formato })),
      gravado: ia.tipoDoPedido({ tipo: "Conteúdo", formato: "Vídeo", videoGravado: true }),
      tarefa: ia.tipoDoPedido({ tipo: "Projeto" }),
      email: p({ formato: "E-mail marketing" }), artigo: p({ formato: "Artigo" }), anuncio: p({ formato: "Anúncio" }),
      video: p({ formato: "Vídeo", videoGravado: true, transcricao: "Oi, eu sou a Ana e hoje vou mostrar a coleção." }),
      texto: ia.montarPedido("texto", { clienteId: "loja", post: { tipo: "Projeto", titulo: "Apresentação comercial", notas: "Para lojistas" } }),
      exemplos: ia.exemplosDaMarca("loja", "").map((t) => t.id),
      email2: ia.camposDaResposta(ia.lerResposta("[ASSUNTO]\nA\n[PRÉ-CABEÇALHO]\nB\n[TEXTO]\nCorpo do e-mail\n[BOTÃO]\nComprar")),
      anuncio2: ia.camposDaResposta(ia.lerResposta("[TEXTO PRINCIPAL]\nVariação 1\n[TÍTULO]\nT1"))
    };
  });
  expect(r.tipos).toEqual(["copy", "carrossel", "roteiro", "stories", "anuncio", "artigo", "artigo", "email", "whatsapp", "copy"]);
  expect(r.gravado).toBe("videoGravado");
  expect(r.tarefa).toBe("texto");
  expect(r.email).toContain("[ASSUNTO]"); expect(r.email).toContain("[PRÉ-CABEÇALHO]"); expect(r.email).not.toContain("[LEGENDA]");
  expect(r.artigo).toContain("[TÍTULO]"); expect(r.artigo).toContain("[TEXTO]");
  expect(r.anuncio).toContain("[TEXTO PRINCIPAL]"); expect(r.anuncio).toContain("políticas de anúncios");
  expect(r.video).toContain("Transcrição do vídeo já gravado"); expect(r.video).not.toContain("[ROTEIRO]");
  expect(r.texto).toContain("Apresentação comercial"); expect(r.texto).toContain("Para lojistas"); expect(r.texto).toContain("[TEXTO]");
  expect(r.exemplos).toEqual(["ex1"]); // marcado tem preferência sobre aprovado
  expect(r.email2).toEqual({ copy: "Corpo do e-mail", textoArte: "ASSUNTO\nA\n\nPRÉ-CABEÇALHO\nB\n\nBOTÃO\nComprar" });
  expect(r.anuncio2.copy).toBe("Variação 1");

  // No post: objetivo é a etapa do funil; vídeo já gravado pede a transcrição
  await page.goto("/#/tarefas");
  await page.getByRole("button", { name: /\+ Novo/ }).click();
  await page.getByRole("menuitem", { name: /Post/ }).click();
  await expect(page.locator("#f-objetivo option")).toHaveText(["—", "Reconhecimento", "Consideração", "Conversão", "Relacionamento"]);
  await page.selectOption("#f-formato", "Vídeo");
  await page.locator("#f-videoGravado").check();
  await expect(page.locator("#f-transcricao")).toBeVisible();
  await page.keyboard.press("Escape");
  // Tarefa comum: campo Texto com "Criar texto"
  await page.getByRole("button", { name: /\+ Novo/ }).click();
  await page.getByRole("menuitem", { name: /Tarefa/ }).click();
  await page.selectOption("#f-tipo", "Projeto");
  await page.selectOption("#f-clienteId", "loja");
  await page.fill("#f-titulo", "Apresentação comercial");
  await page.getByRole("button", { name: "✨ Criar texto" }).click();
  const janela = page.locator(".modal").last();
  await janela.locator("#ia-resposta").fill("[TEXTO]\nSlide 1: quem somos");
  await janela.getByRole("button", { name: "Usar resposta" }).click();
  await expect(page.locator("#f-texto")).toHaveValue(/Slide 1: quem somos/);
});

test("campanha: agrupa peças na ficha, aparece no post e entra no pedido de copy", async ({ page }) => {
  const erros = await abrir(page);
  await page.goto("/#/clientes/loja");
  await page.getByRole("tab", { name: "Campanhas" }).click();
  await page.getByRole("button", { name: "+ Campanha" }).click();
  await page.fill("#f-nome", "Natal da Loja");
  await page.fill("#f-mensagem", "O presente certo está aqui");
  await page.fill("#f-condicoes", "10% no Pix até 24/12");
  await page.click(".modal button[type=submit]");
  await expect(page.locator(".aba-campanhas .campanha-cartao")).toContainText("Natal da Loja");
  await page.locator(".aba-campanhas .campanha-cartao").getByRole("button", { name: "+ Post" }).click();
  await expect(page.locator("#f-campanhaId")).toHaveValue(/.+/);
  await page.fill("#f-titulo", "Cestas de Natal");
  await page.click(".modal button[type=submit]");
  await expect(page.locator(".aba-campanhas .campanha-cartao")).toContainText("Cestas de Natal");
  await expect(page.locator(".aba-campanhas .campanha-cartao")).toContainText("0 de 1 peça(s) prontas");
  const pedido = await page.evaluate(async () => {
    const t = Object.entries(window.__store["espacos/hyper/tarefas"]).find(([, x]) => x.titulo === "Cestas de Natal");
    const ia = await import("/js/ia.js");
    return ia.montarPedido("copy", { clienteId: "loja", post: { id: t[0], ...t[1] } });
  });
  expect(pedido).toContain("## A campanha deste conteúdo");
  expect(pedido).toContain("10% no Pix até 24/12");
  expect(erros).toEqual([]);
});

test("escopo do cliente e datas comemorativas da Hyper", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/clientes/loja");
  await page.getByRole("tab", { name: "Escopo" }).click();
  await page.getByRole("button", { name: "+ Linha" }).click();
  const linha = page.locator(".tabela-escopo tbody tr").last();
  await linha.locator("select[aria-label=Serviço]").selectOption("Social media");
  await linha.locator("select[aria-label=Frequência]").selectOption("Semanal");
  await linha.locator("input[aria-label=Quantidade]").fill("2");
  await page.getByRole("button", { name: "Salvar escopo" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/clientes"].loja.escopo?.at(-1))).toMatchObject({ servico: "Social media", frequencia: "Semanal", quantidade: "2", quem: "Hyper" });
  expect(await page.evaluate(() => window.__store["espacos/hyper/clientes"].loja.servicos)).toContain("Social media");

  // Datas comemorativas ficam na marca; feriados aparecem no calendário de todos
  await page.getByRole("tab", { name: "Marca" }).click();
  await page.fill("#marca-data-quando", "20/01");
  await page.fill("#marca-data-nome", "Dia do Queijo");
  await page.locator(".datas-marca").getByRole("button", { name: "+ Data" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/clientes"].loja.datas)).toEqual([{ quando: "01-20", nome: "Dia do Queijo" }]);
  const datas = await page.evaluate(async () => { const ia = await import("/js/ia.js"); return [ia.datasPerto("2027-01-18", 3, "loja", "").map((d) => d.nome), ia.datasPerto("2027-01-18", 3, "grupo", "").map((d) => d.nome)]; });
  expect(datas[0]).toContain("Dia do Queijo");
  expect(datas[0]).toContain("Janeiro Branco (saúde mental)");
  expect(datas[1]).not.toContain("Dia do Queijo");
  await page.goto("/#/calendario/loja/2027-01");
  await expect(page.locator(".datas-do-mes")).toContainText("Dia do Queijo");
  await expect(page.locator(".cal-dia .data-cal.feriado", { hasText: "Confraternização Universal" })).toHaveCount(1);
  await page.goto("/#/calendario/loja/2027-01/planejar");
  await expect(page.locator(".plano-dia .data-cal.marca", { hasText: "Dia do Queijo" })).toHaveCount(1);
  await page.goto("/#/config");
  await expect(page.locator("#conteudo h2", { hasText: "Datas comemorativas" })).toHaveCount(0);
  await expect(page.locator("#conteudo h2", { hasText: "Espaço dos criativos" })).toHaveCount(0);
});

test("ajustes: quadros recolhem, backup por último e o aberto é lembrado", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/config");
  const quadros = page.locator("#conteudo details.recolhivel");
  await expect(quadros.last().locator("summary")).toHaveText("Backup");
  await expect(page.getByRole("button", { name: "Baixar backup (.json)" })).toBeHidden();
  await quadros.last().locator("summary").click();
  await expect(page.getByRole("button", { name: "Baixar backup (.json)" })).toBeVisible();
  await page.goto("/#/hoje");
  await page.goto("/#/config");
  await expect(page.getByRole("button", { name: "Baixar backup (.json)" })).toBeVisible();
});

test("hoje: + Novo oferece post, tarefa e compromisso", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/hoje");
  await page.getByRole("button", { name: "+ Novo" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["▣ Post", "✓ Tarefa", "◷ Compromisso"]);
  await page.getByRole("menuitem", { name: "✓ Tarefa" }).click();
  await expect(page.locator(".modal h2")).toHaveText("Nova tarefa");
});

test("planejamento: importar JSON coloca os posts do mês no rascunho", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/calendario/loja/2027-03/planejar");
  await page.getByRole("button", { name: "Importar planejamento (JSON)" }).click();
  await page.fill("#plano-json", JSON.stringify({ tipo: "planejamento-hyper", posts: [
    { data: "2027-03-02", formato: "Carrossel", rede: "Instagram", titulo: "5 dicas de outono", pilar: "Educação", objetivo: "Topo", copy: "Legenda pronta" },
    { data: "2027-03-09", formato: "Reels", titulo: "Bastidores" },
    { data: "2027-04-01", formato: "Estático", titulo: "De outro mês" }] }));
  await expect(page.locator(".previa-briefing")).toContainText("2 post(s) de");
  await expect(page.locator(".previa-briefing")).toContainText("1 post(s) de outro mês");
  await page.getByRole("button", { name: "Colocar no planejamento" }).click();
  await page.getByRole("button", { name: /Salvar planejamento/ }).click();
  await expect.poll(() => page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas"] || {}).filter((t) => t.clienteId === "loja" && (t.dataPublicacao || "").startsWith("2027-03")).length)).toBe(2);
  const post = await page.evaluate(() => Object.values(window.__store["espacos/hyper/tarefas"]).find((t) => t.titulo === "5 dicas de outono"));
  expect(post).toMatchObject({ formato: "Carrossel", pilar: "Educação", copy: "Legenda pronta", tipo: "Conteúdo", statusConteudo: "ideia" });
});

test("aprovação de tema: ideia aprovada pelo link vai para a produção", async ({ page, context }) => {
  await abrir(page);
  await page.evaluate(async () => { const db = await import("/js/db.js"); await db.salvarComId("tarefas", "id1", { titulo: "Ideia de carrossel", tipo: "Conteúdo", clienteId: "grupo", formato: "Carrossel", rede: "Instagram", dataPublicacao: new Date().toISOString().slice(0, 10), roteiro: "5 dicas", statusConteudo: "ideia", status: "a_fazer", checklist: [] }); });
  await page.evaluate(async () => { const a = await import("/js/aprovacoes.js"); await a.gerarLinkAprovacao("grupo", new Date().toISOString().slice(0, 7)); });
  await expect(page.locator(".modal").last()).toContainText("o cliente aprova o tema");
  const link = await page.locator(".modal input[readonly]").inputValue();
  expect(await page.evaluate(() => window.__store["espacos/hyper/tarefas"].id1.statusConteudo)).toBe("ideia");
  const cliente = await context.newPage();
  await rotearMocks(cliente);
  await cliente.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  const cartao = cliente.locator("article.aprov-post", { hasText: "Ideia de carrossel" });
  await expect(cartao).toContainText("Tema para aprovar");
  await cliente.fill("#aprov-nome", "Dona do Grupo");
  await cartao.getByRole("button", { name: "Aprovar tema" }).click();
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/tarefas"].id1.statusConteudo), { timeout: 10000 }).toBe("producao");
});



test("importar briefing dentro da marca: escolhe o bloco certo, converte datas e grava o escopo no cliente", async ({ page }) => {
  await abrir(page);
  await page.goto("/#/config");
  await expect(page.locator("#conteudo")).not.toContainText("Importar arquivo");
  await page.goto("/#/clientes/loja");
  await page.getByRole("tab", { name: "Marca" }).click();
  await page.getByRole("button", { name: "Importar briefing (JSON)" }).click();
  const json = { tipo: "marcas-hyper", marcas: [
    { cliente: "Outro Cliente", descricao: "Não é este" },
    { cliente: "Loja Exemplo", descricao: "Loja de roupas femininas", tomDeVoz: "Próximo", pilares: "Moda\nOfertas",
      datas: [{ quando: "20/01", nome: "Aniversário da loja" }], paleta: ["#C98A00"],
      escopo: [{ servico: "social media", frequencia: "semanal", quantidade: 3, quem: "hyper" }] }] };
  await page.fill("#briefing-json", "Pronto:\n```json\n" + JSON.stringify(json) + "\n```");
  const janela = page.locator(".modal").last();
  await expect(janela.locator("#briefing-bloco")).toHaveValue("1"); // achou o bloco pelo nome
  await expect(janela).toContainText("Vai para Loja Exemplo");
  await expect(janela).toContainText("20/01 Aniversário da loja");
  await janela.getByRole("button", { name: "Importar para esta marca" }).click();
  await expect.poll(() => page.evaluate(() => window.__store["espacos/hyper/clientes"].loja.descricao)).toBe("Loja de roupas femininas");
  const loja = await page.evaluate(() => window.__store["espacos/hyper/clientes"].loja);
  expect(loja.datas).toEqual([{ nome: "Aniversário da loja", quando: "01-20" }]);
  expect(loja.cor).toBe("#C98A00");
  expect(loja.escopo).toEqual([{ servico: "Social media", frequencia: "Semanal", quantidade: "3", quem: "Hyper", obs: "" }]);
  expect(loja.servicos).toEqual(["Social media"]);
});
