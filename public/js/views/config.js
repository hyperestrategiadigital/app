// Ajustes (só administradores): e-mails automáticos, Meta, OpenAI, importação dos arquivos do Claude e backup.
import { el, formulario, confirmar, avisar, abrirModal, hojeISO, addDias, vazio, normalizar, baixar } from "../ui.js";
import { dados, criar, atualizar, excluir, gravarEmLote, novoId, opcoesClientes, nomeCliente, clientesAtivos } from "../db.js";
import { cabecalho } from "./componentes.js";
import { previaPlanejamento } from "./importarPlanejamento.js";
import { previaImportacao } from "./comercial.js";
import { configOpenAI, salvarConfigOpenAI, MODELO_PADRAO, MODELO_TEXTO_PADRAO } from "../openai.js";
import { salvarComId, carregarArquivo, listarErros, excluirErro } from "../db.js";
import { ehAdmin } from "../permissoes.js";
import { configMeta } from "../meta.js";
import { configAgenda, agendaConectada, testarAgenda } from "../agenda.js";
import { MODELOS_PADRAO, FORMATOS, TIPOS_TAREFA, TIPO_CONTEUDO } from "../constantes.js";
import { configEmail, emailAtivo, conectarEmail, testarEmail, desconectarEmail, backupAgora, resumoAgora } from "../emails.js";


async function baixarBackup() {
  await carregarArquivo(); // inclui as tarefas arquivadas
  baixar(new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), ...dados }, null, 2)], { type: "application/json" }), `hyper-backup-${hojeISO()}.json`);
}

export function render() {
  return el("div", { class: "tela" },
    cabecalho("Ajustes", "E-mails automáticos, OpenAI, importação e backup. Sua Google Agenda fica em Minha conta (clique no seu nome)."),

    blocoEmail(),
    blocoMeta(),
    blocoModelos(),
    blocoErros(),
    ehAdmin() ? blocoOpenAI() : null,

    ehAdmin() ? blocoImportar() : null,

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
function previaMarcas(lista) {
  const previa = el("div", { class: "importacao-previa" });
  let fechar = () => {};
  {
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
      el("div", { class: "acoes" }, el("button", { class: "secundario negar", onClick: () => fechar() }, "Cancelar"), el("button", { class: "confirmar", onClick: async (e) => {
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
        fechar();
      } }, "Importar definições"))));
  }
  fechar = abrirModal("Importar definições de marca", previa, { largo: true });
}

/** Um lugar só para os arquivos .json que o Claude prepara: reconhece o tipo e mostra tudo antes de aplicar. */
function blocoImportar() {
  const entrada = el("input", { id: "importar-arquivo", type: "file", accept: ".json,application/json", hidden: true });
  entrada.addEventListener("change", async () => {
    const arquivo = entrada.files[0];
    entrada.value = "";
    if (!arquivo) return;
    let j;
    try { j = JSON.parse(await arquivo.text()); } catch { avisar("Esse arquivo não é um .json válido.", "erro"); return; }
    if (j.tipo === "planejamento-hyper") previaPlanejamento(j);
    else if (j.tipo === "financeiro-hyper") previaImportacao(j);
    else if (Array.isArray(j) || j.tipo === "marcas-hyper" || j.marcas || j.clientes) previaMarcas(Array.isArray(j) ? j : j.marcas || j.clientes || []);
    else avisar("Não reconheci esse arquivo. Use um .json que o Claude preparou.", "erro");
  });
  return el("section", { class: "bloco" },
    el("h2", {}, "Importar arquivo do Claude"),
    el("p", {}, "Para os arquivos .json que o Claude prepara: planejamento de posts (a partir de prints ou planilhas), definições de marca (tom de voz, persona, cores) e financeiro (contratos, despesas fixas, preços). O app reconhece o tipo e mostra tudo antes de aplicar. Importar de novo não duplica."),
    el("label", { class: "botao-link secundario", for: "importar-arquivo" }, "Escolher arquivo .json", entrada));
}

