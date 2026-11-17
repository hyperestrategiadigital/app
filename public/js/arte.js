// Desenho da arte final: imagem de fundo + degradê + textos + logo, num canvas no tamanho do formato.

function quebrarLinhas(ctx, texto, larguraMax) {
  const linhas = [];
  for (const paragrafo of String(texto || "").split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(teste).width > larguraMax && atual) { linhas.push(atual); atual = palavra; }
      else atual = teste;
    }
    linhas.push(atual);
  }
  return linhas.filter((l, i, a) => l || (i > 0 && i < a.length - 1));
}

function hexParaRGBA(hex, alfa) {
  const h = (hex || "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

/**
 * Desenha a arte no canvas.
 * cfg: { W, H, titulo, subtitulo, cta, fonteTitulo, fonteTexto, caixaAlta, corTexto, corCta, corCtaTexto,
 *        tamTitulo, tamSub, alinhamento: left|center|right, posicao: topo|centro|base, enquadramento (-50..50),
 *        degrade (bool), corDegrade, intensidade (0..1), logo (bool), posLogo: sup-esq|sup-dir|inf-esq|inf-dir|inf-centro, tamLogo }
 * recursos: { imagem: HTMLImageElement|null, logo: HTMLImageElement|null }
 */
export function desenharArte(canvas, cfg, { imagem, logo } = {}) {
  const { W, H } = cfg;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  // Fundo: imagem em modo "cobrir", com ajuste vertical
  ctx.fillStyle = cfg.corDegrade || "#4E2CA3";
  ctx.fillRect(0, 0, W, H);
  if (imagem) {
    const escala = Math.max(W / imagem.naturalWidth, H / imagem.naturalHeight);
    const w = imagem.naturalWidth * escala, h = imagem.naturalHeight * escala;
    const folgaY = h - H, folgaX = w - W;
    const desloc = (Number(cfg.enquadramento) || 0) / 100; // -0.5..0.5
    ctx.drawImage(imagem, -folgaX / 2, -folgaY / 2 + desloc * folgaY, w, h);
  }

  const margem = Math.round(W * 0.07);
  const larguraTexto = W - margem * 2;
  const pos = cfg.posicao || "base";

  // Degradê para dar leitura ao texto
  if (cfg.degrade !== false && (cfg.titulo || cfg.subtitulo || cfg.cta)) {
    const a = Number(cfg.intensidade ?? 0.7);
    let g;
    if (pos === "topo") { g = ctx.createLinearGradient(0, 0, 0, H * 0.6); g.addColorStop(0, hexParaRGBA(cfg.corDegrade, a)); g.addColorStop(1, hexParaRGBA(cfg.corDegrade, 0)); }
    else if (pos === "centro") { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, hexParaRGBA(cfg.corDegrade, 0)); g.addColorStop(0.5, hexParaRGBA(cfg.corDegrade, a)); g.addColorStop(1, hexParaRGBA(cfg.corDegrade, 0)); }
    else { g = ctx.createLinearGradient(0, H * 0.35, 0, H); g.addColorStop(0, hexParaRGBA(cfg.corDegrade, 0)); g.addColorStop(1, hexParaRGBA(cfg.corDegrade, a)); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Monta os blocos de texto para medir a altura total
  const tamT = Math.round(W * (Number(cfg.tamTitulo) || 9) / 100);
  const tamS = Math.round(W * (Number(cfg.tamSub) || 4) / 100);
  const tamC = Math.round(tamS * 0.95);
  const fonteT = `800 ${tamT}px "${cfg.fonteTitulo || "Barlow Condensed"}", "Arial Narrow", sans-serif`;
  const fonteS = `500 ${tamS}px "${cfg.fonteTexto || "Montserrat"}", sans-serif`;
  const fonteC = `700 ${tamC}px "${cfg.fonteTexto || "Montserrat"}", sans-serif`;
  const titulo = cfg.caixaAlta ? (cfg.titulo || "").toUpperCase() : cfg.titulo;

  ctx.font = fonteT; const linhasT = titulo ? quebrarLinhas(ctx, titulo, larguraTexto) : [];
  ctx.font = fonteS; const linhasS = cfg.subtitulo ? quebrarLinhas(ctx, cfg.subtitulo, larguraTexto) : [];
  ctx.font = fonteC; const larguraCta = cfg.cta ? ctx.measureText(cfg.cta).width + tamC * 2 : 0;
  const alturaCta = cfg.cta ? tamC * 2.4 : 0;
  const altT = linhasT.length * tamT * 1.02;
  const altS = linhasS.length * tamS * 1.3;
  const espaco = tamS * 0.9;
  const total = altT + (altS ? espaco + altS : 0) + (alturaCta ? espaco * 1.3 + alturaCta : 0);

  let y = pos === "topo" ? margem * 1.2 : pos === "centro" ? (H - total) / 2 : H - margem * 1.3 - total;
  if (cfg.logo && logo && pos === "topo" && /sup/.test(cfg.posLogo || "")) y += W * ((Number(cfg.tamLogo) || 18) / 100) * 0.6 + margem * 0.4;
  if (cfg.logo && logo && pos === "base" && /inf/.test(cfg.posLogo || "inf")) y -= W * ((Number(cfg.tamLogo) || 18) / 100) * 0.5 + margem * 0.3;

  const alin = cfg.alinhamento || "left";
  const xTexto = alin === "center" ? W / 2 : alin === "right" ? W - margem : margem;
  ctx.textAlign = alin;
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = cfg.degrade === false ? Math.round(W * 0.01) : 0;

  ctx.fillStyle = cfg.corTexto || "#FFFFFF";
  ctx.font = fonteT;
  for (const l of linhasT) { ctx.fillText(l, xTexto, y); y += tamT * 1.02; }
  if (linhasS.length) {
    y += espaco;
    ctx.font = fonteS;
    for (const l of linhasS) { ctx.fillText(l, xTexto, y); y += tamS * 1.3; }
  }
  ctx.shadowBlur = 0;
  if (cfg.cta) {
    y += espaco * 1.3;
    const x0 = alin === "center" ? (W - larguraCta) / 2 : alin === "right" ? W - margem - larguraCta : margem;
    ctx.fillStyle = cfg.corCta || "#FFC130";
    const r = alturaCta / 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x0, y, larguraCta, alturaCta, r) : ctx.rect(x0, y, larguraCta, alturaCta);
    ctx.fill();
    ctx.fillStyle = cfg.corCtaTexto || "#000000";
    ctx.font = fonteC;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cfg.cta, x0 + larguraCta / 2, y + alturaCta / 2 + tamC * 0.05);
  }

  // Logo
  if (cfg.logo && logo) {
    const lw = W * ((Number(cfg.tamLogo) || 18) / 100);
    const lh = lw * (logo.naturalHeight / logo.naturalWidth);
    const p = cfg.posLogo || "inf-dir";
    const lx = p.endsWith("esq") ? margem : p.endsWith("centro") ? (W - lw) / 2 : W - margem - lw;
    const ly = p.startsWith("sup") ? margem * 0.8 : H - margem * 0.8 - lh;
    ctx.drawImage(logo, lx, ly, lw, lh);
  }
}
