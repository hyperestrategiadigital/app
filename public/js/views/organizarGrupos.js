// Organizar grupos e marcas (.json preparado pelo Claude): transforma clientes em grupos com as marcas certas.
// Formato: { tipo: "estrutura-hyper", grupos: [{ cliente, procurar: [nomes], moverPostsSemMarca, marcas: [
//   { nome, principal?, cor?, aliases?: [nomes], juntarCliente?: [nomes de clientes que viram esta marca] } ] }] }
// Para cada grupo:
//  - acha o cliente (pelo nome ou pelos nomes em "procurar") e renomeia para "cliente";
//  - cada marca: se já existe (pelo nome ou aliases) é usada; se existe um cliente separado com esse nome,
//    ele vira a marca (posts, tarefas, compromissos, rotinas, lançamentos, contas e criativos vêm junto);
//    senão a marca é criada;
//  - a marca principal recebe a identidade que estava no cliente (só nos campos vazios);
//  - com moverPostsSemMarca, os posts sem marca (menos os do planejamento importado) vão para a marca principal.
// Rodar de novo não duplica nada.
import { el, avisar, abrirModal, normalizar } from "../ui.js";
import { dados, porId, atualizar, salvarComId, gravarEmLote, marcasDo, CAMPOS_IDENTIDADE } from "../db.js";
import { TIPO_CONTEUDO } from "../constantes.js";
import { juntarUm } from "./marca.js";

const chave = (s) => normalizar(s).replace(/[^a-z0-9]/g, "");
const ativos = () => dados.clientes.filter((c) => c.ativo !== false);
const acharCliente = (nomes) => { for (const n of nomes) { const c = ativos().find((x) => chave(x.nome) === chave(n)); if (c) return c; } return null; };

/** O que vai acontecer com um grupo (para mostrar antes de fazer). */
function planejar(g) {
  const cliente = acharCliente([g.cliente, ...(g.procurar || [])]);
  const marcas = (g.marcas || []).map((m) => {
    const nomes = [m.nome, ...(m.aliases || [])].map(chave);
    const existente = cliente ? (dados.marcas || []).find((x) => x.clienteId === cliente.id && nomes.includes(chave(x.nome))) : null;
    // Um cliente solto com o nome da marca (ou em juntarCliente) é juntado nela, exista a marca ou não
    const separado = acharCliente([...(m.juntarCliente || []), m.nome, ...(m.aliases || [])]);
    return { ...m, existente, separado: separado && separado.id !== cliente?.id ? separado : null };
  });
  return { g, cliente, marcas };
}

