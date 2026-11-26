// Testes das regras do Firestore (firestore.rules), rodados no emulador:
//   npm run test:regras
// Garantem que dados sensíveis ficam protegidos no banco, não só escondidos na tela.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from "firebase/firestore";

const E = "espacos/hyper";
let amb;

before(async () => {
  amb = await initializeTestEnvironment({
    projectId: "demo-hyper",
    firestore: { rules: readFileSync("firestore.rules", "utf8") }
  });
});
after(async () => { await amb?.cleanup(); });

// Espaço com: dono, um admin, um básico, um de conteúdo, um de financeiro, um de tráfego e um pendente
beforeEach(async () => {
  await amb.clearFirestore();
  await amb.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const membro = (uid, extra) => setDoc(doc(db, `${E}/membros/${uid}`), { nome: uid, email: `${uid}@x.com`, papel: "basico", permissoes: [], status: "ativo", ...extra });
    await setDoc(doc(db, E), { dono: "dono" });
    await membro("admin", { papel: "admin", permissoes: ["conteudo", "trafego", "financeiro"] });
    await membro("basico");
    await membro("conteudo", { permissoes: ["conteudo"] });
    await membro("financeiro", { permissoes: ["financeiro"] });
    await membro("trafego", { permissoes: ["trafego"] });
    await membro("pendente", { status: "pendente" });
    // Pessoas do cliente c1: uma vê o cliente todo, a outra só a marca m1
    await membro("cli", { papel: "cliente", acessoClientes: "alguns", clientes: ["c1"] });
    await membro("clim", { papel: "cliente", acessoClientes: "alguns", clientes: ["c1"], marcas: ["m1"] });
    await membro("luisa", { permissoes: ["conteudo", "financeiro"], acessoClientes: "alguns", clientes: ["c1"] });
    await setDoc(doc(db, `${E}/clientes/c2`), { nome: "Outro cliente" });
    await setDoc(doc(db, `${E}/tarefas/t2`), { titulo: "Do outro", clienteId: "c2" });
    await setDoc(doc(db, `${E}/tarefas/t3`), { titulo: "Interna", clienteId: "" });
    await setDoc(doc(db, `${E}/contratos/c2`), { mensalidade: 3000 });
    await setDoc(doc(db, `${E}/financeiro/f2`), { valor: 3000, clienteId: "c2" });
    await setDoc(doc(db, `${E}/financeiro/d1`), { valor: 50, clienteId: "", tipo: "despesa" });
    await setDoc(doc(db, `${E}/config/email`), { url: "https://script.google.com/x", segredo: "s" });
    await setDoc(doc(db, `${E}/convites/nova@x.com`), { email: "nova@x.com", papel: "basico", permissoes: ["conteudo"], acessoClientes: "alguns", clientes: ["c1"] });
    await setDoc(doc(db, `${E}/clientes/c1`), { nome: "Cliente" });
    await setDoc(doc(db, `${E}/marcas/m1`), { nome: "Marca", clienteId: "c1" });
    await setDoc(doc(db, `${E}/tarefas/t1`), { titulo: "Tarefa", clienteId: "c1" });
    await setDoc(doc(db, `${E}/tarefasArquivo/t0`), { titulo: "Antiga" });
    await setDoc(doc(db, `${E}/contratos/c1`), { mensalidade: 1500 });
    await setDoc(doc(db, `${E}/financeiro/f1`), { valor: 1500, clienteId: "c1" });
    await setDoc(doc(db, `${E}/orcamentos/o1`), { valor: 900 });
    await setDoc(doc(db, `${E}/contasAds/a1`), { plataforma: "Meta Ads" });
    await setDoc(doc(db, `${E}/manutencoes/x1`), { acoes: "ajuste" });
    await setDoc(doc(db, `${E}/config/openai`), { chave: "sk-teste" });
    await setDoc(doc(db, `${E}/config/equipe`), { pessoas: [] });
    await setDoc(doc(db, `${E}/campanhas/k1`), { nome: "Natal", clienteId: "c1", condicoes: "10% no Pix" });
    await setDoc(doc(db, `${E}/config/comercial`), { reserva: 30, despesasFixas: [{ descricao: "Canva", valor: 35 }] });
    await setDoc(doc(db, `${E}/recorrencias/r1`), { modelo: "livre" });
    await setDoc(doc(db, `${E}/clientes/c1/artes/a1`), { dados: "data:" });
    await setDoc(doc(db, `${E}/clientes/c1/artes/a2`), { dados: "data:", marcaId: "m1", tarefaId: "pc1" });
    await setDoc(doc(db, `${E}/marcas/m2`), { nome: "Outra marca", clienteId: "c1" });
    await setDoc(doc(db, `${E}/tarefas/pc1`), { titulo: "Post m1", tipo: "Conteúdo", clienteId: "c1", marcaId: "m1", status: "andamento", statusConteudo: "aprovacao" });
    await setDoc(doc(db, `${E}/tarefas/pc2`), { titulo: "Post m2", tipo: "Conteúdo", clienteId: "c1", marcaId: "m2", status: "andamento", statusConteudo: "aprovacao" });
    await setDoc(doc(db, `${E}/tarefas/pc3`), { titulo: "Post pronto", tipo: "Conteúdo", clienteId: "c1", marcaId: "m1", status: "andamento", statusConteudo: "agendado" });
    await setDoc(doc(db, `${E}/compromissos/k1`), { titulo: "Reunião", clienteId: "c1" });
    await setDoc(doc(db, `${E}/pessoal/basico/config/agenda`), { email: "b@x.com" });
  });
});

