// Aba "Marca" da ficha do cliente. Um cliente pode ter várias marcas (ex.: Grupo Comportamento →
// Comportamento, Integra Culture, MeuCPTO, CuidaTech), cada uma com identidade e linguagem próprias.
// A "marca principal" é a identidade do próprio cliente; as demais ficam em `marcas` e, onde um campo
// estiver vazio, usam o do cliente. Alimenta a copy, o prompt de imagem e o pedido de arte no Canva.
import { el, avisar, linkExterno, campoCor, abrirModal, confirmar, formulario, fecharModais } from "../ui.js";
import { dados, atualizar, criar, excluir, porId, marcasDo, salvarComId, gravarEmLote, contrato, listarSub, salvarSub, identidade, carregarArquivo } from "../db.js";
import { gerarTexto, temChave } from "../openai.js";
import { ehAdmin, pode } from "../permissoes.js";
import { caminhoArtes } from "../arquivos.js";

// Texto digitado e ainda não salvo sobrevive às atualizações de tela
const rascunhos = new Map();

/** Onde gravar: o próprio cliente (marca principal) ou um documento de `marcas`. */
const alvoDe = (c, marca) => marca
  ? { col: "marcas", id: marca.id, obj: marca, herda: c, nome: marca.nome }
  : { col: "clientes", id: c.id, obj: c, herda: null, nome: c.nome };
const gravar = (alvo, valores) => atualizar(alvo.col, alvo.id, valores);
const herdado = (alvo, campo, dica) => alvo.herda && alvo.herda[campo]
  ? `Vazio: usa o do cliente (${String(alvo.herda[campo]).slice(0, 80)}${String(alvo.herda[campo]).length > 80 ? "…" : ""})` : dica;

function editorCores(alvo) {
  const base = alvo.obj.paleta?.length ? alvo.obj.paleta : alvo.obj.cor ? [alvo.obj.cor] : (alvo.herda?.paleta || ["#4E2CA3"]);
  const paleta = [...base];
  const salvar = async () => { await gravar(alvo, { paleta: paleta.filter(Boolean), cor: paleta[0] }); };
  const demais = el("div", { class: "paleta" });
  const desenharDemais = () => demais.replaceChildren(
    ...paleta.slice(1).map((cor, i) => el("div", { class: "cor" },
      campoCor(cor, (v) => { paleta[i + 1] = v; salvar(); }),
      el("button", { class: "icone", "aria-label": "Remover cor", onClick: () => { paleta.splice(i + 1, 1); desenharDemais(); salvar(); } }, "✕"))),
    el("button", { class: "secundario mini", onClick: () => { paleta.push("#FFFFFF"); desenharDemais(); salvar(); } }, "+ Cor"));
  desenharDemais();
  return el("div", { class: "cores-marca" },
    el("div", { class: "cor-principal" },
      el("h3", {}, "Cor principal"),
      el("p", { class: "subtitulo" }, alvo.herda ? "Identifica os posts desta marca no calendário e nos cartões." : "Usada para identificar o cliente em todo o app (calendário, cartões, PDF)."),
      campoCor(paleta[0], (v) => { paleta[0] = v; salvar(); })),
    el("div", {},
      el("h3", {}, "Demais cores"),
      demais));
}

