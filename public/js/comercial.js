// Comercial: catálogo de serviços com preços, modelo de contrato, despesas fixas e reserva.
// Tudo fica em espacos/hyper/config/comercial (só quem tem Financeiro e vê todos os clientes lê; só admin grava).
// Os dados reais (preços, dados da Hyper) entram pelo app (Financeiro → Configurar), nunca no repositório.
import { dados } from "./db.js";
import { esc, fmtMoeda, hojeISO, addDias, dataDe } from "./ui.js";

export const configComercial = () => dados.config.find((c) => c.id === "comercial") || {};

/** Serviços que já vêm prontos (sem preço: o preço é definido em Financeiro → Configurar). */
export const SERVICOS_PADRAO = [
  { id: "trafego", nome: "Gestão de tráfego pago (Meta Ads e Google Ads)", tipo: "mensal", preco: 0, trafego: true,
    descricao: "Criação, acompanhamento e otimização das campanhas, com relatório mensal de resultados.",
    itens: [
      "Manutenção e organização das informações específicas dos canais (Meta Ads e Google Ads) e manutenção do investimento em anúncios;",
      "Acompanhamento do desempenho de cada campanha, assegurando a melhor cobertura dos públicos e/ou dos mercados objetivados, sendo de responsabilidade da CONTRATANTE o pagamento do valor de mídia a ser utilizado;",
      "Revisão e manutenção de textos para criativos, com técnicas adequadas de SEO (Search Engine Optimization), de acordo com os temas pré-definidos pela CONTRATANTE e em encontro ao surgimento de novas demandas nos canais;",
      "Monitoramento do engajamento do público e disponibilização de ferramentas e/ou tutoriais que ajudem a CONTRATANTE a verificar relatórios simples mensais, baseados nos resultados apresentados pelas próprias plataformas;"
    ] },
  { id: "social", nome: "Gestão de redes sociais (social media)", tipo: "mensal", preco: 0,
    descricao: "Planejamento mensal, criação de artes e textos, publicação e relatório.",
    itens: [
      "Planejamento mensal de conteúdo, com calendário de publicações enviado para aprovação da CONTRATANTE;",
      "Criação de artes e textos (copy) para as publicações, seguindo a identidade visual e o tom de voz da marca;",
      "Publicação e agendamento dos conteúdos aprovados nos perfis da CONTRATANTE;",
      "Relatório mensal simples com os principais resultados dos perfis;"
    ] },
  { id: "video", nome: "Edição de vídeos (Reels)", tipo: "mensal", preco: 0,
    descricao: "Edição de vídeos curtos para as redes sociais.",
    itens: ["Edição de vídeos curtos para as redes sociais, a partir do material bruto enviado pela CONTRATANTE ou captado em gravações agendadas;"] },
  { id: "landing", nome: "Criação de landing page", tipo: "unico", preco: 0,
    descricao: "Página de captura para coleta de leads e redirecionamento para o contato.",
    itens: ["Criação de Landing Page para coleta de leads e redirecionamento de contato;"] },
  { id: "manutencao-lp", nome: "Manutenção de landing page", tipo: "mensal", preco: 0,
    descricao: "Ajustes de textos, imagens e integrações da página.",
    itens: ["Manutenção da Landing Page, com ajustes de textos, imagens e integrações quando necessário;"] },
  { id: "identidade", nome: "Identidade visual", tipo: "unico", preco: 0,
    descricao: "Logo, paleta de cores, tipografia e aplicações básicas.",
    itens: ["Criação de identidade visual (logo, paleta de cores, tipografia e aplicações básicas), com até 2 (duas) rodadas de ajustes;"] }
];
export const servicosCatalogo = () => configComercial().servicos?.length ? configComercial().servicos : SERVICOS_PADRAO;
export const servicoPorNome = (nome) => servicosCatalogo().find((s) => s.nome === nome);
export const despesasFixas = () => configComercial().despesasFixas || [];
export const reserva = () => Number(configComercial().reserva) || 0;