const como = (uid, token) => (uid ? amb.authenticatedContext(uid, token) : amb.unauthenticatedContext()).firestore();
const ler = (uid, caminho) => getDoc(doc(como(uid), caminho));
const gravar = (uid, caminho, v = { x: 1 }) => setDoc(doc(como(uid), caminho), v, { merge: true });

test("sem login não vê nada além do documento do espaço", async () => {
  await assertFails(ler(null, `${E}`));
  await assertFails(ler(null, `${E}/clientes/c1`));
});

test("pedido de acesso: só pendente, básico e sem áreas", async () => {
  await assertSucceeds(setDoc(doc(como("novo"), `${E}/membros/novo`), { nome: "Novo", papel: "basico", permissoes: [], status: "pendente" }));
  await assertFails(setDoc(doc(como("novo2"), `${E}/membros/novo2`), { nome: "Novo", papel: "admin", permissoes: [], status: "pendente" }));
  await assertFails(setDoc(doc(como("novo3"), `${E}/membros/novo3`), { nome: "Novo", papel: "basico", permissoes: ["financeiro"], status: "pendente" }));
  await assertFails(setDoc(doc(como("novo4"), `${E}/membros/novo4`), { nome: "Novo", papel: "basico", permissoes: [], status: "ativo" }));
});

test("pendente não vê os dados", async () => {
  await assertSucceeds(ler("pendente", `${E}/membros/pendente`));
  for (const c of ["clientes/c1", "tarefas/t1", "marcas/m1", "config/equipe"]) await assertFails(ler("pendente", `${E}/${c}`));
});

test("ninguém se promove sozinho", async () => {
  await assertSucceeds(updateDoc(doc(como("basico"), `${E}/membros/basico`), { nome: "Outro nome", foto: "data:", pedido: { areas: ["financeiro"] } }));
  await assertFails(updateDoc(doc(como("luisa"), `${E}/membros/luisa`), { acessoClientes: "todos" }));
  await assertFails(updateDoc(doc(como("luisa"), `${E}/membros/luisa`), { clientes: ["c1", "c2"] }));
  await assertFails(updateDoc(doc(como("basico"), `${E}/membros/basico`), { papel: "admin" }));
  await assertFails(updateDoc(doc(como("basico"), `${E}/membros/basico`), { permissoes: ["financeiro"] }));
  await assertFails(updateDoc(doc(como("pendente"), `${E}/membros/pendente`), { status: "ativo" }));
  await assertFails(updateDoc(doc(como("conteudo"), `${E}/membros/basico`), { permissoes: ["conteudo"] }));
});