/** E-mails e automações pelo Google Apps Script da conta da Hyper (docs/email). */
function blocoEmail() {
  const cfg = configEmail();
  const backup = dados.config.find((c) => c.id === "backup") || {};
  const url = el("input", { id: "email-url", type: "url", placeholder: "https://script.google.com/macros/s/.../exec", value: cfg.url || "" });
  const pasta = "https://github.com/hyperestrategiadigital/app/blob/main/docs/email/";
  const kb = (n) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  const acao = (rotulo, fn) => el("button", { class: "secundario", onClick: async (e) => {
    e.currentTarget.disabled = true;
    try { avisar(await fn()); } catch (erro) { avisar(erro.message, "erro"); }
    e.currentTarget.disabled = false;
  } }, rotulo);
  return el("section", { class: "bloco" },
    el("h2", {}, "E-mails e automações"),
    emailAtivo()
      ? el("p", {}, el("span", { class: "etiqueta ok" }, "Conectado"), ` Rodando na conta ${cfg.conta || "da Hyper"}: convites, acesso liberado, avisos de pedidos e menções, resumo diário às 8h para cada pessoa, backup toda segunda às 3h e Google Agenda dos compromissos (a cada 5 minutos, com convite para os participantes).`)
      : el("p", {}, "Instale uma vez o script de automações na conta Google da Hyper. Ele manda os e-mails pelo Gmail dela (até 100 por dia, sem custo), envia o resumo diário às 8h, faz o backup semanal no Drive da Hyper e coloca os compromissos na Google Agenda de cada participante (sem precisar do Google Cloud)."),
    emailAtivo() ? el("p", { class: "subtitulo" }, backup.ultimo
      ? ["Último backup: ", new Date(backup.ultimo).toLocaleString("pt-BR"), ` (${kb(backup.tamanho || 0)}, compactado, sem imagens; ficam os ${backup.guardados || 8} mais recentes). `, el("a", { href: backup.pasta, target: "_blank", rel: "noopener" }, "Abrir a pasta no Drive ↗")]
      : "Backup automático: o primeiro sai na próxima segunda às 3h (ou clique em Fazer backup agora).") : null,
    emailAtivo() ? el("p", { class: "subtitulo" }, agendaConectada()
      ? `Google Agenda: funcionando (última sincronização ${new Date(configAgenda().ultimo).toLocaleString("pt-BR")}, agenda "${configAgenda().calendario || "Hyper · Compromissos"}").`
      : el("span", { class: "erro" }, "Google Agenda: ainda não sincronizou. Clique em Testar agenda para ver o que falta.")) : null,
    el("details", { class: "passo-a-passo", open: !emailAtivo() },
      el("summary", {}, emailAtivo() ? "Como instalar ou atualizar o script" : "Como instalar (5 minutos)"),
      el("ol", { class: "passos" },
        el("li", {}, "Logado na conta da Hyper, abra ", el("a", { href: "https://script.google.com/home/projects/create", target: "_blank", rel: "noopener" }, "script.google.com → Novo projeto"), "."),
        el("li", {}, "Engrenagem (Configurações do projeto) → marque \"Mostrar o arquivo de manifesto appsscript.json\"."),
        el("li", {}, "Volte ao editor, abra appsscript.json e troque tudo pelo conteúdo de ", el("a", { href: pasta + "appsscript.json", target: "_blank", rel: "noopener" }, "appsscript.json"), "."),
        el("li", {}, "Abra Código.gs, apague tudo e cole ", el("a", { href: pasta + "Codigo.gs", target: "_blank", rel: "noopener" }, "Codigo.gs"), " (botão Copiar). Salve (Ctrl+S)."),
        el("li", {}, "Implantar → Nova implantação → engrenagem → App da Web. Executar como: Eu. Quem pode acessar: Qualquer pessoa. Implantar e autorize com a conta da Hyper (se aparecer \"app não verificado\": Avançado → Acessar)."),
        el("li", {}, "Copie a URL do app da Web, cole aqui embaixo e clique em Conectar."),
        el("li", {}, "Para atualizar depois: troque appsscript.json e Código.gs pelo conteúdo novo, salve, Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar. Se o Google pedir, autorize de novo (a agenda é uma permissão nova). Depois clique em Conectar de novo aqui."))),
    el("label", { class: "campo", for: "email-url" }, el("span", {}, "URL do app da Web"), url),
    el("div", { class: "acoes" },
      el("button", { class: emailAtivo() ? "secundario" : "destaque", onClick: async (e) => {
        e.currentTarget.disabled = true;
        try { const conta = await conectarEmail(url.value); avisar(`Automações conectadas${conta ? ` (${conta})` : ""}.`); }
        catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
      } }, emailAtivo() ? "Conectar de novo" : "Conectar"),
      emailAtivo() ? acao("E-mail de teste", async () => { const r = await testarEmail(); return `E-mail de teste enviado para você. Restam ${r.restantes ?? "?"} envios hoje.`; }) : null,
      emailAtivo() ? acao("Meu resumo agora", async () => { await resumoAgora(); return "Resumo do dia enviado para o seu e-mail."; }) : null,
      emailAtivo() ? acao("Testar agenda", async () => { const r = await testarAgenda(); return r.ja ? "A agenda acabou de sincronizar." : `Agenda sincronizada: ${r.criados || 0} criado(s), ${r.atualizados || 0} atualizado(s), ${r.removidos || 0} removido(s)${r.erros ? `, ${r.erros} com erro (veja no compromisso)` : ""}.`; }) : null,
      emailAtivo() ? acao("Fazer backup agora", async () => { const r = await backupAgora(); return `Backup feito (${kb(r.tamanho || 0)}).`; }) : null,
      emailAtivo() ? el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar("Desligar os e-mails e automações?")) { await desconectarEmail(); avisar("Desligado."); }
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

/** App da Meta para os relatórios do Instagram e do Facebook (o App ID não é secreto). */
function blocoMeta() {
  const cfg = configMeta();
  const appId = el("input", { id: "meta-app", type: "text", inputmode: "numeric", placeholder: "Ex.: 1234567890123456", value: cfg.appId || "" });
  const configId = el("input", { id: "meta-config", type: "text", inputmode: "numeric", placeholder: "Ex.: 987654321098765", value: cfg.configId || "" });
  const li = (...c) => el("li", {}, ...c);
  return el("section", { class: "bloco" },
    el("h2", {}, "Relatórios do Instagram e Facebook"),
    cfg.appId ? el("p", {}, el("span", { class: "etiqueta ok" }, "Ligado"), " Cada pessoa conecta o próprio Facebook na aba Resultados do cliente (ou em Minha conta).")
      : el("p", {}, "Para puxar os números das contas e de cada post, crie uma vez um app gratuito na Meta e cole os IDs aqui."),
    el("details", { class: "passo-a-passo", open: !cfg.appId || !cfg.configId },
      el("summary", {}, "Como configurar o app da Meta (tipo Negócio)"),
      el("ol", { class: "passos" },
        li("Em ", el("a", { href: "https://developers.facebook.com/apps/", target: "_blank", rel: "noopener" }, "developers.facebook.com → Meus apps"), ", abra o app (tipo Negócio) e copie o App ID do topo."),
        li("Produto \"Login do Facebook para Empresas\" → Definições (Settings): deixe Login no OAuth do cliente, Login no OAuth da Web e Login com o SDK do JavaScript em Sim. Em \"Domínios permitidos para o SDK do JavaScript\" e em \"URIs de redirecionamento do OAuth válidos\" coloque ", el("code", {}, location.origin + "/"), ". Salve."),
        li("Se aparecer o aviso \"requires advanced access\": clique em Get Advanced Access e peça o acesso avançado de ", el("code", {}, "public_profile"), " (é automático)."),
        li("Em Configurações do app → Básico: Domínios do app = ", el("code", {}, location.hostname), ". Salve."),
        li("Login do Facebook para Empresas → Configurações (Configurations) → Criar configuração. Nome: Relatórios Hyper. Variação: Login geral. Token: Token de acesso do usuário. Permissões: ",
          el("code", {}, "pages_show_list, pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights, business_management"), ". Crie e copie o ID da configuração."),
        li("Em Funções do app → Funções, adicione como Testadoras as pessoas da equipe que vão ver os relatórios (o app pode ficar em modo de desenvolvimento)."),
        li("Cole o App ID e o ID da configuração aqui embaixo e salve. Depois: um cliente → aba Resultados → Conectar."))),
    el("div", { class: "form-grade" },
      el("label", { class: "campo metade", for: "meta-app" }, el("span", {}, "App ID"), appId),
      el("label", { class: "campo metade", for: "meta-config" }, el("span", {}, "ID da configuração (Login para Empresas)"), configId)),
    el("div", { class: "acoes" }, el("button", { onClick: async () => {
      const a = appId.value.replace(/\D/g, ""), c = configId.value.replace(/\D/g, "");
      if ((appId.value && !a) || (configId.value && !c)) { avisar("Os IDs têm só números.", "erro"); return; }
      await salvarComId("config", "meta", { appId: a, configId: c });
      avisar(a ? "App da Meta salvo." : "Relatórios desligados.");
    } }, "Salvar")));
}
