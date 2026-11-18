// Ajustes (só administradores): e-mails automáticos, OpenAI, importação de marcas e da planilha, backup.
import { el, formulario, confirmar, avisar, abrirModal, hojeISO, addDias, vazio, normalizar, baixar } from "../ui.js";
import { dados, criar, atualizar, excluir, gravarEmLote, novoId, opcoesClientes, nomeCliente, clientesAtivos } from "../db.js";
import { cabecalho } from "./componentes.js";
import { analisarPlanilha } from "../importacao.js";
import { configOpenAI, salvarConfigOpenAI, MODELO_PADRAO, MODELO_TEXTO_PADRAO } from "../openai.js";
import { salvarComId, carregarArquivo, listarErros, excluirErro } from "../db.js";
import { ehAdmin } from "../permissoes.js";
import { MODELOS_PADRAO, FORMATOS, TIPOS_TAREFA, TIPO_CONTEUDO } from "../constantes.js";
import { configEmail, emailAtivo, conectarEmail, testarEmail, desconectarEmail } from "../emails.js";


function abrirImportacao() {
  const entrada = el("input", { type: "file", accept: ".csv,text/csv,text/plain" });
  const area = el("div", { class: "importacao-previa" });
  let analise = null;

  entrada.addEventListener("change", async () => {
    const arquivo = entrada.files[0];
    if (!arquivo) return;
    analise = analisarPlanilha(await arquivo.text());
    if (!analise.tarefas.length) { area.replaceChildren(el("p", { class: "erro" }, "Não encontrei tarefas nesse arquivo. Baixe a aba \"Área de Trabalho\" como CSV.")); return; }
    const porStatus = (s) => analise.tarefas.filter((t) => t.status === s).length;
    const corrigidos = analise.nomes.filter((n) => n.original !== n.canonico);
    const clientesNovos = [...new Set(analise.tarefas.map((t) => t.cliente).filter(Boolean))]
      .filter((n) => !dados.clientes.some((c) => normalizar(c.nome) === normalizar(n)));
    area.replaceChildren(el("div", {},
      el("p", {}, el("strong", {}, `${analise.tarefas.length} tarefas encontradas: `),
        `${porStatus("a_fazer")} a fazer, ${porStatus("andamento")} em andamento, ${porStatus("concluido")} concluídas.`),
      el("p", {}, `${analise.tarefas.filter((t) => t.checklist.length).length} tarefas com várias entregas viraram checklist.`),
      corrigidos.length ? [el("p", {}, el("strong", {}, "Nomes de cliente corrigidos:")),
        el("ul", {}, corrigidos.map((n) => el("li", {}, `"${n.original}" → ${n.canonico} (${n.qtd})`)))] : null,
      clientesNovos.length ? el("p", {}, el("strong", {}, `${clientesNovos.length} clientes serão criados: `), clientesNovos.join(", ")) : null,
      el("p", { class: "subtitulo" }, "Importar de novo o mesmo arquivo não duplica tarefas."),
      botaoImportar));
  });

  const botaoImportar = el("button", {
    class: "destaque", onClick: async () => {
      botaoImportar.disabled = true;
      try {
        // 1) Clientes
        const mapa = Object.fromEntries(dados.clientes.map((c) => [normalizar(c.nome), c.id]));
        const cores = ["#4E2CA3", "#592C85", "#16626A", "#606060", "#C98A00", "#2D6CDF", "#B4415A", "#2E8B57"];
        let i = dados.clientes.length;
        const novosClientes = [];
        for (const nome of [...new Set(analise.tarefas.map((t) => t.cliente).filter(Boolean))]) {
          if (mapa[normalizar(nome)]) continue;
          const qtd = analise.tarefas.filter((t) => t.cliente === nome).length;
          const recente = analise.tarefas.some((t) => t.cliente === nome && t.prazo >= addDias(hojeISO(), -90));
          const id = novoId("clientes");
          novosClientes.push({ id, nome, cor: cores[i++ % cores.length], ativo: recente || qtd > 5, servicos: [], criadoEm: Date.now() });
          mapa[normalizar(nome)] = id;
        }
        botaoImportar.textContent = `Criando ${novosClientes.length} clientes...`;
        if (novosClientes.length) await gravarEmLote("clientes", novosClientes);
        // 2) Tarefas
        const itens = analise.tarefas.map(({ cliente, ...t }) => ({ ...t, clienteId: mapa[normalizar(cliente)] || "", criadoEm: Date.now() }));
        await gravarEmLote("tarefas", itens, (feitas, total) => { botaoImportar.textContent = `Importando ${feitas}/${total}...`; });
        avisar(`Importação concluída: ${itens.length} tarefas.`);
        fechar();
        location.hash = "#/clientes";
      } catch (e) {
        console.error(e);
        avisar("Erro ao importar: " + e.message, "erro");
        botaoImportar.disabled = false;
        botaoImportar.textContent = "Importar";
      }
    }
  }, "Importar");

  const fechar = abrirModal("Importar planilha Fluxo de Trabalho", el("div", {},
    el("ol", { class: "passos" },
      el("li", {}, "Abra a planilha no Google Sheets."),
      el("li", {}, "Vá em Arquivo → Fazer download → Valores separados por vírgula (.csv)."),
      el("li", {}, "Escolha o arquivo baixado aqui embaixo e confira o resumo.")),
    entrada, area), { largo: true });
}