test("administrador e dono liberam acessos", async () => {
  await assertSucceeds(updateDoc(doc(como("admin"), `${E}/membros/pendente`), { status: "ativo", permissoes: ["conteudo"] }));
  await assertSucceeds(updateDoc(doc(como("dono"), `${E}/membros/basico`), { papel: "admin" }));
});

test("básico: vê clientes, marcas e tarefas; não vê valores nem contas de anúncio", async () => {
  for (const c of ["clientes/c1", "marcas/m1", "tarefas/t1", "tarefasArquivo/t0", "config/equipe", "recorrencias/r1"]) await assertSucceeds(ler("basico", `${E}/${c}`));
  for (const c of ["contratos/c1", "financeiro/f1", "orcamentos/o1", "contasAds/a1", "manutencoes/x1", "config/openai", "clientes/c1/artes/a1"])
    await assertFails(ler("basico", `${E}/${c}`));
  await assertSucceeds(gravar("basico", `${E}/tarefas/t1`));
  await assertFails(gravar("basico", `${E}/clientes/c1`));
  await assertFails(gravar("basico", `${E}/marcas/m1`));
  await assertFails(gravar("basico", `${E}/recorrencias/r1`));
  await assertFails(gravar("basico", `${E}/tarefasArquivo/t0`));
  await assertFails(gravar("basico", `${E}/config/equipe`));
});

test("conteúdo: edita clientes, marcas e criativos; não vê valores nem a chave antiga da OpenAI", async () => {
  await assertSucceeds(gravar("conteudo", `${E}/clientes/c1`));
  await assertSucceeds(gravar("conteudo", `${E}/marcas/m2`, { nome: "Nova", clienteId: "c1" }));
  await assertFails(ler("conteudo", `${E}/config/openai`));
  await assertSucceeds(gravar("conteudo", `${E}/clientes/c1/artes/a2`, { dados: "data:" }));
  await assertFails(gravar("conteudo", `${E}/config/openai`, { chave: "sk-outra" }));
  for (const c of ["contratos/c1", "financeiro/f1", "contasAds/a1"]) await assertFails(ler("conteudo", `${E}/${c}`));
});

test("financeiro é só de administrador: quem tem a área marcada não vê valores", async () => {
  for (const c of ["contratos/c1", "financeiro/f1", "orcamentos/o1"]) await assertFails(ler("financeiro", `${E}/${c}`));
  for (const c of ["contratos/c1", "financeiro/f1", "orcamentos/o1"]) await assertSucceeds(ler("admin", `${E}/${c}`));
  await assertFails(gravar("financeiro", `${E}/financeiro/f2`, { valor: 10 }));
  await assertSucceeds(gravar("admin", `${E}/financeiro/f2`, { valor: 10 }));
  await assertFails(ler("financeiro", `${E}/config/openai`));
  await assertFails(ler("financeiro", `${E}/contasAds/a1`));
});

test("tráfego: contas de anúncio e manutenções; não vê valores", async () => {
  await assertSucceeds(ler("trafego", `${E}/contasAds/a1`));
  await assertSucceeds(gravar("trafego", `${E}/manutencoes/x2`, { acoes: "novo" }));
  await assertSucceeds(gravar("trafego", `${E}/marcas/m1`));
  await assertFails(ler("trafego", `${E}/contratos/c1`));
});

test("administrador: rotinas, arquivo, configurações e tudo o mais", async () => {
  await assertSucceeds(gravar("admin", `${E}/recorrencias/r2`, { modelo: "cobranca" }));
  await assertSucceeds(gravar("admin", `${E}/tarefasArquivo/t9`, { titulo: "Arquivada" }));
  await assertSucceeds(deleteDoc(doc(como("admin"), `${E}/tarefas/t1`)));
  await assertFails(ler("admin", `${E}/config/openai`)); // chave antiga: ninguém lê pelo app
  await assertSucceeds(ler("dono", `${E}/contratos/c1`));
});

