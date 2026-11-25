// Importar um planejamento de posts (.json preparado pelo Claude a partir de prints ou planilhas do cliente).
// Formato: { tipo: "planejamento-hyper", cliente, marcas: [{ nome, cor }], posts: [{ data, hora, marca, formato, rede, titulo, pilar, objetivo, roteiro, copy, notas, prazo, responsavel }] }
// - "marca" vazia = marca principal do cliente; marcas que não existirem são criadas.
// - Cada post tem id fixo (plan-…): importar de novo o mesmo arquivo não duplica e não mexe no que já existe.
import { el, avisar, abrirModal, normalizar, fmtData, hojeISO } from "../ui.js";
import { dados, porId, criar, atualizar, salvarComId, marcasDo } from "../db.js";
import { TIPO_CONTEUDO, FORMATOS, formatoAtual, statusDaEtapa, prazoDoPost } from "../constantes.js";
import { modeloChecklist } from "./componentes.js";
import { registrarAtividade } from "../db.js";
import { responsavelPadrao } from "../agenda.js";

const semEspaco = (s) => normalizar(s).replace(/[^a-z0-9]/g, "");
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }

/** Melhor cliente para o nome do arquivo (ex.: "Grupo Exemplo" acha "Exemplo"). */
function clienteProvavel(nome) {
  const alvo = semEspaco(nome);
  const ativos = dados.clientes.filter((c) => c.ativo !== false);
  return ativos.find((c) => semEspaco(c.nome) === alvo)
    || ativos.find((c) => alvo.includes(semEspaco(c.nome)) || semEspaco(c.nome).includes(alvo))
    || null;
}