/** Pede à IA uma versão melhorada do campo e mostra para você decidir. */
async function sugerirMelhoria(alvo, campo, rotulo, textoAtual, aplicar) {
  if (!temChave()) { avisar("Cadastre a chave da OpenAI em Ajustes para usar as sugestões.", "erro"); return; }
  const fechar = abrirModal(`Sugestão de melhoria · ${rotulo}`, el("p", { class: "subtitulo" }, "Pensando…"));
  const c = alvo.herda ? identidade(alvo.herda.id, alvo.id) : alvo.obj;
  const contexto = [
    alvo.herda ? `Marca: ${alvo.nome} (do cliente ${alvo.herda.nome}, que tem outras marcas com identidades diferentes)` : `Cliente: ${c.nome}`,
    c.servicos?.length ? `Serviços contratados: ${c.servicos.join(", ")}` : "",
    c.tomDeVoz && campo !== "tomDeVoz" ? `Tom de voz atual: ${c.tomDeVoz}` : "",
    c.persona && campo !== "persona" ? `Persona atual: ${c.persona}` : "",
    c.publico && campo !== "publico" ? `Público atual: ${c.publico}` : "",
    c.estiloVisual && campo !== "estiloVisual" ? `Estilo de imagem atual: ${c.estiloVisual}` : "",
    alvo.obj.descricao ? `Sobre a marca: ${alvo.obj.descricao}` : "",
    c.observacoes ? `Observações: ${c.observacoes}` : ""
  ].filter(Boolean).join("\n");
  try {
    const sugestao = await gerarTexto({
      sistema: "Você é estrategista de marca e social media sênior de uma agência brasileira de tráfego pago (Hyper). Responda em português do Brasil, de forma prática e aplicável. Devolva SOMENTE o texto melhorado do campo pedido, pronto para colar, sem introdução nem comentários. Use tópicos curtos quando ajudar.",
      pedido: `${contexto}\n\nCampo: ${rotulo}\nTexto atual: ${textoAtual || "(vazio)"}\n\nReescreva e melhore esse campo: deixe mais específico, útil para quem cria conteúdo e anúncios, com exemplos concretos (palavras e expressões a usar e a evitar, quando fizer sentido). Mantenha o que já está certo.`
    });
    fechar();
    const area = el("textarea", { rows: 12 });
    area.value = sugestao;
    const f2 = abrirModal(`Sugestão de melhoria · ${rotulo}`, el("div", {},
      el("p", { class: "subtitulo" }, "Edite se quiser e escolha o que fazer. Nada é salvo sem você clicar."),
      area,
      el("div", { class: "acoes" },
        el("button", { class: "secundario", onClick: async () => { await navigator.clipboard.writeText(area.value).catch(() => {}); avisar("Copiado."); } }, "Copiar"),
        el("span", { class: "espaco" }),
        el("button", { class: "secundario", onClick: () => f2() }, "Descartar"),
        el("button", { class: "destaque", onClick: () => { aplicar(area.value); f2(); } }, "Usar no campo"))), { largo: true });
  } catch (e) {
    fechar();
    avisar("Não consegui gerar a sugestão: " + e.message, "erro");
  }
}

function campoTexto(alvo, campo, rotulo, dica, linhas = 4, { sugestao = false } = {}) {
  const chave = `${alvo.col}|${alvo.id}|${campo}`;
  const area = el("textarea", { rows: linhas, placeholder: herdado(alvo, campo, dica), id: `marca-${campo}` });
  area.value = rascunhos.has(chave) ? rascunhos.get(chave) : (alvo.obj[campo] || "");
  const botao = el("button", { class: "mini", hidden: !rascunhos.has(chave), onClick: async () => {
    rascunhos.delete(chave);
    await gravar(alvo, { [campo]: area.value.trim() });
    avisar("Salvo.");
  } }, "Salvar");
  const marcar = () => { rascunhos.set(chave, area.value); botao.hidden = false; };
  area.addEventListener("input", marcar);
  return el("div", { class: "campo-marca" },
    el("div", { class: "com-acao" }, el("h3", {}, rotulo),
      el("div", { class: "tela-acoes" },
        sugestao ? el("button", { class: "secundario mini", onClick: () => sugerirMelhoria(alvo, campo, rotulo, area.value, (texto) => { area.value = texto; marcar(); }) }, "✨ Sugerir melhoria") : null,
        botao)),
    area);
}