test("coisas pessoais: só a própria pessoa, e só da equipe", async () => {
  await assertSucceeds(ler("basico", `${E}/pessoal/basico/config/agenda`));
  await assertFails(gravar("pendente", `${E}/pessoal/pendente/config/agenda`));
  await assertFails(ler("admin", `${E}/pessoal/basico/config/agenda`));
  await assertFails(gravar("conteudo", `${E}/pessoal/basico/config/agenda`));
});

test("fora do espaço da Hyper: nada (backup antigo users/{uid} e espaços novos)", async () => {
  await assertFails(gravar("basico", "users/basico/clientes/c1"));
  await assertFails(ler("basico", "users/basico/clientes/c1"));
  await assertFails(setDoc(doc(como("estranho"), "espacos/outro"), { dono: "estranho" }));
  await assertFails(ler("estranho", "espacos/outro"));
  await assertFails(setDoc(doc(como("estranho"), "espacos/hyper/erros/e1"), { msg: "x", detalhe: "", rota: "", uid: "estranho", email: "", navegador: "", em: 1 }));
  await assertFails(setDoc(doc(como("novo9"), `${E}/membros/novo9`), { nome: "Novo", papel: "basico", permissoes: [], status: "pendente", lixo: "x".repeat(100) }));
});

test("convite: a pessoa convidada entra liberada, exatamente com o que o administrador definiu", async () => {
  const token = { email: "Nova@x.com", email_verified: true };
  const base = { nome: "Nova", email: "nova@x.com", papel: "basico", permissoes: ["conteudo"], acessoClientes: "alguns", clientes: ["c1"], status: "ativo" };
  await assertFails(setDoc(doc(como("nova", token), `${E}/membros/nova`), { ...base, papel: "admin" }));
  await assertFails(setDoc(doc(como("nova", token), `${E}/membros/nova`), { ...base, clientes: ["c1", "c2"] }));
  await assertFails(setDoc(doc(como("outra", { email: "outra@x.com", email_verified: true }), `${E}/membros/outra`), { ...base, email: "outra@x.com" }));
  await assertSucceeds(getDoc(doc(como("nova", token), `${E}/convites/nova@x.com`)));
  await assertFails(getDoc(doc(como("outra", { email: "outra@x.com", email_verified: true }), `${E}/convites/nova@x.com`)));
  await assertSucceeds(setDoc(doc(como("nova", token), `${E}/membros/nova`), base));
  await assertSucceeds(deleteDoc(doc(como("nova", token), `${E}/convites/nova@x.com`)));
});

test("convites: só administrador cria", async () => {
  await assertSucceeds(gravar("admin", `${E}/convites/fulano@x.com`, { email: "fulano@x.com", papel: "admin", permissoes: [] }));
  await assertFails(gravar("conteudo", `${E}/convites/fulano@x.com`, { email: "fulano@x.com", papel: "admin", permissoes: [] }));
});

