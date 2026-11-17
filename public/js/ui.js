// Utilitários de interface: criação de elementos, modais, formulários, avisos e datas.

/** Cria um elemento. attrs aceita class, on{Evento}, dataset e atributos comuns. */
export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "style" && typeof v === "object") for (const [p, val] of Object.entries(v)) e.style.setProperty(p, val);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return e;
}

/* ---------------- Datas (sempre "AAAA-MM-DD", horário local) ---------------- */
export function hojeISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  return hojeISO(new Date(a, m - 1, d + n));
}
export function dataDe(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}
export function fmtData(iso, curta = false) {
  if (!iso) return "sem prazo";
  const [a, m, d] = iso.split("-");
  return curta ? `${d}/${m}` : `${d}/${m}/${a}`;
}
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function fmtDiaSemana(iso) {
  return DIAS[dataDe(iso).getDay()];
}
export function diasAte(iso) {
  return Math.round((dataDe(iso) - dataDe(hojeISO())) / 86400000);
}
export function fmtPrazoRelativo(iso) {
  if (!iso) return "sem prazo";
  const n = diasAte(iso);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  if (n < 0) return `${-n} dias atrás`;
  if (n < 7) return `${fmtDiaSemana(iso)}, ${fmtData(iso, true)}`;
  return fmtData(iso, true);
}

export const fmtMoeda = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ---------------- Avisos ---------------- */
export function avisar(msg, tipo = "ok") {
  const t = el("div", { class: `aviso aviso-${tipo}`, role: "status" }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("visivel"));
  setTimeout(() => { t.classList.remove("visivel"); setTimeout(() => t.remove(), 300); }, 3500);
}