/* ---------------- Datas e valores por extenso ---------------- */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const dataExtenso = (iso) => { const [a, m, d] = iso.split("-"); return `${d} de ${MESES[Number(m) - 1]} de ${a}`; };
export const dataCurta = (iso) => iso.split("-").reverse().join("/");

/** N-ésimo dia útil do mês (segunda a sexta; feriados não entram na conta). */
export function diaUtil(mes, n) {
  let conta = 0;
  for (let d = `${mes}-01`; d.startsWith(mes); d = addDias(d, 1)) {
    const s = dataDe(d).getDay();
    if (s !== 0 && s !== 6 && ++conta === n) return d;
  }
  return addDias(`${mes}-01`, 27);
}

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
function ate999(n) {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100, partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) partes.push(r < 20 ? UNIDADES[r] : DEZENAS[Math.floor(r / 10)] + (r % 10 ? " e " + UNIDADES[r % 10] : ""));
  return partes.join(" e ");
}
function inteiroExtenso(n) {
  if (n === 0) return "zero";
  const grupos = [[Math.floor(n / 1e6), (g) => (g === 1 ? "um milhão" : ate999(g) + " milhões")], [Math.floor((n % 1e6) / 1000), (g) => (g === 1 ? "mil" : ate999(g) + " mil")], [n % 1000, ate999]]
    .filter(([g]) => g > 0);
  return grupos.map(([g, f], i) => (i && i === grupos.length - 1 && (g < 100 || g % 100 === 0) ? "e " : "") + f(g)).join(" ");
}
/** 1234.5 → "mil duzentos e trinta e quatro reais e cinquenta centavos" */
export function valorExtenso(valor) {
  const centavos = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(centavos / 100), cent = centavos % 100;
  const partes = [];
  if (reais || !cent) partes.push(reais === 1 ? "um real" : inteiroExtenso(reais) + (reais % 1e6 === 0 && reais ? " de reais" : " reais"));
  if (cent) partes.push(cent === 1 ? "um centavo" : ate999(cent) + " centavos");
  return partes.join(" e ");
}
export const valorComExtenso = (v) => `${fmtMoeda(v)} (${valorExtenso(v)})`;

