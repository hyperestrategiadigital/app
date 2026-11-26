// Exportação do conteúdo do mês de um cliente: PDF visual para o cliente aprovar.
import { dados, porId, todasTarefas, garantirArquivo, carregarArquivo, limiteArquivo, identidade } from "./db.js";
import { fmtData, fmtDiaSemana, avisar, esc } from "./ui.js";
import { TIPO_CONTEUDO, rotuloObjetivo } from "./constantes.js";
import { artePrincipal } from "./arquivos.js";

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (mes) => { const [a, m] = mes.split("-").map(Number); return `${MESES[m - 1]} ${a}`; };

export const dataPost = (t) => t.dataPublicacao || t.prazo || "";
/** Títulos antigos da planilha já vêm como "Estático | Tema": não repete o formato na frente. */
export const temPrefixo = (titulo = "") => /^[^|]{2,24}\|/.test(titulo);

/** Posts (tarefas do tipo Conteúdo) de um cliente num mês "AAAA-MM", em ordem de publicação. */
export function postsDoMes(clienteId, mes, marcaId) {
  garantirArquivo(`${mes}-01`);
  return todasTarefas()
    .filter((t) => t.tipo === TIPO_CONTEUDO && (!clienteId || t.clienteId === clienteId) && dataPost(t).startsWith(mes) &&
      (marcaId == null || (t.marcaId || "") === marcaId))
    .sort((a, b) => (dataPost(a) + (a.hora || "")).localeCompare(dataPost(b) + (b.hora || "")));
}

const nomeArquivo = (cliente, mes, ext) =>
  `Conteudo ${cliente?.nome || "Hyper"} ${nomeMes(mes)}.${ext}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .-]/g, "");

/* ---------------- PDF visual (página de impressão) ---------------- */

const DIAS_CAB = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
function calendarioMes(posts, mes, artes) {
  const [a, m] = mes.split("-").map(Number);
  const primeiro = new Date(a, m - 1, 1);
  const deslocamento = (primeiro.getDay() + 6) % 7;
  const ultimo = new Date(a, m, 0).getDate();
  const celulas = [];
  for (let i = 0; i < deslocamento; i++) celulas.push(`<div class="dia fora"></div>`);
  for (let d = 1; d <= ultimo; d++) {
    const iso = `${mes}-${String(d).padStart(2, "0")}`;
    const doDia = posts.filter((t) => dataPost(t) === iso);
    celulas.push(`<div class="dia"><div class="num">${String(d).padStart(2, "0")}/${mes.slice(5)}</div>${doDia.map((t) => `
      <div class="item">${artes[t.id] ? `<img src="${artes[t.id]}" alt="">` : ""}<span>${temPrefixo(t.titulo) ? esc(t.titulo) : `<b>${esc(t.formato || "Post")}</b> | ${esc(t.titulo)}`}</span></div>`).join("")}</div>`);
  }
  while (celulas.length % 7) celulas.push(`<div class="dia fora"></div>`);
  return `<div class="grade">${DIAS_CAB.map((n) => `<div class="cab">${n}</div>`).join("")}${celulas.join("")}</div>`;
}

/** marcaId: undefined = todas as marcas do cliente; "" = só a principal; id = só aquela marca (PDF com a cor e o nome dela). */
export async function exportarPDF(clienteId, mes, marcaId) {
  if (`${mes}-01` < limiteArquivo()) await carregarArquivo();
  const cliente = marcaId ? identidade(clienteId, marcaId) : porId("clientes", clienteId);
  const posts = postsDoMes(clienteId, mes, marcaId);
  if (!posts.length) { avisar("Nenhum post desse cliente neste mês.", "erro"); return; }
  const janela = window.open("", "_blank");
  if (!janela) { avisar("O navegador bloqueou a nova janela. Permita pop-ups para este site.", "erro"); return; }
  janela.document.write("<p style='font-family:sans-serif;padding:40px'>Montando o PDF…</p>");

  // Só os criativos dos posts do PDF (o criativo final tem preferência)
  const artePorTarefa = await artePrincipal(posts).catch((e) => { console.warn("Sem artes:", e); return {}; });

  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  const cards = posts.map((t) => `
    <article class="post">
      <div class="arte">${artePorTarefa[t.id] ? `<img src="${artePorTarefa[t.id]}" alt="">` : `<span>${esc(t.formato || "Post")}</span>`}</div>
      <div class="info">
        <div class="data">${esc(fmtDiaSemana(dataPost(t)))} · ${esc(fmtData(dataPost(t)))}${t.hora ? ` · ${esc(t.hora)}` : ""}</div>
        <h3>${esc(t.titulo)}</h3>
        <div class="tags"><span>${esc(t.formato || "")}</span><span>${esc(t.rede || "")}</span></div>
        ${t.objetivo ? `<p><b>Objetivo:</b> ${esc(rotuloObjetivo(t.objetivo))}</p>` : ""}
        ${t.copy ? `<p class="copy">${esc(t.copy)}</p>` : t.roteiro ? `<p class="copy">${esc(t.roteiro)}</p>` : ""}
        ${t.linkCanva ? `<p class="link"><a href="${esc(t.linkCanva)}">Ver arte no Canva</a></p>` : ""}
        <div class="aprovacao">☐ Aprovado &nbsp;&nbsp; ☐ Ajustar: ________________________</div>
      </div>
    </article>`).join("");

  let css = "";
  try { css = await (await fetch(`${base}css/exportacao.css`)).text(); } catch (e) { console.warn("CSS da exportação:", e); }
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(nomeArquivo(cliente, mes, "pdf"))}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&family=Montserrat:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<style>:root{--cor-cliente:${esc(cliente?.paleta?.[0] || cliente?.cor || "#4E2CA3")}}</style>
</head><body>
<header class="topo"><img src="${base}img/logo-branco.png" alt="Hyper"><div><span class="tagline">Planejamento de conteúdo</span>
<h1>${esc(cliente?.nome || "")}</h1><p>${esc(nomeMes(mes))} · ${posts.length} posts</p></div></header>
<section class="calendario">${calendarioMes(posts, mes, artePorTarefa)}</section>
<h2 class="titulo-detalhes">Detalhes dos posts</h2>
<main>${cards}</main>
<footer><strong>Hyper Studio</strong> · Hyper Estratégia Digital — para aprovar, marque cada post e devolva este arquivo ou responda com os ajustes.</footer>
<script>window.onload=()=>setTimeout(()=>window.print(),800)<\/script>
</body></html>`;
  // Página própria (blob) para o navegador carregar imagens e fontes normalmente
  janela.location.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
}