async function baixarBackup() {
  await carregarArquivo(); // inclui as tarefas arquivadas
  baixar(new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), ...dados }, null, 2)], { type: "application/json" }), `hyper-backup-${hojeISO()}.json`);
}

export function render() {
  return el("div", { class: "tela" },
    cabecalho("Ajustes", "E-mails automáticos, OpenAI, importação e backup. Sua Google Agenda fica em Minha conta (clique no seu nome)."),

    blocoEmail(),
    blocoModelos(),
    blocoErros(),
    ehAdmin() ? blocoOpenAI() : null,

    ehAdmin() ? blocoImportarMarcas() : null,

    ehAdmin() ? el("section", { class: "bloco" },
      el("h2", {}, "Importar planilha"),
      el("p", {}, "Traga o histórico da planilha Fluxo de Trabalho: clientes, tarefas e entregas."),
      el("button", { onClick: abrirImportacao }, "Importar CSV da planilha")) : null,

    ehAdmin() ? el("section", { class: "bloco" },
      el("h2", {}, "Backup"),
      el("p", {}, `${dados.tarefas.length} tarefas · ${dados.clientes.length} clientes · ${dados.compromissos.length} compromissos · ${dados.financeiro.length} lançamentos`),
      el("button", { class: "secundario", onClick: baixarBackup }, "Baixar backup (.json)")) : null);
}

function blocoOpenAI() {
  const cfg = configOpenAI();
  const chave = el("input", { id: "openai-chave", type: "password", placeholder: cfg.chave ? "•••••••• (já cadastrada — cole outra para trocar)" : "sk-...", autocomplete: "off" });
  const modelo = el("input", { id: "openai-modelo", type: "text", value: cfg.modelo || MODELO_PADRAO });
  const modeloTexto = el("input", { id: "openai-modelo-texto", type: "text", value: cfg.modeloTexto || MODELO_TEXTO_PADRAO });
  return el("section", { class: "bloco" },
    el("h2", {}, "OpenAI (imagens e sugestões de melhoria)"),
    el("p", {}, cfg.chave ? `✓ Chave cadastrada (termina em ${cfg.chave.slice(-4)}).` : "Cole a chave da API da OpenAI para gerar imagens no menu Criar."),
    el("ol", { class: "passos" },
      el("li", {}, "Acesse platform.openai.com → API keys → Create new secret key."),
      el("li", {}, "Adicione saldo em Billing (cada imagem custa alguns centavos de dólar)."),
      el("li", {}, "Cole a chave aqui e salve.")),
    el("div", { class: "form-grade" },
      el("label", { class: "campo metade", for: "openai-chave" }, el("span", {}, "Chave da API"), chave),
      el("label", { class: "campo metade", for: "openai-modelo" }, el("span", {}, "Modelo de imagem"), modelo),
      el("label", { class: "campo metade", for: "openai-modelo-texto" }, el("span", {}, "Modelo de texto (sugestões de melhoria)"), modeloTexto)),
    el("p", { class: "subtitulo" }, "A chave fica guardada só na sua conta, protegida pelas regras do banco. Não compartilhe prints desta tela com a chave aparecendo."),
    el("div", { class: "acoes" },
      el("button", { onClick: async () => {
        const nova = chave.value.trim() || cfg.chave;
        if (!nova) { avisar("Cole a chave.", "erro"); return; }
        await salvarConfigOpenAI({ chave: nova, modelo: modelo.value, modeloTexto: modeloTexto.value });
        avisar("Configuração da OpenAI salva.");
      } }, "Salvar"),
      cfg.chave ? el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar("Remover a chave da OpenAI?")) { await salvarConfigOpenAI({ chave: "", modelo: modelo.value, modeloTexto: modeloTexto.value }); avisar("Chave removida."); }
      } }, "Remover chave") : null));
}