const ORDINAIS = ["", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono", "décimo"];
/** "até o quinto dia útil de cada mês" ou "todo dia 15 de cada mês". */
export function textoVencimento({ vencimentoUtil, diaVencimento }) {
  const d = Number(diaVencimento) || 10;
  return vencimentoUtil ? `até o ${ORDINAIS[d] || d + "º"} dia útil de cada mês` : `até o dia ${String(d).padStart(2, "0")} de cada mês`;
}

/* ---------------- Contrato ---------------- */

// Modelo padrão. {{CAMPOS}} são trocados pelos dados do formulário. Pode ser trocado em Financeiro → Configurar.
export const MODELO_CONTRATO = `CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS

Pelo presente instrumento particular de Contrato de Prestação de Serviços, a CONTRATANTE {{CONTRATANTE}}{{DOC_CONTRATANTE}} e a CONTRATADA {{CONTRATADA}}{{DOC_CONTRATADA}} ajustam entre si as cláusulas e condições do presente contrato, conforme disposto a seguir.

CLÁUSULA PRIMEIRA: DA PRESTAÇÃO DE SERVIÇOS

1º - Este contrato tem como objetivo a prestação de serviços de {{OBJETO}} e será desenvolvido consoante os pontos explicados logo abaixo:

{{ITENS}}

CLÁUSULA SEGUNDA: DAS CONDIÇÕES DA PRESTAÇÃO DOS SERVIÇOS

Item I - Obrigações da CONTRATADA

A CONTRATADA compromete-se a:

Prestar os serviços completos descritos acima, incluindo todas as ações e estratégias necessárias para o bom desempenho das campanhas e conteúdos.

Proteger a imagem da CONTRATANTE, adotando práticas éticas e em conformidade com o Código de Defesa do Consumidor (Lei nº 8.078/1990) e o Código Brasileiro de Autorregulamentação Publicitária.

Estudar o conceito, marca, produto ou serviço da CONTRATANTE, analisando suas características, pontos fortes e fracos, bem como sua posição no mercado, público e concorrência, quando aplicável.

Seguir as regras, políticas e termos de uso das plataformas utilizadas (como Meta Ads), reconhecendo que eventuais penalidades ou bloqueios impostos pelas plataformas podem ocorrer por motivos fora de seu controle. A CONTRATADA somente será responsabilizada por tais sanções caso se comprove que resultaram exclusivamente de sua conduta inadequada.

Manter qualidade, padrão e regularidade nos serviços prestados, respeitando prazos e condições previamente definidas, e mantendo comunicação constante com a CONTRATANTE durante todo o processo.

Item II - Obrigações da CONTRATANTE

A CONTRATANTE se compromete a:

Fornecer à CONTRATADA todas as informações, materiais, textos, ideias e imagens necessários para o desenvolvimento dos serviços, em formato digital e dentro do prazo máximo de 48 horas úteis, a fim de evitar atrasos no cronograma.

Cumprir os prazos estabelecidos para pagamentos e entregas de materiais, garantindo o andamento regular do projeto.

Sugerir conteúdos e informações para divulgação, sendo integralmente responsável pela veracidade e legalidade desses dados, incluindo eventuais infrações relacionadas a propaganda enganosa, atos ilícitos ou violação de direitos autorais.

Arcar com todos os tributos decorrentes deste contrato, conforme definido pela legislação vigente. Caso seja responsável por reter e recolher impostos na fonte, deverá fazê-lo dentro dos prazos legais.

CLÁUSULA TERCEIRA: PRAZO

Parágrafo único. O início da prestação do serviço e do contrato aqui disposto se dará a partir do dia {{INICIO}}, com vigência de {{MESES}} meses, encerrando-se no dia {{FIM}}.

CLÁUSULA QUARTA: VALORES E FORMAS DE PAGAMENTO

1º - Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA {{VALORES}}

2º - Em caso de rescisão contratual, não haverá devolução de valores já pagos à CONTRATADA. A CONTRATANTE poderá encerrar o contrato a qualquer momento, mediante aviso prévio, caso identifique descumprimento das cláusulas ou insatisfação com os serviços.

3º - O não pagamento dos serviços em até 5 (cinco) dias após o vencimento resultará na suspensão imediata dos serviços, podendo gerar cobrança judicial ou extrajudicial.

4º - A CONTRATADA executará apenas os serviços previstos neste contrato. Qualquer solicitação adicional será cobrada à parte, com orçamento e aprovação prévia de ambas as partes.
{{VERBA}}
CLÁUSULA QUINTA: RESCISÃO DE CONTRATO

1º - Em caso de rescisão contratual por qualquer uma das partes sem o cumprimento do aviso prévio de 30 (trinta) dias, será aplicada uma multa equivalente a 50% (cinquenta por cento) do valor mensal contratado, a ser paga pela parte que der causa à rescisão.

2º - O presente contrato poderá ser rescindido por extinção de qualquer das partes, decretação de falência ou decurso natural do prazo.

CLÁUSULA SEXTA: DISPOSIÇÕES GERAIS

1º - Todos os direitos autorais do projeto pertencem à CONTRATADA, incluindo o direito de divulgar o trabalho em seus canais, mesmo após o fim do contrato.

2º - Os arquivos abertos (editáveis) são de propriedade da CONTRATADA, que poderá decidir se os entrega ou não à CONTRATANTE. No entanto, a CONTRATANTE tem uso comercial completo das peças finalizadas, desde que os pagamentos estejam em dia.

3º - A CONTRATADA pode subcontratar ou transferir serviços, permanecendo responsável pela execução e qualidade do trabalho.

4º - A CONTRATANTE não será responsabilizada por questões legais ou administrativas relacionadas ao trabalho da CONTRATADA.

5º - As partes declaram que seus representantes são legalmente autorizados a firmar este contrato e responder por suas obrigações.

6º - CONTRATANTE e CONTRATADA são independentes, sem qualquer vínculo empregatício ou de representação comercial. Nenhuma das partes pode assumir compromissos em nome da outra.

7º - A tolerância com atrasos ou falhas não implica renúncia de direitos. As partes podem exigir o cumprimento do contrato a qualquer momento.

8º - Caso o serviço não possa ser executado por informações incorretas ou omissões da CONTRATANTE, isso não será considerado falha da CONTRATADA, caracterizando descumprimento por parte da CONTRATANTE.

9º - Fica definido o foro da cidade de {{FORO}} como o local para resolver qualquer conflito decorrente deste contrato.

10º - Este contrato segue as leis brasileiras aplicáveis, incluindo a Lei nº 4.680/65, os Decretos nº 57.690/66 e nº 4.563/02, a Lei de Direitos Autorais (Lei nº 9.610/98), as Normas da Atividade Publicitária e o Código de Ética dos Profissionais de Propaganda.

CLÁUSULA SÉTIMA: CONFIDENCIALIDADE E PRIVACIDADE

1º - Ambas as partes se comprometem a manter sigilo absoluto sobre quaisquer informações, dados ou documentos confidenciais compartilhados durante a vigência deste contrato, incluindo, mas não se limitando, a estratégias de marketing, valores, dados de clientes e quaisquer materiais exclusivos. A confidencialidade também abrange metodologias, ferramentas e estratégias utilizadas pela CONTRATADA.

CLÁUSULA OITAVA: REVISÃO E RENOVAÇÃO CONTRATUAL

1º - Este contrato poderá ser revisado a qualquer momento, mediante solicitação de uma das partes, desde que a solicitação seja formalizada por escrito e devidamente acordada entre as partes.

2º - Caso ambas as partes concordem, este contrato poderá ser renovado automaticamente por mais 12 (doze) meses, mediante reajuste do valor mensal conforme índice inflacionário oficial ou acordo prévio entre as partes.

3º - A renovação automática será considerada aceita caso nenhuma das partes manifeste interesse em encerrar o contrato com, pelo menos, 30 (trinta) dias de antecedência do término da vigência atual.

Justo e acordado o presente instrumento, CONTRATANTE e CONTRATADA assinam o presente instrumento em 02 (duas) vias de igual teor e diante de duas testemunhas.

{{CIDADE}}, {{DATA}}

{{ASSINATURAS}}`;

const LETRAS = "abcdefghijklmnopqrstuvwxyz";

/**
 * Monta o texto do contrato. v: { contratante, documento, servicos: [nomes], mensalidade, valorUnico, condicaoUnico,
 * inicio, meses, vencimentoUtil, diaVencimento, pagamento: "pre"|"pos", verba, data }
 */
export function textoContrato(v) {
  const cfg = configComercial();
  const hyper = cfg.contratada || {};
  const servicos = (v.servicos || []).map(servicoPorNome).filter(Boolean);
  const unicos = servicos.filter((s) => s.tipo === "unico");
  const itens = servicos.flatMap((s) => s.itens || []).map((t, i) => `(${LETRAS[i] || i + 1}) ${t}`);
  if (itens.length) itens[itens.length - 1] = itens[itens.length - 1].replace(/;$/, ".");
  const objeto = servicos.map((s) => s.nome.replace(/ \(.*\)$/, "").toLowerCase());
  const objetoTexto = objeto.length > 1 ? `${objeto.slice(0, -1).join(", ")} e ${objeto.at(-1)}` : objeto[0] || "marketing digital";
  const meses = Number(v.meses) || 12;
  const fim = addDias(addMeses(v.inicio || hojeISO(), meses), -1);
  const valores = [];
  if (Number(v.mensalidade) > 0) valores.push(`o valor mensal de ${valorComExtenso(v.mensalidade)}, via PIX, ${textoVencimento(v)}${v.pagamento === "pre" ? ", de forma antecipada (referente ao mês de prestação)" : v.pagamento === "pos" ? ", referente ao mês anterior de prestação" : ""}`);
  if (Number(v.valorUnico) > 0) valores.push(`o valor único de ${valorComExtenso(v.valorUnico)} referente a ${unicos.map((s) => s.nome.toLowerCase()).join(" e ") || "projeto"}${v.condicaoUnico ? `, ${v.condicaoUnico}` : ""}`);
  const temTrafego = servicos.some((s) => s.trafego);
  const verba = temTrafego ? `
5º - O valor destinado aos anúncios (verba de mídia${v.verba ? `, previsto em ${v.verba}` : ""}) é de responsabilidade da CONTRATANTE e deverá ser pago diretamente à CONTRATADA, por depósito, transferência bancária ou cartão de crédito, até o dia 05 (cinco) de cada mês, ou conforme acordo prévio entre as partes, para garantir a continuidade das campanhas.
` : "";
  const linha = "_____________________________________";
  const assinaturas = `Assinatura: ${linha}\n${(hyper.nome || "CONTRATADA").toUpperCase()} - CONTRATADA${hyper.documento ? `\n${hyper.documento}` : ""}\n\nAssinatura: ${linha}\n${(v.contratante || "CONTRATANTE").toUpperCase()} - CONTRATANTE${v.documento ? `\n${v.documento}` : ""}`;
  const trocas = {
    CONTRATANTE: (v.contratante || "").toUpperCase(),
    DOC_CONTRATANTE: v.documento ? `, registrada sob o ${v.documento},` : ",",
    CONTRATADA: (hyper.nome || "").toUpperCase(),
    DOC_CONTRATADA: hyper.documento ? `, registrada sob o ${hyper.documento},` : ",",
    OBJETO: objetoTexto,
    ITENS: itens.join("\n\n"),
    INICIO: dataCurta(v.inicio || hojeISO()),
    MESES: `${meses} (${inteiroExtenso(meses)})`,
    FIM: dataCurta(fim),
    VALORES: (valores.join("; e ") || "o valor combinado") + ".",
    VERBA: verba,
    FORO: hyper.foro || hyper.cidade || "",
    CIDADE: (hyper.cidade || "").split("/")[0].toUpperCase(),
    DATA: dataExtenso(v.data || hojeISO()),
    ASSINATURAS: assinaturas
  };
  return (cfg.modeloContrato || MODELO_CONTRATO).replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => trocas[k] ?? "");
}