function campoLink(alvo, campo, titulo, explicacao, dica, rotuloAbrir) {
  const chave = `${alvo.col}|${alvo.id}|${campo}`;
  const entrada = el("input", { id: `marca-${campo}`, type: "url", placeholder: herdado(alvo, campo, dica) });
  entrada.value = rascunhos.has(chave) ? rascunhos.get(chave) : (alvo.obj[campo] || "");
  const botao = el("button", { class: "mini", hidden: !rascunhos.has(chave), onClick: async () => {
    rascunhos.delete(chave);
    await gravar(alvo, { [campo]: entrada.value.trim() });
    avisar("Link salvo.");
  } }, "Salvar");
  entrada.addEventListener("input", () => { rascunhos.set(chave, entrada.value); botao.hidden = false; });
  return el("div", { class: "campo-marca" },
    el("div", { class: "com-acao" }, el("h3", {}, titulo), el("div", { class: "tela-acoes" }, botao, linkExterno(alvo.obj[campo] || alvo.herda?.[campo], rotuloAbrir))),
    explicacao ? el("p", { class: "subtitulo" }, explicacao) : null,
    entrada);
}

/* ---------------- Marcas do cliente ---------------- */

export function abrirMarca(clienteId, marca = {}) {
  const editando = !!marca.id;
  return formulario(editando ? `Marca · ${marca.nome}` : "Nova marca", [
    { nome: "nome", rotulo: "Nome da marca", obrigatorio: true, largura: "metade" },
    { nome: "instagram", rotulo: "Instagram", dica: "@perfil", largura: "metade" },
    { nome: "descricao", rotulo: "Sobre a marca", tipo: "textarea", linhas: 3, dica: "O que é, para quem é e como se diferencia das outras marcas do grupo" },
    { nome: "ativo", rotulo: "Marca ativa", tipo: "checkbox", padrao: true }
  ], marca, {
    extras: editando ? [el("button", { type: "button", class: "perigo-texto", onClick: async () => {
      const n = dados.tarefas.filter((t) => t.marcaId === marca.id).length;
      if (!(await confirmar(`Excluir a marca "${marca.nome}"?${n ? ` ${n} post(s)/tarefa(s) dela voltam para a marca principal do cliente.` : ""} Para só esconder, desmarque "Marca ativa".`))) return;
      if (n) await gravarEmLote("tarefas", dados.tarefas.filter((t) => t.marcaId === marca.id).map(({ id, ...t }) => ({ id, ...t, marcaId: "" })));
      await excluir("marcas", marca.id);
      fecharModais();
      avisar("Marca excluída.");
    } }, "Excluir")] : [],
    aoSalvar: async (v) => {
      if (editando) await atualizar("marcas", marca.id, v);
      else {
        await criar("marcas", { ...v, clienteId, paleta: [], criadoEm: Date.now() });
      }
      avisar(editando ? "Marca salva." : "Marca criada. Preencha a identidade dela abaixo.");
    }
  });
}

const CAMPOS_COPIADOS = ["paleta", "cor", "fontes", "tomDeVoz", "persona", "publico", "estiloVisual", "identidadeVisual", "linkDrive", "linkCanva", "instagram", "facebook", "facebookPageId", "linkedin", "tiktok", "youtube", "site"];

/**
 * Transforma outros clientes em marcas deste (ex.: CuidaTech e MeuCPTO viram marcas do Grupo Comportamento).
 * Cada cliente escolhido vira uma marca com a identidade dele; posts, tarefas, compromissos, rotinas,
 * lançamentos, contas de anúncio e criativos passam para este cliente; o cliente antigo fica inativo (não é apagado).
 */