const CAMPOS_MARCA = ["tomDeVoz", "persona", "publico", "estiloVisual", "identidadeVisual", "fontes", "observacoes", "descricao", "instagram", "linkDrive", "linkCanva", "paleta"];
const ROTULO_CAMPO = { tomDeVoz: "tom de voz", persona: "persona", publico: "público", estiloVisual: "estilo de imagem", identidadeVisual: "diagramação", fontes: "fontes", observacoes: "observações", descricao: "sobre a marca", instagram: "Instagram", linkDrive: "Drive", linkCanva: "Canva", paleta: "paleta" };
const preenchido = (x) => (Array.isArray(x) ? x.filter(Boolean).length : String(x ?? "").trim());

/**
 * Importa definições de marca (arquivo .json preparado pelo Claude a partir do ChatGPT).
 * Cada item: { cliente, marca?, tomDeVoz, persona, ... }. Sem "marca" (ou marca = nome do cliente),
 * vai para a identidade do próprio cliente; com "marca", cria ou atualiza a marca dentro do cliente.
 */
function blocoImportarMarcas() {
  const entrada = el("input", { type: "file", accept: ".json,application/json" });
  const previa = el("div", { class: "importacao-previa" });
  entrada.addEventListener("change", async () => {
    const arquivo = entrada.files[0];
    if (!arquivo) return;
    let lista;
    try { lista = JSON.parse(await arquivo.text()); if (!Array.isArray(lista)) lista = lista.marcas || lista.clientes || []; }
    catch { previa.replaceChildren(el("p", { class: "erro" }, "Arquivo inválido. Use o .json que o Claude preparou.")); return; }
    const itens = lista.map((m) => {
      const nomeCli = m.cliente || m.nome || "";
      const cliente = dados.clientes.find((c) => normalizar(c.nome) === normalizar(nomeCli));
      const nomeMarca = m.marca && normalizar(m.marca) !== normalizar(nomeCli) ? m.marca : "";
      const marca = nomeMarca && cliente ? (dados.marcas || []).find((x) => x.clienteId === cliente.id && normalizar(x.nome) === normalizar(nomeMarca)) : null;
      const campos = CAMPOS_MARCA.filter((k) => preenchido(m[k]));
      return { m, nomeCli, cliente, nomeMarca, marca, campos };
    });
    const sobrescrever = el("input", { type: "checkbox", id: "marcas-sobrescrever" });
    const destino = ({ nomeCli, cliente, nomeMarca, marca }) => nomeMarca
      ? `${cliente ? cliente.nome : `${nomeCli} (cliente novo)`} › ${marca ? marca.nome : `${nomeMarca} (marca nova)`}`
      : cliente ? cliente.nome : `${nomeCli} (cliente novo)`;
    previa.replaceChildren(el("div", {},
      el("ul", {}, itens.map((i) => el("li", {},
        el("strong", {}, destino(i)), ": ", i.campos.map((k) => ROTULO_CAMPO[k]).join(", ") || "nada para importar"))),
      el("label", { class: "check-inline", for: "marcas-sobrescrever" }, sobrescrever, "Substituir o que já está preenchido (sem marcar, só preenche campos vazios)"),
      el("div", { class: "acoes" }, el("button", { class: "destaque", onClick: async (e) => {
        e.currentTarget.disabled = true;
        let n = 0;
        const criados = {};
        try {
          for (const { m, nomeCli, cliente, nomeMarca, marca, campos } of itens) {
            const atual = marca || (!nomeMarca ? cliente : null);
            const v = {};
            for (const k of campos) if (sobrescrever.checked || !atual || !preenchido(atual[k])) v[k] = m[k];
            if (v.paleta) v.cor = v.paleta[0];
            let clienteId = cliente?.id || criados[normalizar(nomeCli)];
            if (!clienteId) {
              clienteId = (await criar("clientes", { nome: nomeCli, ativo: true, servicos: [], ...(nomeMarca ? {} : v) })).id;
              criados[normalizar(nomeCli)] = clienteId;
              if (!nomeMarca) { n++; continue; }
            }
            if (!Object.keys(v).length && (marca || !nomeMarca)) continue;
            if (!nomeMarca) await atualizar("clientes", clienteId, v);
            else if (marca) await atualizar("marcas", marca.id, v);
            else await criar("marcas", { nome: nomeMarca, clienteId, ativo: true, paleta: [], criadoEm: Date.now(), ...v });
            n++;
          }
          avisar(`${n} cliente(s)/marca(s) atualizados. Revise cada um na aba Marca.`);
        } catch (erro) { avisar("Parou no meio: " + erro.message, "erro"); }
        previa.replaceChildren();
        entrada.value = "";
      } }, "Importar definições"))));
  });
  return el("section", { class: "bloco" },
    el("h2", {}, "Importar definições de marca"),
    el("p", {}, "Tom de voz, persona, público, identidade e cores de cada cliente e de cada marca dele, a partir do arquivo .json que o Claude monta com as suas conversas e agentes do ChatGPT."),
    entrada, previa);
}