function addMeses(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1 + n, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/* ---------------- Documentos (PDF pelo navegador e Word) ---------------- */

const base = () => location.origin + location.pathname.replace(/[^/]*$/, "");

/** Texto do contrato → HTML simples (títulos em negrito, parágrafos justificados). */
export function htmlContrato(texto) {
  return texto.split(/\n{2,}/).map((bloco, i) => {
    const linhas = bloco.split("\n").map(esc).join("<br>");
    if (i === 0) return `<h1>${linhas}</h1>`;
    if (/^(CLÁUSULA|Item [IVX]+)/.test(bloco)) return `<h2>${linhas}</h2>`;
    if (/^Assinatura:/.test(bloco)) return `<p class="assinatura">${linhas}</p>`;
    return `<p>${linhas}</p>`;
  }).join("\n");
}

const CSS_DOC = `body{font-family:Arial,Helvetica,sans-serif;font-size:11.5pt;line-height:1.5;color:#1A1A1A;max-width:760px;margin:32px auto;padding:0 24px}
h1{font-size:14pt;text-align:center;margin:0 0 24px}h2{font-size:11.5pt;margin:20px 0 8px}p{text-align:justify;margin:0 0 10px}
.assinatura{text-align:left;margin-top:28px}@media print{@page{size:A4;margin:20mm}body{margin:0;padding:0}}`;

export function documentoContrato(titulo, texto) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS_DOC}</style></head><body>${htmlContrato(texto)}</body></html>`;
}

/**
 * Abre o documento numa aba nova e chama a impressão (Salvar como PDF). Aceita o HTML ou uma promessa dele:
 * a aba abre na hora do clique (senão o navegador bloqueia) e recebe o documento quando ficar pronto.
 */
export async function abrirParaPDF(html) {
  const janela = window.open("", "_blank");
  if (!janela) return false;
  janela.document.write("<p style='font-family:sans-serif;padding:40px'>Montando o PDF…</p>");
  const pronto = (await html).replace("</body>", "<script>window.onload=()=>setTimeout(()=>window.print(),700)<\/script></body>");
  janela.location.href = URL.createObjectURL(new Blob([pronto], { type: "text/html" }));
  return true;
}

/** Baixa um .doc (HTML que o Word abre e edita normalmente). */
export function baixarWord(html, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
  a.download = `${nome}.doc`;
  document.body.append(a);
  a.click();
  a.remove();
}

/* ---------------- Orçamento (proposta) ---------------- */

/** Totais do orçamento: itens [{ nome, tipo, preco, qtd }], desconto em %. */
export function totaisOrcamento(o) {
  const soma = (tipo) => (o.itens || []).filter((i) => (i.tipo === "unico") === (tipo === "unico")).reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.qtd) || 1), 0);
  const fator = 1 - (Number(o.desconto) || 0) / 100;
  const mensalBruto = soma("mensal"), unicoBruto = soma("unico");
  return { mensalBruto, unicoBruto, mensal: Math.round(mensalBruto * fator * 100) / 100, unico: Math.round(unicoBruto * fator * 100) / 100 };
}

export async function documentoOrcamento(o) {
  const t = totaisOrcamento(o);
  const hyper = configComercial().contratada || {};
  let css = "";
  try { css = await (await fetch(`${base()}css/exportacao.css`)).text(); } catch {}
  const linhas = (o.itens || []).map((i) => `<tr><td><strong>${esc(i.nome)}</strong>${i.descricao ? `<br><small>${esc(i.descricao)}</small>` : ""}</td>
    <td class="num">${Number(i.qtd) > 1 ? `${i.qtd} × ` : ""}${fmtMoeda(i.preco)}${i.tipo === "unico" ? "" : "/mês"}</td></tr>`).join("");
  const validade = o.validade ? dataCurta(addDias(o.data || hojeISO(), Number(o.validade))) : "";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta Hyper - ${esc(o.para)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&family=Montserrat:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>${css}
.topo p{text-transform:none}.proposta{padding:24px 32px}.proposta td.num{font-weight:700;color:var(--hyper-roxo);font-size:13px}.proposta table{width:100%;border-collapse:collapse;margin:12px 0}.proposta td{padding:10px 8px;border-bottom:1px solid var(--hyper-gelo);vertical-align:top}
.proposta small{color:var(--hyper-cinza)}.num{text-align:right;white-space:nowrap}.totais{margin-left:auto;width:320px}.totais td{border:0;padding:4px 8px}
.totais .grande td{font:italic 800 22px "Barlow Condensed",sans-serif;color:var(--hyper-roxo)}.obs{white-space:pre-wrap;background:var(--cor-fundo);padding:12px 16px;border-radius:8px}</style></head><body>
<header class="topo"><img src="${base()}img/logo-branco.png" alt="Hyper"><div><span class="tagline">Proposta comercial</span>
<h1>${esc(o.para)}</h1><p>${dataExtenso(o.data || hojeISO())}${validade ? ` · válida até ${validade}` : ""}</p></div></header>
<section class="proposta">
<table>${linhas}</table>
<table class="totais">
${t.mensal ? `<tr class="grande"><td>Mensal</td><td class="num">${fmtMoeda(t.mensal)}</td></tr>` : ""}
${t.unico ? `<tr class="grande"><td>Investimento único</td><td class="num">${fmtMoeda(t.unico)}</td></tr>` : ""}
${Number(o.desconto) ? `<tr><td colspan="2"><small>Já com ${o.desconto}% de desconto (de ${[t.mensalBruto && fmtMoeda(t.mensalBruto) + "/mês", t.unicoBruto && fmtMoeda(t.unicoBruto)].filter(Boolean).join(" e ")})</small></td></tr>` : ""}
</table>
${o.observacoes ? `<p class="obs">${esc(o.observacoes)}</p>` : ""}
<p><small>A verba de anúncios (mídia) não está incluída e é paga pelo cliente diretamente às plataformas ou conforme combinado.</small></p>
</section>
<footer>Hyper Estratégia Digital${hyper.nome ? ` · ${esc(hyper.nome)}` : ""}${hyper.contato ? ` · ${esc(hyper.contato)}` : ""}</footer>
</body></html>`;
}