export function juntarClientes(c) {
  const outros = dados.clientes.filter((x) => x.id !== c.id && x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const caixas = outros.map((x) => el("label", { class: "chip-check" }, el("input", { type: "checkbox", value: x.id }), x.nome));
  const status = el("p", { class: "subtitulo" });
  const fechar = abrirModal(`Juntar clientes em ${c.nome}`, el("div", {},
    el("p", {}, "Os clientes marcados viram marcas de ", el("strong", {}, c.nome), ", cada um com a própria identidade (cores, tom de voz, persona…). Posts, tarefas, compromissos, rotinas, lançamentos, contas de anúncio e criativos passam para cá. O cliente antigo fica inativo, não é apagado."),
    el("p", { class: "subtitulo" }, "O contrato (mensalidade) do cliente antigo só é copiado se este cliente ainda não tiver um. Confira depois em Editar."),
    el("div", { class: "multi" }, caixas),
    status,
    el("div", { class: "acoes" },
      el("button", { class: "secundario", onClick: () => fechar() }, "Cancelar"),
      el("button", { class: "destaque", onClick: async (e) => {
        const ids = caixas.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
        if (!ids.length) { avisar("Marque pelo menos um cliente.", "erro"); return; }
        e.currentTarget.disabled = true;
        try {
          for (const id of ids) await juntarUm(c, porId("clientes", id), (msg) => (status.textContent = msg));
          fechar();
          avisar(`${ids.length} cliente(s) agora são marcas de ${c.nome}.`);
        } catch (erro) {
          console.error(erro);
          status.textContent = "";
          avisar("Parou no meio: " + erro.message + " Rode de novo para terminar (o que já foi movido não duplica).", "erro");
          e.currentTarget.disabled = false;
        }
      } }, "Juntar")))), { largo: true });
}

async function juntarUm(destino, origem, progresso) {
  const marcaId = `m-${origem.id}`;
  progresso(`${origem.nome}: criando a marca…`);
  const marca = { clienteId: destino.id, nome: origem.nome, origemClienteId: origem.id, ativo: true, criadoEm: Date.now(), descricao: origem.observacoes || "" };
  for (const k of CAMPOS_COPIADOS) if (origem[k] != null && origem[k] !== "") marca[k] = origem[k];
  marca.paleta ||= origem.cor ? [origem.cor] : [];
  await salvarComId("marcas", marcaId, marca);

  progresso(`${origem.nome}: movendo posts e tarefas…`);
  const mover = (lista, extra = {}) => lista.filter((x) => x.clienteId === origem.id).map(({ id, ...x }) => ({ id, ...x, clienteId: destino.id, ...extra }));
  await gravarEmLote("tarefas", mover(dados.tarefas, { marcaId }));
  await carregarArquivo();
  await gravarEmLote("tarefasArquivo", mover(dados.tarefasArquivo, { marcaId }));
  await gravarEmLote("compromissos", mover(dados.compromissos));
  if (ehAdmin()) await gravarEmLote("recorrencias", mover(dados.recorrencias));
  if (pode("financeiro")) {
    await gravarEmLote("financeiro", mover(dados.financeiro));
    await gravarEmLote("orcamentos", mover(dados.orcamentos));
    const antigo = porId("contratos", origem.id);
    if (antigo && !contrato(destino.id).mensalidade) {
      const { id: _, ...valores } = antigo;
      await salvarComId("contratos", destino.id, { ...valores, clienteId: destino.id });
    }
  }
  if (pode("trafego")) {
    await gravarEmLote("contasAds", mover(dados.contasAds, { marcaId }));
    await gravarEmLote("manutencoes", mover(dados.manutencoes, { marcaId }));
  }
  if (pode("conteudo")) {
    progresso(`${origem.nome}: copiando criativos…`);
    const artes = await listarSub(caminhoArtes(origem.id)).catch(() => []);
    for (const { id, ...a } of artes) await salvarSub(caminhoArtes(destino.id), a, id);
  }
  await atualizar("clientes", origem.id, { ativo: false, viraMarcaDe: destino.id, marcaId });
}

/* ---------------- Aba ---------------- */