test("acesso só a alguns clientes", async () => {
  const db = como("luisa");
  await assertSucceeds(ler("luisa", `${E}/clientes/c1`));
  await assertFails(ler("luisa", `${E}/clientes/c2`));
  await assertSucceeds(ler("luisa", `${E}/tarefas/t1`));
  await assertSucceeds(ler("luisa", `${E}/tarefas/t3`));
  await assertFails(ler("luisa", `${E}/tarefas/t2`));
  await assertSucceeds(getDocs(query(collection(db, `${E}/tarefas`), where("clienteId", "in", ["c1", ""]))));
  // Sem filtro: ou a leitura é negada, ou não traz nada de outro cliente
  const tudo = await getDocs(collection(db, `${E}/tarefas`)).catch(() => null);
  assert.ok(!tudo || tudo.docs.every((d) => d.data().clienteId !== "c2"), "vazou tarefa de outro cliente");
  const clientes = await getDocs(collection(db, `${E}/clientes`)).catch(() => null);
  assert.ok(!clientes || clientes.docs.every((d) => d.id !== "c2"), "vazou outro cliente");
  const lancamentos = await getDocs(collection(db, `${E}/financeiro`)).catch(() => null);
  assert.ok(!lancamentos || lancamentos.docs.every((d) => d.data().clienteId === "c1"), "vazou lançamento de outro cliente");
  await assertFails(gravar("luisa", `${E}/tarefas/t9`, { titulo: "x", clienteId: "c2" }));
  await assertSucceeds(gravar("luisa", `${E}/tarefas/t9`, { titulo: "x", clienteId: "c1" }));
  await assertFails(updateDoc(doc(db, `${E}/tarefas/t1`), { clienteId: "c2" }));
  // Financeiro é só de administrador, mesmo com a área marcada
  await assertFails(ler("luisa", `${E}/contratos/c1`));
  await assertFails(ler("luisa", `${E}/contratos/c2`));
  await assertFails(ler("luisa", `${E}/financeiro/f1`));
  await assertFails(ler("luisa", `${E}/financeiro/d1`));
  await assertFails(getDocs(query(collection(db, `${E}/financeiro`), where("clienteId", "in", ["c1"]))));
  await assertSucceeds(ler("luisa", `${E}/clientes/c1/artes/a1`));
  await assertFails(gravar("luisa", `${E}/clientes/c2`));
  // Quem vê todos continua lendo a coleção inteira
  await assertSucceeds(getDocs(collection(como("basico"), `${E}/tarefas`)));
  await assertSucceeds(getDocs(collection(como("admin"), `${E}/financeiro`)));
});

test("comercial (preços, despesas fixas, modelo de contrato): só administrador", async () => {
  await assertSucceeds(ler("admin", `${E}/config/comercial`));
  for (const quem of ["basico", "conteudo", "trafego", "financeiro", "luisa"]) await assertFails(ler(quem, `${E}/config/comercial`));
  await assertFails(gravar("financeiro", `${E}/config/comercial`, { reserva: 0 }));
  await assertSucceeds(gravar("admin", `${E}/config/comercial`, { reserva: 25 }));
});

test("configuração de e-mail: só administrador", async () => {
  await assertSucceeds(ler("admin", `${E}/config/email`));
  await assertFails(ler("conteudo", `${E}/config/email`));
  await assertSucceeds(ler("basico", `${E}/config/equipe`));
});

test("comentários: quem vê a tarefa comenta; quem não vê o cliente, não", async () => {
  await assertSucceeds(setDoc(doc(como("basico"), `${E}/tarefas/t1/atividade/a1`), { tipo: "comentario", texto: "Oi @Luisa", uid: "basico", nome: "B", em: 1 }));
  await assertFails(setDoc(doc(como("basico"), `${E}/tarefas/t1/atividade/a2`), { tipo: "comentario", texto: "fingindo", uid: "outro", nome: "B", em: 1 }));
  await assertSucceeds(getDocs(collection(como("luisa"), `${E}/tarefas/t1/atividade`)));
  await assertFails(getDocs(collection(como("luisa"), `${E}/tarefas/t2/atividade`)));
  await assertFails(setDoc(doc(como("luisa"), `${E}/tarefas/t2/atividade/a3`), { tipo: "comentario", texto: "x", uid: "luisa", nome: "L", em: 1 }));
  await assertFails(deleteDoc(doc(como("luisa"), `${E}/tarefas/t1/atividade/a1`)));
  await assertSucceeds(deleteDoc(doc(como("basico"), `${E}/tarefas/t1/atividade/a1`)));
});

