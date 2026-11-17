// Ajustes: tarefas recorrentes, importação da planilha e backup.
import { el, formulario, confirmar, avisar, abrirModal, hojeISO, addDias, vazio, normalizar } from "../ui.js";
import { dados, criar, atualizar, excluir, gravarEmLote, novoId, opcoesClientes, nomeCliente, clientesAtivos } from "../db.js";
import { cabecalho } from "./componentes.js";
import { analisarPlanilha } from "../importacao.js";
import { configOpenAI, salvarConfigOpenAI, MODELO_PADRAO } from "../openai.js";


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

function baixarBackup() {
  const blob = new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), ...dados }, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `hyper-backup-${hojeISO()}.json` });
  document.body.append(a); a.click(); a.remove();
}

export function render() {
  return el("div", { class: "tela" },
    cabecalho("Ajustes", "Geração de imagem, importação e backup"),

    el("p", { class: "dica-cliente" }, "As tarefas recorrentes (Manutenção TP, produção da semana, planejamento do mês, cobranças) agora ficam no menu ",
      el("a", { href: "#/rotinas" }, "Rotinas"), "."),

    blocoOpenAI(),

    el("section", { class: "bloco" },
      el("h2", {}, "Importar planilha"),
      el("p", {}, "Traga o histórico da planilha Fluxo de Trabalho: clientes, tarefas e entregas."),
      el("button", { onClick: abrirImportacao }, "Importar CSV da planilha")),

    el("section", { class: "bloco" },
      el("h2", {}, "Backup"),
      el("p", {}, `${dados.tarefas.length} tarefas · ${dados.clientes.length} clientes · ${dados.conteudos.length} conteúdos · ${dados.financeiro.length} lançamentos`),
      el("button", { class: "secundario", onClick: baixarBackup }, "Baixar backup (.json)")));
}

function blocoOpenAI() {
  const cfg = configOpenAI();
  const chave = el("input", { id: "openai-chave", type: "password", placeholder: cfg.chave ? "•••••••• (já cadastrada — cole outra para trocar)" : "sk-...", autocomplete: "off" });
  const modelo = el("input", { id: "openai-modelo", type: "text", value: cfg.modelo || MODELO_PADRAO });
  return el("section", { class: "bloco" },
    el("h2", {}, "Geração de imagem (OpenAI)"),
    el("p", {}, cfg.chave ? `✓ Chave cadastrada (termina em ${cfg.chave.slice(-4)}).` : "Cole a chave da API da OpenAI para gerar imagens no menu Criar."),
    el("ol", { class: "passos" },
      el("li", {}, "Acesse platform.openai.com → API keys → Create new secret key."),
      el("li", {}, "Adicione saldo em Billing (cada imagem custa alguns centavos de dólar)."),
      el("li", {}, "Cole a chave aqui e salve.")),
    el("div", { class: "form-grade" },
      el("label", { class: "campo metade", for: "openai-chave" }, el("span", {}, "Chave da API"), chave),
      el("label", { class: "campo metade", for: "openai-modelo" }, el("span", {}, "Modelo de imagem"), modelo)),
    el("p", { class: "subtitulo" }, "A chave fica guardada só na sua conta, protegida pelas regras do banco. Não compartilhe prints desta tela com a chave aparecendo."),
    el("div", { class: "acoes" },
      el("button", { onClick: async () => {
        const nova = chave.value.trim() || cfg.chave;
        if (!nova) { avisar("Cole a chave.", "erro"); return; }
        await salvarConfigOpenAI({ chave: nova, modelo: modelo.value });
        avisar("Configuração da OpenAI salva.");
      } }, "Salvar"),
      cfg.chave ? el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar("Remover a chave da OpenAI?")) { await salvarConfigOpenAI({ chave: "", modelo: modelo.value }); avisar("Chave removida."); }
      } }, "Remover chave") : null));
}