export function abaMarca(c, estado = {}, renderizar = () => {}) {
  const marcas = marcasDo(c.id);
  const inativas = (dados.marcas || []).filter((m) => m.clienteId === c.id && m.ativo === false);
  if (estado.marcaSel && !porId("marcas", estado.marcaSel)) estado.marcaSel = "";
  const marca = estado.marcaSel ? porId("marcas", estado.marcaSel) : null;
  const alvo = alvoDe(c, marca);
  const contar = (mid) => dados.tarefas.filter((t) => t.clienteId === c.id && (t.marcaId || "") === mid).length;
  const escolher = (id) => { estado.marcaSel = id; renderizar(); };
  const podeGerir = ehAdmin() || pode("conteudo");

  const seletor = el("div", { class: "marcas-seletor" },
    el("button", { class: `legenda-item ${!marca ? "ativo" : ""}`, style: { "--selo": c.paleta?.[0] || c.cor || "#4E2CA3" }, onClick: () => escolher("") },
      el("span", { class: "bolinha" }), marcas.length ? `${c.nome} (principal)` : c.nome, el("small", {}, contar(""))),
    ...[...marcas, ...inativas].map((m) => el("button", {
      class: `legenda-item ${marca?.id === m.id ? "ativo" : ""}`, style: { "--selo": m.paleta?.[0] || m.cor || "#606060" }, onClick: () => escolher(m.id),
      title: m.ativo === false ? "Marca inativa" : ""
    }, el("span", { class: "bolinha" }), m.nome, m.ativo === false ? " (inativa)" : "", el("small", {}, contar(m.id)))),
    podeGerir ? el("button", { class: "secundario mini", onClick: async () => { await abrirMarca(c.id); } }, "+ Marca") : null,
    ehAdmin() ? el("button", { class: "link", onClick: () => juntarClientes(c) }, "Juntar outros clientes como marcas…") : null);

  return el("div", { class: "aba-marca" },
    seletor,
    !marcas.length ? el("p", { class: "subtitulo" }, "Este cliente tem uma marca só. Se ele tiver marcas com identidades diferentes (ex.: um grupo com várias empresas), crie cada uma em \"+ Marca\": os posts passam a escolher a marca, e a copy, a imagem e o pedido do Canva usam a identidade dela.") : null,
    marca ? el("div", { class: "marca-cabeca" },
      el("div", {},
        el("h3", {}, marca.nome),
        el("p", { class: "subtitulo" }, [marca.instagram, marca.descricao].filter(Boolean).join(" · ") || "Campos vazios usam a identidade do cliente.")),
      podeGerir ? el("button", { class: "secundario mini", onClick: () => abrirMarca(c.id, marca) }, "Editar nome, Instagram e status") : null) : null,
    campoLink(alvo, "linkDrive", "Pasta da marca no Drive",
      "Logos, fontes, manual e criativos de referência ficam nesta pasta. O link vai junto no pedido de arte do Canva.",
      "https://drive.google.com/drive/folders/...", "Abrir pasta ↗"),
    campoLink(alvo, "linkCanva", "Brand kit / pasta no Canva", null, "https://www.canva.com/...", "Abrir no Canva ↗"),
    editorCores(alvo),
    campoTexto(alvo, "fontes", "Fontes", "Ex.: Títulos em Playfair Display Bold; textos em Montserrat. (Os arquivos ficam na pasta do Drive.)", 2),
    campoTexto(alvo, "tomDeVoz", "Tom de voz", "Como a marca fala: próxima, técnica, bem-humorada... palavras que usa e que evita.", 4, { sugestao: true }),
    campoTexto(alvo, "persona", "Persona", "Quem é o cliente ideal: nome fictício, idade, rotina, dores, desejos, objeções.", 5, { sugestao: true }),
    campoTexto(alvo, "publico", "Público-alvo", "Ex.: mulheres 25-45, região de Sorocaba, classe B.", 3, { sugestao: true }),
    campoTexto(alvo, "estiloVisual", "Estilo de imagem",
      "Que tipo de imagem a marca usa? Ex.: fotos reais de pessoas treinando, luz natural, cores vibrantes. Evitar: banco de imagem genérico.", 4, { sugestao: true }),
    campoTexto(alvo, "identidadeVisual", "Identidade visual (diagramação)",
      "Ex.: títulos grandes em caixa alta, muito respiro, elementos geométricos, logo sempre no canto inferior.", 3, { sugestao: true }));
}