test("lixeira: quem exclui guarda a cópia; só o administrador vê", async () => {
  const item = { colecao: "tarefas", idOriginal: "t1", dados: { titulo: "Tarefa" }, clienteId: "c1", titulo: "Tarefa", excluidoEm: 1, excluidoPor: "B", excluidoPorUid: "basico" };
  await assertSucceeds(setDoc(doc(como("basico"), `${E}/lixeira/tarefas__t1`), item));
  await assertFails(setDoc(doc(como("basico"), `${E}/lixeira/tarefas__x`), { ...item, excluidoPorUid: "admin" }));
  await assertFails(ler("basico", `${E}/lixeira/tarefas__t1`));
  await assertSucceeds(ler("admin", `${E}/lixeira/tarefas__t1`));
  await assertSucceeds(deleteDoc(doc(como("basico"), `${E}/lixeira/tarefas__t1`)));
});

test("lixeira: excluir de novo um item recriado com o mesmo id (cópia com nome único)", async () => {
  const item = { colecao: "tarefas", idOriginal: "t2", dados: { titulo: "Post" }, clienteId: "c1", titulo: "Post", excluidoEm: 1, excluidoPor: "A", excluidoPorUid: "admin" };
  await assertSucceeds(setDoc(doc(como("admin"), `${E}/lixeira/tarefas__t2__1`), item));
  // O jeito antigo (nome fixo): a segunda exclusão grava por cima da cópia, e as regras barram
  await assertSucceeds(setDoc(doc(como("admin"), `${E}/lixeira/tarefas__t2`), item));
  await assertFails(setDoc(doc(como("admin"), `${E}/lixeira/tarefas__t2`), { ...item, excluidoEm: 2 }));
  // O jeito novo: cada exclusão tem a própria cópia
  await assertSucceeds(setDoc(doc(como("admin"), `${E}/lixeira/tarefas__t2__2`), { ...item, excluidoEm: 2 }));
});

test("registro de erros: grava o próprio, só o administrador lê", async () => {
  const erro = { msg: "Falhou", detalhe: "pilha", rota: "#/hoje", uid: "pendente", email: "p@x.com", navegador: "Chrome", em: 1 };
  await assertSucceeds(setDoc(doc(como("pendente"), `${E}/erros/e1`), erro));
  await assertFails(setDoc(doc(como("pendente"), `${E}/erros/e2`), { ...erro, uid: "outro" }));
  await assertFails(setDoc(doc(como("pendente"), `${E}/erros/e3`), { ...erro, extra: "x" }));
  await assertFails(ler("basico", `${E}/erros/e1`));
  await assertSucceeds(ler("admin", `${E}/erros/e1`));
});

test("aprovação por link: cliente sem login vê e responde só os posts do link, até expirar", async () => {
  const futuro = Date.now() + 86400000;
  await assertSucceeds(setDoc(doc(como("conteudo"), `${E}/aprovacoes/tok1`), { clienteId: "c1", mes: "2026-11", postIds: ["t1"], posts: [], expiraEm: futuro }));
  await assertFails(setDoc(doc(como("basico"), `${E}/aprovacoes/tok2`), { clienteId: "c1", postIds: [], expiraEm: futuro }));
  await assertFails(setDoc(doc(como("luisa"), `${E}/aprovacoes/tok3`), { clienteId: "c2", postIds: [], expiraEm: futuro }));
  await amb.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `${E}/aprovacoes/velho`), { clienteId: "c1", postIds: ["t1"], expiraEm: Date.now() - 1000 }));
  const anon = como(null);
  await assertSucceeds(getDoc(doc(anon, `${E}/aprovacoes/tok1`)));
  await assertFails(getDocs(collection(anon, `${E}/aprovacoes`)));
  await assertFails(getDoc(doc(anon, `${E}/aprovacoes/velho`)));
  const resposta = { status: "aprovado", comentario: "", nome: "Cliente", em: 1 };
  await assertSucceeds(setDoc(doc(anon, `${E}/aprovacoes/tok1/respostas/t1`), resposta));
  await assertSucceeds(getDocs(collection(anon, `${E}/aprovacoes/tok1/respostas`)));
  await assertFails(setDoc(doc(anon, `${E}/aprovacoes/tok1/respostas/t2`), resposta));
  await assertFails(setDoc(doc(anon, `${E}/aprovacoes/tok1/respostas/t1`), { ...resposta, status: "talvez" }));
  await assertFails(setDoc(doc(anon, `${E}/aprovacoes/tok1/respostas/t1`), { ...resposta, aplicadaEm: 1 }));
  // Legenda editada pelo cliente na revisão: texto de até 5000 caracteres
  await assertSucceeds(setDoc(doc(anon, `${E}/aprovacoes/tok1/respostas/t1`), { ...resposta, copyNova: "Minha legenda" }));
  await assertFails(setDoc(doc(anon, `${E}/aprovacoes/tok1/respostas/t1`), { ...resposta, copyNova: "x".repeat(5001) }));
  await assertFails(setDoc(doc(anon, `${E}/aprovacoes/tok1/respostas/t1`), { ...resposta, copyNova: 123 }));
  await assertFails(setDoc(doc(anon, `${E}/aprovacoes/velho/respostas/t1`), resposta));
  await assertFails(setDoc(doc(anon, `${E}/tarefas/t1`), { titulo: "invadiu" }));
  await assertSucceeds(updateDoc(doc(como("conteudo"), `${E}/aprovacoes/tok1/respostas/t1`), { aplicadaEm: 2 }));
  await assertFails(updateDoc(doc(como("basico"), `${E}/aprovacoes/tok1/respostas/t1`), { aplicadaEm: 3 }));
});