/* ---------------- Modal ---------------- */
export function abrirModal(titulo, conteudo, { largo = false } = {}) {
  const fechar = () => { fundo.remove(); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") fechar(); };
  const caixa = el("div", { class: `modal${largo ? " modal-largo" : ""}`, role: "dialog", "aria-modal": "true" },
    el("div", { class: "modal-topo" },
      el("h2", {}, titulo),
      el("button", { class: "icone", "aria-label": "Fechar", onClick: fechar }, "✕")),
    conteudo);
  const fundo = el("div", { class: "modal-fundo", onMousedown: (e) => { if (e.target === fundo) fechar(); } }, caixa);
  document.body.append(fundo);
  document.addEventListener("keydown", esc);
  setTimeout(() => caixa.querySelector("input, select, textarea")?.focus(), 30);
  return fechar;
}

export function confirmar(msg) {
  return new Promise((ok) => {
    const fechar = abrirModal("Confirmar", el("div", {},
      el("p", {}, msg),
      el("div", { class: "acoes" },
        el("button", { class: "secundario", onClick: () => { fechar(); ok(false); } }, "Cancelar"),
        el("button", { class: "perigo", onClick: () => { fechar(); ok(true); } }, "Confirmar"))));
  });
}

/**
 * Formulário genérico em modal.
 * campos: [{ nome, rotulo, tipo: text|textarea|date|time|number|select|checkbox|checklist|multi, opcoes, obrigatorio, dica, largura: "metade" }]
 * Resolve com os valores ou null se cancelado. extras = elementos adicionais (ex.: botão excluir).
 */
export function formulario(titulo, campos, valores = {}, { aoSalvar, extras = [], rotuloSalvar = "Salvar", largo = false } = {}) {
  const entradas = {};
  const grade = el("div", { class: "form-grade" });
  for (const c of campos) {
    if (c.tipo === "secao") { grade.append(el("h3", { class: "form-secao" }, c.rotulo)); continue; }
    const v = valores[c.nome] ?? c.padrao ?? "";
    let entrada;
    if (c.tipo === "textarea") {
      entrada = el("textarea", { rows: c.linhas || 4, placeholder: c.dica || "" });
      entrada.value = v;
    } else if (c.tipo === "select") {
      entrada = el("select", {}, (c.opcoes || []).map((o) => {
        const [val, rot] = Array.isArray(o) ? o : [o, o];
        return el("option", { value: val, selected: String(val) === String(v) }, rot);
      }));
    } else if (c.tipo === "checkbox") {
      entrada = el("input", { type: "checkbox", checked: !!v });
    } else if (c.tipo === "multi") {
      const sel = new Set(v || []);
      entrada = el("div", { class: "multi" }, (c.opcoes || []).map((o) =>
        el("label", { class: "chip-check" }, el("input", { type: "checkbox", value: o, checked: sel.has(o) }), o)));
      entrada.valor = () => [...entrada.querySelectorAll("input:checked")].map((i) => i.value);
    } else if (c.tipo === "checklist") {
      entrada = editorChecklist(v || []);
    } else {
      entrada = el("input", { type: c.tipo || "text", placeholder: c.dica || "", step: c.tipo === "number" ? "0.01" : undefined });
      entrada.value = v;
    }
    if (c.obrigatorio && entrada.tagName !== "DIV") entrada.required = true;
    entradas[c.nome] = { c, entrada };
    const id = `f-${c.nome}`;
    entrada.id = id;
    grade.append(el("label", { class: `campo ${c.largura || ""} ${c.tipo === "checkbox" ? "campo-check" : ""}`, for: id },
      c.tipo === "checkbox" ? [entrada, el("span", {}, c.rotulo)] : [el("span", {}, c.rotulo), entrada]));
  }
  return new Promise((resolver) => {
    let fechar;
    const form = el("form", {
      onSubmit: async (e) => {
        e.preventDefault();
        const out = {};
        for (const [nome, { c, entrada }] of Object.entries(entradas)) {
          if (c.tipo === "checkbox") out[nome] = entrada.checked;
          else if (c.tipo === "multi" || c.tipo === "checklist") out[nome] = entrada.valor();
          else if (c.tipo === "number") out[nome] = entrada.value === "" ? null : Number(entrada.value);
          else out[nome] = entrada.value.trim();
        }
        const botao = form.querySelector("button[type=submit]");
        botao.disabled = true;
        try {
          if (aoSalvar) await aoSalvar(out);
          fechar();
          resolver(out);
        } catch (erro) {
          console.error(erro);
          avisar("Não foi possível salvar: " + erro.message, "erro");
          botao.disabled = false;
        }
      }
    }, grade, el("div", { class: "acoes" }, extras,
      el("span", { class: "espaco" }),
      el("button", { type: "button", class: "secundario", onClick: () => { fechar(); resolver(null); } }, "Cancelar"),
      el("button", { type: "submit" }, rotuloSalvar)));
    fechar = abrirModal(titulo, form, { largo });
  });
}

function editorChecklist(itens) {
  const lista = el("ul", { class: "checklist-editor" });
  const add = (texto = "", feito = false) => {
    const cb = el("input", { type: "checkbox", checked: feito, "aria-label": "Feito" });
    const tx = el("input", { type: "text", value: texto, placeholder: "Entrega (ex.: Carrossel | Black Week 20/11)" });
    const li = el("li", {}, cb, tx, el("button", { type: "button", class: "icone", "aria-label": "Remover", onClick: () => li.remove() }, "✕"));
    tx.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); lista.lastChild.querySelector("input[type=text]").focus(); } });
    lista.append(li);
  };
  itens.forEach((i) => add(i.texto, i.feito));
  const caixa = el("div", { class: "checklist-caixa" }, lista,
    el("button", { type: "button", class: "link", onClick: () => { add(); lista.lastChild.querySelector("input[type=text]").focus(); } }, "+ Adicionar entrega"));
  caixa.valor = () => [...lista.children]
    .map((li) => ({ texto: li.querySelector("input[type=text]").value.trim(), feito: li.querySelector("input[type=checkbox]").checked }))
    .filter((i) => i.texto);
  return caixa;
}

/* ---------------- Diversos ---------------- */
export function vazio(msg, acao) {
  return el("div", { class: "vazio" }, el("p", {}, msg), acao || null);
}

export function linkExterno(url, rotulo) {
  if (!url) return null;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return el("a", { href, target: "_blank", rel: "noopener", class: "link-externo" }, rotulo);
}

export function normalizar(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
