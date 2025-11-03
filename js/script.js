const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status");
const qEl = document.getElementById("q");
const glassEl = document.getElementById("glass");
const unitToggleEl = document.getElementById("unitToggle");
const compactEl = document.getElementById("compact");

document.getElementById("year").textContent = new Date().getFullYear();

let data = [];
let viewUnit = "cl"; // "cl" | "oz"

init();

async function init() {
  try {
    setStatus("Henter cocktails…");
    const res = await fetch("./data/cocktails.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();

    buildGlassOptions(data);
    clearStatus();
    render();

    // events
    qEl.addEventListener("input", render);
    glassEl.addEventListener("change", render);
    compactEl.addEventListener("change", render);
    unitToggleEl.addEventListener("click", () => {
      viewUnit = viewUnit === "cl" ? "oz" : "cl";
      unitToggleEl.textContent = viewUnit === "cl" ? "Vis i oz" : "Vis i cl";
      unitToggleEl.setAttribute("aria-pressed", String(viewUnit === "oz"));
      render();
    });
  } catch (err) {
    console.error(err);
    setStatus("Kunne ikke hente data (kør via en lokal server).");
  }
}

function buildGlassOptions(list) {
  const set = new Set();
  list.forEach((x) => x.glastype && set.add(x.glastype));
  const arr = Array.from(set).sort((a, b) => a.localeCompare(b, "da"));
  for (const g of arr) {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    glassEl.appendChild(opt);
  }
}

function render() {
  const query = qEl.value.trim().toLowerCase();
  const glass = glassEl.value.trim();

  const filtered = data.filter((x) => {
    if (glass && (x.glastype || "").toLowerCase() !== glass.toLowerCase()) return false;
    if (!query) return true;
    const hay = [x.titel, x.glastype, x.garnish, ...(x.ingredienser?.map((i) => i.ingrediens) ?? [])].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(query);
  });

  const frag = document.createDocumentFragment();
  filtered.forEach((item) => frag.appendChild(createCard(item)));
  cardsEl.replaceChildren(frag);
}

function createCard(item) {
  const { titel = "Uden titel", glastype = "—", garnish = "—", ingredienser = null, fremgangsmåde: steps = [], billede = "" } = item;

  const card = el("article", { class: "card" });
  if (compactEl.checked) card.classList.add("compact");

  // figure
  const figure = el("div", { class: "card-figure" });
  if (billede) {
    figure.appendChild(el("img", { src: billede, alt: `Billede af ${titel}` }));
  } else {
    const ph = el("div", { class: "placeholder" });
    ph.textContent = "Billede kommer senere";
    figure.appendChild(ph);
  }

  // body
  const body = el("div", { class: "card-body" });
  const h3 = el("h3", { class: "card-title" }, titel);

  const meta = el("div", { class: "meta" });
  meta.append(chip(`Glas: ${glastype}`), chip(`Garnish: ${garnish}`));

  // ingredients (tydelige mål)
  const ingBox = el("div", { class: "ingredients" });
  if (Array.isArray(ingredienser) && ingredienser.length) {
    ingredienser.forEach((row) => ingBox.appendChild(ingredientRow(row)));
  } else {
    const r = el("div", { class: "ing-row" });
    r.append(el("div", { class: "measure" }, "—"), el("div", { class: "ing-name" }, "Ingen ingrediensliste – se fremgangsmåden."));
    ingBox.appendChild(r);
  }

  // steps
  const stepsList = el("ol", { class: "steps" });
  (Array.isArray(steps) ? steps : [String(steps)]).forEach((s) => {
    stepsList.appendChild(el("li", {}, s));
  });

  body.append(h3, meta, ingBox, stepsList);

  // footer
  const footer = el("div", { class: "card-footer" });
  footer.append(
    el("div", { class: "helper" }, viewUnit === "cl" ? "Tip: Tryk 'Vis i oz' for US-mål" : "Tip: Tryk 'Vis i cl' for metriske mål"),
    copyBtn(() => titel, "Kopier titel")
  );

  const wrap = document.createDocumentFragment();
  wrap.append(figure, body, footer);
  card.append(wrap);
  return card;
}

function ingredientRow(row) {
  const { mængde = null, enhed = "", ingrediens = "", valgfri = false, note = "" } = row;
  const m = formatMeasure(mængde, enhed || "");

  const line = el("div", { class: "ing-row" });
  const measure = el("div", { class: "measure" }, m);
  const name = el("div", { class: "ing-name" });

  name.append(document.createTextNode(ingrediens || "—"));
  if (valgfri) name.append(el("span", { class: "ing-optional" }, "(valgfri)"));
  if (note) name.append(el("div", { class: "ing-note" }, note));

  line.append(measure, name);
  return line;
}

// Enhedsvisning
function formatMeasure(n, unit) {
  if (n == null) return "—";
  const u = (unit || "").toLowerCase();

  if (viewUnit === "cl") {
    // Vis som indtastet, men normaliser små enheder lidt
    if (u === "oz") return toFixedSafe(n * 2.95735) + " cl";
    return `${toFixedSmart(n)} ${unit || ""}`.trim();
  } else {
    // oz-visning
    if (u === "cl") return toFixedSmart(n * 0.33814) + " oz";
    if (u === "ml") return toFixedSmart(n * 0.033814) + " oz";
    if (u === "dl") return toFixedSmart(n * 3.3814) + " oz";
    // ikke-volumen (dash, stk, barspoon) vises som er
    return `${toFixedSmart(n)} ${unit}`.trim();
  }
}

function toFixedSmart(x) {
  if (x == null || isNaN(+x)) return String(x ?? "");
  const v = Number(x);
  // 0.5 -> 0.5 | 2 -> 2 | 2.25 -> 2.3
  if (v >= 10) return v.toFixed(0);
  if (v >= 3) return v.toFixed(1);
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function toFixedSafe(x) {
  const v = Number(x);
  if (!isFinite(v)) return "—";
  return v.toFixed(1).replace(/\.0$/, "");
}

function copyBtn(getText, label) {
  const btn = el("button", { class: "btn", type: "button" }, label);
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard?.writeText(String(getText() ?? ""));
      btn.textContent = "Kopieret!";
      setTimeout(() => (btn.textContent = label), 1200);
    } catch {
      btn.textContent = "Kunne ikke kopiere";
      setTimeout(() => (btn.textContent = label), 1400);
    }
  });
  return btn;
}

function chip(text) {
  return el("span", { class: "chip" }, text);
}
function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, v);
  }
  if (text != null) node.textContent = text;
  return node;
}
function setStatus(msg) {
  statusEl.classList.remove("visually-hidden");
  statusEl.textContent = msg;
}
function clearStatus() {
  statusEl.classList.add("visually-hidden");
  statusEl.textContent = "";
}