test("resumo diário: a própria pessoa liga e desliga", async () => {
  await assertSucceeds(updateDoc(doc(como("basico"), `${E}/membros/basico`), { resumoDiario: false }));
  await assertSucceeds(updateDoc(doc(como("basico"), `${E}/membros/basico`), { emailAgenda: "pessoal@icloud.com" }));
});

test("cliente: vê só os posts, a marca e o cadastro dele; nada da equipe", async () => {
  const db = como("cli");
  await assertSucceeds(ler("cli", `${E}/clientes/c1`));
  await assertFails(ler("cli", `${E}/clientes/c2`));
  await assertSucceeds(ler("cli", `${E}/membros/cli`));
  await assertFails(ler("cli", `${E}/membros/admin`));
  await assertFails(getDocs(collection(db, `${E}/membros`)));
  await assertSucceeds(ler("cli", `${E}/tarefas/pc1`));
  await assertFails(ler("cli", `${E}/tarefas/t1`)); // tarefa interna do cliente
  await assertFails(ler("cli", `${E}/tarefas/t3`)); // tarefa sem cliente
  await assertSucceeds(getDocs(query(collection(db, `${E}/tarefas`), where("clienteId", "in", ["c1"]), where("tipo", "==", "Conteúdo"))));
  await assertFails(getDocs(query(collection(db, `${E}/tarefas`), where("clienteId", "in", ["c1"]))));
  await assertSucceeds(getDocs(query(collection(db, `${E}/marcas`), where("clienteId", "in", ["c1"]))));
  await assertSucceeds(ler("cli", `${E}/clientes/c1/artes/a1`));
  for (const c of ["contratos/c1", "financeiro/f1", "orcamentos/o1", "contasAds/a1", "manutencoes/x1", "recorrencias/r1", "compromissos/k1", "tarefasArquivo/t0", "config/equipe", "config/openai", "config/clientes", "lixeira/l1"])
    await assertFails(ler("cli", `${E}/${c}`));
  await assertSucceeds(ler("cli", `${E}/config/meta`));
  await assertSucceeds(ler("cli", `${E}/config/listas`));
  await assertSucceeds(ler("cli", `${E}/config/manual`));
  await assertFails(ler("cli", `${E}/campanhas/k1`)); // campanha pode ter condições internas
  await assertFails(gravar("cli", `${E}/clientes/c1`, { nome: "Mudei" }));
  await assertFails(gravar("cli", `${E}/marcas/m1`, { tomDeVoz: "Mudei" }));
});

