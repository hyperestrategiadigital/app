// Exportação do conteúdo do mês de um cliente: planilha Excel e PDF visual para aprovação.
import { dados, porId, listarSub } from "./db.js";
import { el, fmtData, fmtDiaSemana, avisar } from "./ui.js";
import { TIPO_CONTEUDO, rotuloStatusConteudo } from "./constantes.js";
import { caminhoArtes } from "./arquivos.js";

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (mes) => { const [a, m] = mes.split("-").map(Number); return `${MESES[m - 1]} ${a}`; };

export const dataPost = (t) => t.dataPublicacao || t.prazo || "";

/** Posts (tarefas do tipo Conteúdo) de um cliente num mês "AAAA-MM", em ordem de publicação. */
export function postsDoMes(clienteId, mes) {
  return dados.tarefas
    .filter((t) => t.tipo === TIPO_CONTEUDO && (!clienteId || t.clienteId === clienteId) && dataPost(t).startsWith(mes))
    .sort((a, b) => (dataPost(a) + (a.hora || "")).localeCompare(dataPost(b) + (b.hora || "")));
}

const nomeArquivo = (cliente, mes, ext) =>
  `Conteudo ${cliente?.nome || "Hyper"} ${nomeMes(mes)}.${ext}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .-]/g, "");

function baixar(blob, nome) {
  const a = el("a", { href: URL.createObjectURL(blob), download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- Excel ---------------- */
export async function exportarExcel(clienteId, mes) {
  const cliente = porId("clientes", clienteId);
  const posts = postsDoMes(clienteId, mes);
  if (!posts.length) { avisar("Nenhum post desse cliente neste mês.", "erro"); return; }
  const cabecalho = ["Data", "Dia", "Horário", "Formato", "Rede", "Tema", "Objetivo", "Briefing", "Legenda / copy", "Etapa", "Link da arte", "Aprovado? (sim/não)", "Comentários do cliente"];
  const linhas = posts.map((t) => [
    fmtData(dataPost(t)), fmtDiaSemana(dataPost(t)), t.hora || "", t.formato || "", t.rede || "", t.titulo || "",
    t.objetivo || "", t.roteiro || "", t.copy || "", rotuloStatusConteudo(t.statusConteudo || "ideia"), t.linkCanva || t.linkDrive || "", "", ""
  ]);
  const titulo = [`Conteúdo ${cliente?.nome || ""} — ${nomeMes(mes)}`];
  try {
    const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
    const ws = XLSX.utils.aoa_to_sheet([titulo, [], cabecalho, ...linhas]);
    ws["!cols"] = [10, 6, 8, 16, 12, 34, 24, 40, 60, 12, 30, 16, 36].map((wch) => ({ wch }));
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nomeMes(mes).slice(0, 31));
    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    baixar(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nomeArquivo(cliente, mes, "xlsx"));
  } catch (e) {
    // Sem acesso à biblioteca do Excel: entrega CSV, que também abre no Excel e no Google Sheets
    console.warn("XLSX indisponível, exportando CSV:", e);
    const csv = [cabecalho, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    baixar(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), nomeArquivo(cliente, mes, "csv"));
  }
  avisar("Planilha baixada.");
}

/* ---------------- PDF visual (página de impressão) ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function exportarPDF(clienteId, mes) {
  const cliente = porId("clientes", clienteId);
  const posts = postsDoMes(clienteId, mes);
  if (!posts.length) { avisar("Nenhum post desse cliente neste mês.", "erro"); return; }
  const janela = window.open("", "_blank");
  if (!janela) { avisar("O navegador bloqueou a nova janela. Permita pop-ups para este site.", "erro"); return; }
  janela.document.write("<p style='font-family:sans-serif;padding:40px'>Montando o PDF…</p>");

  let artes = [];
  try { artes = await listarSub(caminhoArtes(clienteId)); } catch (e) { console.warn("Sem artes:", e); }
  const artePorTarefa = {};
  artes.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0)).forEach((a) => { artePorTarefa[a.tarefaId] ??= a.dados; });

  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  const cards = posts.map((t) => `
    <article class="post">
      <div class="arte">${artePorTarefa[t.id] ? `<img src="${artePorTarefa[t.id]}" alt="">` : `<span>${esc(t.formato || "Post")}</span>`}</div>
      <div class="info">
        <div class="data">${esc(fmtDiaSemana(dataPost(t)))} · ${esc(fmtData(dataPost(t)))}${t.hora ? ` · ${esc(t.hora)}` : ""}</div>
        <h3>${esc(t.titulo)}</h3>
        <div class="tags"><span>${esc(t.formato || "")}</span><span>${esc(t.rede || "")}</span></div>
        ${t.objetivo ? `<p><b>Objetivo:</b> ${esc(t.objetivo)}</p>` : ""}
        ${t.copy ? `<p class="copy">${esc(t.copy)}</p>` : t.roteiro ? `<p class="copy">${esc(t.roteiro)}</p>` : ""}
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
<main>${cards}</main>
<footer>Hyper · Tráfego pago — para aprovar, marque cada post e devolva este arquivo ou responda com os ajustes.</footer>
<script>window.onload=()=>setTimeout(()=>window.print(),800)<\/script>
</body></html>`;
  // Página própria (blob) para o navegador carregar imagens e fontes normalmente
  janela.location.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
}