export function abrirOrganizarGrupos() {
  const entrada = el("input", { type: "file", accept: ".json,application/json" });
  const area = el("div", { class: "importacao-previa" });
  let estrutura = null;

  entrada.addEventListener("change", async () => {
    try {
      estrutura = JSON.parse(await entrada.files[0].text());
      if (estrutura.tipo !== "estrutura-hyper" || !Array.isArray(estrutura.grupos)) throw new Error();
    } catch { area.replaceChildren(el("p", { class: "erro" }, "Arquivo inválido. Use o .json de grupos e marcas que o Claude preparou.")); return; }
    const planos = estrutura.grupos.map(planejar);
    area.replaceChildren(
      ...planos.map(({ g, cliente, marcas }) => el("div", { class: "bloco-plano" },
        el("h3", {}, g.cliente),
        el("p", { class: "subtitulo" }, cliente
          ? (chave(cliente.nome) === chave(g.cliente) ? `Cliente "${cliente.nome}" encontrado.` : `Cliente "${cliente.nome}" será renomeado para "${g.cliente}".`)
          : `Cliente não encontrado: "${g.cliente}" será criado.`),
        el("ul", {}, marcas.map((m) => el("li", {}, el("strong", {}, m.nome), m.principal ? " (principal)" : "", " — ",
          m.existente && m.separado ? `já existe; o cliente solto "${m.separado.nome}" é juntado nela (com posts e tarefas)`
            : m.existente ? "já existe" : m.separado ? `o cliente "${m.separado.nome}" vira esta marca (com posts e tarefas)` : "será criada"))),
        g.moverPostsSemMarca ? el("p", { class: "subtitulo" }, "Os posts sem marca vão para a marca principal.") : null)),
      el("div", { class: "acoes" }, el("button", { class: "destaque", onClick: (e) => executar(e.currentTarget, planos) }, "Organizar")));
  });

  async function executar(botao, planos) {
    botao.disabled = true;
    const status = (t) => (botao.textContent = t);
    try {
      for (const plano of planos) {
        const { g } = plano;
        // Recalcula na hora (a tela pode ter mudado)
        let { cliente, marcas } = planejar(g);
        if (!cliente) {
          const id = `cli-${chave(g.cliente)}`;
          await salvarComId("clientes", id, { nome: g.cliente, ativo: true, servicos: [], paleta: [], criadoEm: Date.now() });
          cliente = { id, nome: g.cliente };
        } else if (chave(cliente.nome) !== chave(g.cliente)) await atualizar("clientes", cliente.id, { nome: g.cliente });
        cliente = porId("clientes", cliente.id) || cliente;
        let ordem = 0;
        let principalId = "";
        for (const m of marcas) {
          status(`${g.cliente}: ${m.nome}…`);
          let id = m.existente?.id;
          if (m.separado) {
            id = await juntarUm(cliente, m.separado, status, m.existente || undefined);
            if (chave(m.separado.nome) !== chave(m.nome)) await atualizar("marcas", id, { nome: m.nome });
          }
          if (!id) {
            id = `m-${cliente.id}-${chave(m.nome)}`;
            await salvarComId("marcas", id, { clienteId: cliente.id, nome: m.nome, ativo: true, paleta: m.cor ? [m.cor] : [], cor: m.cor || "", criadoEm: Date.now() });
          }
          const extra = { ordem: ordem++, principal: !!m.principal };
          // A marca principal herda a identidade que estava no cliente (só onde estiver vazio)
          if (m.principal) {
            principalId = id;
            const atual = porId("marcas", id) || {};
            for (const k of CAMPOS_IDENTIDADE) {
              const vazio = !atual[k] || (Array.isArray(atual[k]) && !atual[k].filter(Boolean).length);
              const temNoCliente = cliente[k] && (!Array.isArray(cliente[k]) || cliente[k].filter(Boolean).length);
              if (vazio && temNoCliente) extra[k] = cliente[k];
            }
            if (!atual.instagram && cliente.instagram) extra.instagram = cliente.instagram;
            if (!atual.facebookPageId && cliente.facebookPageId) extra.facebookPageId = cliente.facebookPageId;
          }
          if (m.cor && !(porId("marcas", id)?.paleta || []).length) { extra.paleta = [m.cor]; extra.cor = m.cor; }
          await atualizar("marcas", id, extra);
        }
        if (g.moverPostsSemMarca && principalId) {
          const soltos = dados.tarefas.filter((t) => t.clienteId === cliente.id && t.tipo === TIPO_CONTEUDO && !t.marcaId && t.origem !== "importacao-planejamento");
          status(`${g.cliente}: ${soltos.length} posts para a marca principal…`);
          if (soltos.length) await gravarEmLote("tarefas", soltos.map(({ id, ...t }) => ({ id, ...t, marcaId: principalId })));
        }
      }
      fechar();
      avisar(`Pronto: ${planos.length} grupo(s) organizados. Confira a aba Marca de cada um.`);
      const primeiro = acharCliente([planos[0].g.cliente]);
      if (primeiro) location.hash = `#/clientes/${primeiro.id}`;
    } catch (e) {
      console.error(e);
      avisar("Parou no meio: " + e.message + " Rode de novo: o que já foi feito não se repete.", "erro");
      botao.disabled = false; botao.textContent = "Organizar";
    }
  }

  const fechar = abrirModal("Organizar grupos e marcas", el("div", {},
    el("p", {}, "Escolha o arquivo .json com os grupos e as marcas de cada um. Você vê tudo o que vai acontecer antes de confirmar."),
    entrada, area), { largo: true });
}