test("cliente: aprova ou pede ajuste só em post em aprovação e sugere posts como ideia", async () => {
  const db = como("cli");
  const aprovar = { statusConteudo: "aprovado", status: "andamento", aprovacaoCliente: { decisao: "aprovado", nome: "cli", em: 1 }, atualizadoEm: 1 };
  await assertFails(updateDoc(doc(db, `${E}/tarefas/pc1`), { ...aprovar, titulo: "Mudei o tema" }));
  await assertFails(updateDoc(doc(db, `${E}/tarefas/pc1`), { statusConteudo: "publicado", status: "concluido" }));
  await assertSucceeds(updateDoc(doc(db, `${E}/tarefas/pc1`), aprovar));
  await assertFails(updateDoc(doc(db, `${E}/tarefas/pc3`), aprovar)); // não estava em aprovação
  await assertSucceeds(updateDoc(doc(db, `${E}/tarefas/pc2`), { statusConteudo: "producao", status: "andamento", aprovacaoCliente: { decisao: "ajuste", comentario: "Trocar a foto" }, atualizadoEm: 1 }));
  await assertSucceeds(setDoc(doc(db, `${E}/tarefas/pc1/atividade/x1`), { tipo: "comentario", texto: "Ajuste", uid: "cli", nome: "cli", em: 1, mencoes: [] }));
  const ideia = { tipo: "Conteúdo", clienteId: "c1", marcaId: "m1", titulo: "Ideia", dataPublicacao: "", prazo: "", formato: "Reels", rede: "Instagram", copy: "", notas: "", statusConteudo: "ideia", status: "a_fazer", responsavel: "", sugeridoPeloCliente: "cli", criadoEm: 1 };
  await assertSucceeds(setDoc(doc(db, `${E}/tarefas/novo1`), ideia));
  await assertFails(setDoc(doc(db, `${E}/tarefas/novo2`), { ...ideia, statusConteudo: "aprovado", status: "andamento" }));
  await assertFails(setDoc(doc(db, `${E}/tarefas/novo3`), { ...ideia, tipo: "Tráfego pago" }));
  await assertFails(setDoc(doc(db, `${E}/tarefas/novo4`), { ...ideia, clienteId: "c2", marcaId: "" }));
  await assertFails(deleteDoc(doc(db, `${E}/tarefas/pc1`)));
});

test("cliente com uma marca só: não vê as outras marcas do grupo", async () => {
  const db = como("clim");
  await assertSucceeds(ler("clim", `${E}/tarefas/pc1`));
  await assertFails(ler("clim", `${E}/tarefas/pc2`));
  await assertSucceeds(getDocs(query(collection(db, `${E}/tarefas`), where("marcaId", "in", ["m1"]), where("tipo", "==", "Conteúdo"))));
  await assertFails(getDocs(query(collection(db, `${E}/tarefas`), where("clienteId", "in", ["c1"]), where("tipo", "==", "Conteúdo"))));
  await assertSucceeds(ler("clim", `${E}/marcas/m1`));
  await assertFails(ler("clim", `${E}/marcas/m2`));
  await assertSucceeds(getDocs(query(collection(db, `${E}/clientes/c1/artes`), where("marcaId", "in", ["m1"]))));
  await assertFails(ler("clim", `${E}/clientes/c1/artes/a1`)); // criativo sem marca
  await assertFails(updateDoc(doc(db, `${E}/tarefas/pc2`), { statusConteudo: "aprovado", status: "andamento", atualizadoEm: 1 }));
});

test("campanhas: a equipe lê; conteúdo e tráfego criam; básico não grava", async () => {
  await assertSucceeds(ler("basico", `${E}/campanhas/k1`));
  await assertFails(gravar("basico", `${E}/campanhas/k2`, { nome: "X", clienteId: "c1" }));
  await assertSucceeds(gravar("conteudo", `${E}/campanhas/k2`, { nome: "X", clienteId: "c1" }));
  await assertSucceeds(gravar("trafego", `${E}/campanhas/k3`, { nome: "Y", clienteId: "c1" }));
  await assertFails(ler("pendente", `${E}/campanhas/k1`));
});