/** Mostra o que o arquivo de planejamento vai criar e importa (chamado por Ajustes → Importar arquivo do Claude). */
export function previaPlanejamento(plano) {
  if (!Array.isArray(plano.posts)) { avisar("Arquivo de planejamento sem posts.", "erro"); return; }
  const area = el("div", { class: "importacao-previa" });

  function desenhar() {
    const provavel = clienteProvavel(plano.cliente);
    const seletor = el("select", { id: "imp-cliente", "aria-label": "Cliente" },
      el("option", { value: "" }, `— Criar o cliente "${plano.cliente}" —`),
      dados.clientes.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((c) => el("option", { value: c.id, selected: c.id === provavel?.id }, c.nome)));
    const renomear = el("input", { type: "checkbox", id: "imp-renomear", checked: true });
    const linhaRenomear = el("label", { class: "check-inline", for: "imp-renomear" }, renomear, "");
    const resumo = el("div");
    const atualizarResumo = () => {
      const cliente = porId("clientes", seletor.value);
      linhaRenomear.hidden = !cliente || semEspaco(cliente.nome) === semEspaco(plano.cliente);
      linhaRenomear.lastChild.textContent = cliente ? ` Renomear "${cliente.nome}" para "${plano.cliente}"` : "";
      const existentes = cliente ? marcasDo(cliente.id) : [];
      const marcas = [...new Set(plano.posts.map((p) => p.marca || ""))];
      const porMes = {};
      plano.posts.forEach((p) => { const m = p.data.slice(0, 7); porMes[m] = (porMes[m] || 0) + 1; });
      resumo.replaceChildren(
        el("p", {}, el("strong", {}, `${plano.posts.length} posts`), ` de ${fmtData(plano.posts.map((p) => p.data).sort()[0])} a ${fmtData(plano.posts.map((p) => p.data).sort().pop())}: `,
          Object.entries(porMes).map(([m, n]) => `${n} em ${m.slice(5)}/${m.slice(0, 4)}`).join(", "), "."),
        el("ul", {}, marcas.map((nome) => {
          const n = plano.posts.filter((p) => (p.marca || "") === nome).length;
          if (!nome) return el("li", {}, `${n} post(s) na marca principal (${cliente && !(renomear.checked && !linhaRenomear.hidden) ? cliente.nome : plano.cliente})`);
          const ja = existentes.find((m) => semEspaco(m.nome) === semEspaco(nome));
          return el("li", {}, `${n} post(s) em ${nome}`, ja ? "" : el("span", { class: "etiqueta compromisso" }, "marca nova"));
        })),
        el("p", { class: "subtitulo" }, "Os posts entram como Ideia, com o prazo de produção na semana anterior e o checklist do formato. Importar de novo não duplica."));
    };
    seletor.addEventListener("change", atualizarResumo);
    renomear.addEventListener("change", atualizarResumo);
    area.replaceChildren(
      el("label", { class: "campo", for: "imp-cliente" }, el("span", {}, "Cliente"), seletor),
      linhaRenomear, resumo,
      el("div", { class: "acoes" }, el("button", { class: "secundario negar", onClick: () => fechar() }, "Cancelar"),
        el("button", { class: "confirmar", onClick: (e) => importar(e.currentTarget, seletor.value, renomear.checked) }, "Importar planejamento")));
    atualizarResumo();
  }

  async function importar(botao, clienteId, renomear) {
    botao.disabled = true;
    try {
      // 1) Cliente
      if (!clienteId) clienteId = (await criar("clientes", { nome: plano.cliente, ativo: true, servicos: [], paleta: [], criadoEm: Date.now() })).id;
      const cliente = porId("clientes", clienteId);
      if (cliente && renomear && semEspaco(cliente.nome) !== semEspaco(plano.cliente)) await atualizar("clientes", clienteId, { nome: plano.cliente });
      // 2) Marcas
      const idsMarca = { "": "" };
      for (const nome of [...new Set(plano.posts.map((p) => p.marca).filter(Boolean))]) {
        const ja = marcasDo(clienteId).find((m) => semEspaco(m.nome) === semEspaco(nome));
        if (ja) { idsMarca[nome] = ja.id; continue; }
        const cor = plano.marcas?.find((m) => m.nome === nome)?.cor;
        const id = `m-${clienteId}-${semEspaco(nome)}`;
        await salvarComId("marcas", id, { clienteId, nome, ativo: true, paleta: cor ? [cor] : [], cor: cor || "", criadoEm: Date.now() });
        idsMarca[nome] = id;
      }
      // 3) Posts (sem mexer nos que já existem)
      let novos = 0, pulados = 0;
      for (const p of plano.posts) {
        const id = `plan-${hash(`${clienteId}|${p.data}|${p.marca || ""}|${normalizar(p.titulo)}`)}`;
        const jaExiste = porId("tarefas", id) || dados.tarefas.some((t) => t.clienteId === clienteId && (t.dataPublicacao || t.prazo) === p.data && normalizar(t.titulo) === normalizar(p.titulo));
        if (jaExiste) { pulados++; continue; }
        const formato = FORMATOS.includes(formatoAtual(p.formato)) ? formatoAtual(p.formato) : "Estático";
        botao.textContent = `Criando ${novos + 1}…`;
        await salvarComId("tarefas", id, {
          titulo: p.titulo, tipo: TIPO_CONTEUDO, clienteId, marcaId: idsMarca[p.marca || ""] || "",
          formato, rede: p.rede || "Instagram", dataPublicacao: p.data, hora: p.hora || "", prazo: p.prazo || prazoDoPost(p.data, formato, hojeISO()),
          statusConteudo: "ideia", status: statusDaEtapa("ideia"), concluidoEm: null,
          objetivo: p.objetivo || "", roteiro: p.roteiro || "", copy: p.copy || "", pilar: p.pilar || "", linkCanva: "", linkDrive: "", notas: p.notas || "",
          responsavel: p.responsavel || responsavelPadrao(), checklist: modeloChecklist({ tipo: TIPO_CONTEUDO, formato }),
          origem: "importacao-planejamento", criadoEm: Date.now()
        });
        registrarAtividade(id, { texto: "criou (importação do planejamento)" });
        novos++;
      }
      fechar();
      avisar(`${novos} post(s) criados${pulados ? `, ${pulados} já existiam` : ""}.`);
      location.hash = `#/calendario/${clienteId}/${plano.posts.map((p) => p.data).sort()[0].slice(0, 7)}`;
    } catch (e) {
      console.error(e);
      avisar("Parou no meio: " + e.message + " Importe de novo: o que já entrou não duplica.", "erro");
      botao.disabled = false; botao.textContent = "Importar planejamento";
    }
  }

  const fechar = abrirModal("Importar planejamento de posts", area, { largo: true });
  desenhar();
}