/** E-mails automáticos pelo Gmail da Hyper (Google Apps Script em docs/email/Codigo.gs). */
function blocoEmail() {
  const cfg = configEmail();
  const url = el("input", { id: "email-url", type: "url", placeholder: "https://script.google.com/macros/s/.../exec", value: cfg.url || "" });
  const codigo = "https://github.com/hyperestrategiadigital/app/blob/main/docs/email/Codigo.gs";
  return el("section", { class: "bloco" },
    el("h2", {}, "E-mails automáticos"),
    emailAtivo()
      ? el("p", {}, el("span", { class: "etiqueta ok" }, "Conectado"), ` Os e-mails saem de ${cfg.conta || "a conta que instalou o script"}: convite para quem você adiciona, aviso de acesso liberado e aviso aos administradores quando alguém pede acesso.`)
      : el("p", {}, "Para o app mandar e-mails (convites, acesso liberado, pedidos de acesso), instale uma vez o script de e-mail na conta Google da Hyper. Ele envia pelo Gmail dela, sem custo (até 100 e-mails por dia)."),
    el("details", { class: "passo-a-passo", open: !emailAtivo() },
      el("summary", {}, "Como instalar (5 minutos)"),
      el("ol", { class: "passos" },
        el("li", {}, "Logado na conta da Hyper, abra ", el("a", { href: "https://script.google.com/home/projects/create", target: "_blank", rel: "noopener" }, "script.google.com → Novo projeto"), "."),
        el("li", {}, "Apague o texto que aparece, copie o código de ", el("a", { href: codigo, target: "_blank", rel: "noopener" }, "docs/email/Codigo.gs"), " (botão Copiar) e cole. Salve (Ctrl+S)."),
        el("li", {}, "Clique em Implantar → Nova implantação → engrenagem → App da Web. Executar como: Eu. Quem pode acessar: Qualquer pessoa. Implantar."),
        el("li", {}, "Autorize com a conta da Hyper (se aparecer \"app não verificado\": Avançado → Acessar). Copie a URL do app da Web."),
        el("li", {}, "Cole a URL aqui embaixo e clique em Conectar."))),
    el("label", { class: "campo", for: "email-url" }, el("span", {}, "URL do app da Web"), url),
    el("div", { class: "acoes" },
      el("button", { class: emailAtivo() ? "secundario" : "destaque", onClick: async (e) => {
        e.currentTarget.disabled = true;
        try { const conta = await conectarEmail(url.value); avisar(`E-mails conectados${conta ? ` (${conta})` : ""}.`); }
        catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
      } }, emailAtivo() ? "Conectar de novo" : "Conectar"),
      emailAtivo() ? el("button", { class: "secundario", onClick: async (e) => {
        e.currentTarget.disabled = true;
        try { const r = await testarEmail(); avisar(`E-mail de teste enviado para você. Restam ${r.restantes ?? "?"} envios hoje.`); }
        catch (erro) { avisar(erro.message, "erro"); }
        e.currentTarget.disabled = false;
      } }, "Enviar e-mail de teste") : null,
      emailAtivo() ? el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar("Desligar os e-mails automáticos?")) { await desconectarEmail(); avisar("E-mails desligados."); }
      } }, "Desligar") : null));
}

