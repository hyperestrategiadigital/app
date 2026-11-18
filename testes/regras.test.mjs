// Testes das regras do Firestore (firestore.rules), rodados no emulador:
//   npm run test:regras
// Garantem que dados sensíveis ficam protegidos no banco, não só escondidos na tela.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

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
    await setDoc(doc(db, `${E}/clientes/c1`), { nome: "Cliente" });
    await setDoc(doc(db, `${E}/marcas/m1`), { nome: "Marca", clienteId: "c1" });
    await setDoc(doc(db, `${E}/tarefas/t1`), { titulo: "Tarefa" });
    await setDoc(doc(db, `${E}/tarefasArquivo/t0`), { titulo: "Antiga" });
    await setDoc(doc(db, `${E}/contratos/c1`), { mensalidade: 1500 });
    await setDoc(doc(db, `${E}/financeiro/f1`), { valor: 1500 });
    await setDoc(doc(db, `${E}/orcamentos/o1`), { valor: 900 });
    await setDoc(doc(db, `${E}/contasAds/a1`), { plataforma: "Meta Ads" });
    await setDoc(doc(db, `${E}/manutencoes/x1`), { acoes: "ajuste" });
    await setDoc(doc(db, `${E}/config/openai`), { chave: "sk-teste" });
    await setDoc(doc(db, `${E}/config/equipe`), { pessoas: [] });
    await setDoc(doc(db, `${E}/recorrencias/r1`), { modelo: "livre" });
    await setDoc(doc(db, `${E}/clientes/c1/artes/a1`), { dados: "data:" });
    await setDoc(doc(db, `${E}/pessoal/basico/config/agenda`), { email: "b@x.com" });
  });
});

const como = (uid) => (uid ? amb.authenticatedContext(uid) : amb.unauthenticatedContext()).firestore();
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
  await assertSucceeds(updateDoc(doc(como("basico"), `${E}/membros/basico`), { nome: "Outro nome" }));
  await assertFails(updateDoc(doc(como("basico"), `${E}/membros/basico`), { papel: "admin" }));
  await assertFails(updateDoc(doc(como("basico"), `${E}/membros/basico`), { permissoes: ["financeiro"] }));
  await assertFails(updateDoc(doc(como("pendente"), `${E}/membros/pendente`), { status: "ativo" }));
  await assertFails(updateDoc(doc(como("conteudo"), `${E}/membros/basico`), { permissoes: ["conteudo"] }));
});

test("administrador e dono liberam acessos", async () => {
  await assertSucceeds(updateDoc(doc(como("admin"), `${E}/membros/pendente`), { status: "ativo", permissoes: ["conteudo"] }));
  await assertSucceeds(updateDoc(doc(como("dono"), `${E}/membros/basico`), { papel: "admin" }));
});

test("básico: vê clientes, marcas e tarefas; não vê valores, contas de anúncio nem a chave da OpenAI", async () => {
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

test("conteúdo: edita clientes e marcas, lê a chave da OpenAI e os criativos; não vê valores", async () => {
  await assertSucceeds(gravar("conteudo", `${E}/clientes/c1`));
  await assertSucceeds(gravar("conteudo", `${E}/marcas/m2`, { nome: "Nova", clienteId: "c1" }));
  await assertSucceeds(ler("conteudo", `${E}/config/openai`));
  await assertSucceeds(gravar("conteudo", `${E}/clientes/c1/artes/a2`, { dados: "data:" }));
  await assertFails(gravar("conteudo", `${E}/config/openai`, { chave: "sk-outra" }));
  for (const c of ["contratos/c1", "financeiro/f1", "contasAds/a1"]) await assertFails(ler("conteudo", `${E}/${c}`));
});

test("financeiro: vê contratos, lançamentos e orçamentos; não vê a chave da OpenAI", async () => {
  for (const c of ["contratos/c1", "financeiro/f1", "orcamentos/o1"]) await assertSucceeds(ler("financeiro", `${E}/${c}`));
  await assertSucceeds(gravar("financeiro", `${E}/financeiro/f2`, { valor: 10 }));
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
  await assertSucceeds(gravar("admin", `${E}/config/openai`, { chave: "sk-nova" }));
  await assertSucceeds(ler("dono", `${E}/contratos/c1`));
});

test("coisas pessoais: só a própria pessoa", async () => {
  await assertSucceeds(ler("basico", `${E}/pessoal/basico/config/agenda`));
  await assertFails(ler("admin", `${E}/pessoal/basico/config/agenda`));
  await assertFails(gravar("conteudo", `${E}/pessoal/basico/config/agenda`));
});

test("backup antigo users/{uid}: só o dono da conta", async () => {
  await assertSucceeds(gravar("basico", "users/basico/clientes/c1"));
  await assertFails(ler("admin", "users/basico/clientes/c1"));
});