/** Erros que aconteceram com alguém da equipe (para diagnosticar sem depender de print). */
function blocoErros() {
  const lista = el("div", { class: "lista-erros" });
  let erros = [];
  const fmt = (e) => `${new Date(e.em).toLocaleString("pt-BR")} · ${e.email || "?"} · ${e.rota || "-"}\n${e.msg}${e.detalhe ? `\n${e.detalhe}` : ""}`;
  const carregar = async (botao) => {
    botao.disabled = true;
    try {
      erros = await listarErros();
      lista.replaceChildren(...(erros.length ? [
        el("div", { class: "acoes" },
          el("button", { class: "secundario mini", onClick: async () => { await navigator.clipboard.writeText(erros.map(fmt).join("\n\n")).catch(() => {}); avisar("Copiado. Cole na conversa com o Claude."); } }, "Copiar todos para o Claude"),
          el("button", { class: "perigo-texto", onClick: async () => { for (const e of erros) await excluirErro(e.id); lista.replaceChildren(el("p", { class: "subtitulo" }, "Lista limpa.")); } }, "Limpar lista")),
        ...erros.slice(0, 50).map((e) => el("details", { class: "erro-item" },
          el("summary", {}, el("strong", {}, e.msg.slice(0, 120)), el("span", { class: "subtitulo" }, ` · ${e.email || "?"} · ${new Date(e.em).toLocaleString("pt-BR")}`)),
          el("pre", {}, fmt(e))))
      ] : [el("p", { class: "subtitulo" }, "Nenhum erro registrado nos últimos 30 dias. 🎉")]));
    } catch (erro) { avisar(erro.message, "erro"); }
    botao.disabled = false;
  };
  return el("section", { class: "bloco" },
    el("h2", {}, "Erros recentes"),
    el("p", {}, "Quando algo dá errado para alguém da equipe, o app guarda o erro aqui por 30 dias. Se algo estranho acontecer, copie e mande para o Claude."),
    el("button", { class: "secundario", onClick: (e) => carregar(e.currentTarget) }, "Ver erros"),
    lista);
}

/** Modelos de checklist por formato de post e por tipo de tarefa (um passo por linha). */
function blocoModelos() {
  const meus = dados.config.find((c) => c.id === "modelos")?.modelos || {};
  const chaves = [...FORMATOS.filter((f) => f !== "Outro"), ...TIPOS_TAREFA.filter((t) => ![TIPO_CONTEUDO, "Reunião", "Outro"].includes(t))];
  const areas = {};
  const linhas = chaves.map((k) => {
    const a = el("textarea", { rows: 3, id: `modelo-${k}`, placeholder: "Um passo por linha (vazio = sem checklist)" });
    a.value = (meus[k] ?? MODELOS_PADRAO[k] ?? []).join("\n");
    areas[k] = a;
    return el("label", { class: "campo", for: a.id }, el("span", {}, FORMATOS.includes(k) ? `Post · ${k}` : `Tarefa · ${k}`), a);
  });
  return el("section", { class: "bloco" },
    el("h2", {}, "Modelos de checklist"),
    el("p", {}, "Tarefa ou post novo já nasce com estes passos (pelo formato do post ou pelo tipo da tarefa). Dá para mudar em cada tarefa."),
    el("details", {}, el("summary", {}, "Editar modelos"),
      el("div", { class: "form-grade" }, linhas),
      el("div", { class: "acoes" }, el("button", { onClick: async () => {
        const modelos = Object.fromEntries(Object.entries(areas).map(([k, a]) => [k, a.value.split("\n").map((l) => l.trim()).filter(Boolean)]));
        await salvarComId("config", "modelos", { modelos });
        avisar("Modelos salvos.");
      } }, "Salvar modelos"))));
}
