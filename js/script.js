// DOM references
const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status");
const qEl = document.getElementById("q");
const glassEl = document.getElementById("glass");
const unitToggleEl = document.getElementById("unitToggle");
const openListEl = document.getElementById("openList");
const listSortEl = document.getElementById("listSort");

const dlg = document.getElementById("recipeDialog");
const modalContent = document.getElementById("modalContent");
const listDlg = document.getElementById("listDialog");
const listContainer = document.getElementById("listContainer");

document.getElementById("year").textContent = new Date().getFullYear();

// luk-knapper i dialogs
document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", (e) => e.target.closest("dialog").close()));

// data
let data = [];
let viewUnit = "cl"; // "cl" | "oz"
let usageMap = null; // Map over ingrediens → { name, count }

// init
init();

async function init() {
  try {
    setStatus("Henter cocktails…");
    const res = await fetch("./data/cocktails.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();

    buildGlassOptions(data);
    usageMap = buildUsage(data);

    clearStatus();
    render();

    // events
    qEl.addEventListener("input", render);
    glassEl.addEventListener("change", render);

    unitToggleEl.addEventListener("click", () => {
      viewUnit = viewUnit === "cl" ? "oz" : "cl";
      unitToggleEl.textContent = viewUnit === "cl" ? "Vis i oz" : "Vis i cl";
      unitToggleEl.setAttribute("aria-pressed", String(viewUnit === "oz"));

      // opdater åben opskrift-modal (så mål skifter)
      if (dlg.open && dlg.dataset.idx) openModal(+dlg.dataset.idx);
      // grid skal ikke redesignes, men mål i små cards er ikke vist, så det er fint
    });

    openListEl.addEventListener("click", (e) => {
      e.preventDefault();
      if (!usageMap) usageMap = buildUsage(data);
      renderShoppingList(usageMap);
      if (!listDlg.open) listDlg.showModal();
    });

    if (listSortEl) {
      listSortEl.addEventListener("change", () => {
        if (listDlg.open && usageMap) renderShoppingList(usageMap);
      });
    }

    // Ekstra popovers
    const termsDlg = document.getElementById("termsDialog");
    const toolsDlg = document.getElementById("toolsDialog");
    const glassesDlg = document.getElementById("glassesDialog");

    document.getElementById("openTerms").addEventListener("click", (e) => {
      e.preventDefault();
      termsDlg.showModal();
    });
    document.getElementById("openTools").addEventListener("click", (e) => {
      e.preventDefault();
      toolsDlg.showModal();
    });
    document.getElementById("openGlasses").addEventListener("click", (e) => {
      e.preventDefault();
      glassesDlg.showModal();
    });

    // Luk alle dialogs på klik udenfor eller ESC
    [termsDlg, toolsDlg, glassesDlg].forEach((d) => {
      d.addEventListener("cancel", (e) => {
        e.preventDefault();
        d.close();
      });
      d.addEventListener("click", (e) => {
        if (e.target === d) d.close();
      });
    });

    // === BAR-TERMS SEARCH ===
    const termSearch = document.getElementById("termSearch");
    if (termSearch) {
      termSearch.addEventListener("input", () => {
        const q = termSearch.value.trim().toLowerCase();
        const cards = document.querySelectorAll("#termGrid .term-card");
        cards.forEach((c) => {
          const text = c.innerText.toLowerCase();
          c.style.display = text.includes(q) ? "" : "none";
        });
      });
    }

    // dialog UX: ESC + klik på baggrund
    [dlg, listDlg].forEach((d) => {
      d.addEventListener("cancel", (e) => {
        e.preventDefault();
        d.close();
      });
      d.addEventListener("click", (e) => {
        if (e.target === d) d.close();
      });
    });
  } catch (err) {
    console.error(err);
    setStatus("Kunne ikke hente data (kør via en lokal server).");
  }
}

/* ---------- Filter og grid ---------- */

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
  filtered.forEach((item) => frag.appendChild(createMiniCard(item)));
  cardsEl.replaceChildren(frag);
}

function createMiniCard(item) {
  const { titel = "Uden titel", billede = "", glastype = "—", garnish = "—" } = item;
  const idx = data.indexOf(item);

  const card = el("button", {
    class: "card-mini",
    type: "button",
    "aria-haspopup": "dialog",
    "aria-label": `Vis ${titel}`,
  });

  const thumb = el("div", { class: "thumb" });
  if (billede) {
    thumb.appendChild(el("img", { src: billede, alt: "" }));
  } else {
    thumb.appendChild(el("div", { class: "ph" }, "Billede\nsenere"));
  }

  const title = el("div", { class: "title" }, titel);

  card.append(thumb, title);

  card.addEventListener("click", () => openModal(idx));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal(idx);
    }
  });

  // lille tooltip
  card.title = `${titel} • ${glastype} • ${garnish}`;

  return card;
}

/* ---------- Opskrift-modal ---------- */

function openModal(idx) {
  const item = data[idx];
  if (!item) return;

  dlg.dataset.idx = String(idx);
  modalContent.replaceChildren(renderModalContent(item));

  if (!dlg.open) dlg.showModal();
  dlg.querySelector("[data-close]")?.focus();
}

function renderModalContent(item) {
  const { titel = "Uden titel", glastype = "—", garnish = "—", ingredienser = [], fremgangsmåde: steps = [], billede = "" } = item;

  const frag = document.createDocumentFragment();

  // titel + meta
  frag.append(el("h2", { class: "modal-title" }, titel));

  const meta = el("div", { class: "meta" });
  meta.append(chip(`Glas: ${glastype}`), chip(`Garnish: ${garnish}`));
  frag.append(meta);

  // billede
  const hero = el("div", { class: "modal-hero" });
  if (billede) {
    hero.appendChild(el("img", { src: billede, alt: `Billede af ${titel}` }));
  } else {
    hero.appendChild(el("div", { class: "thumb ph", style: "height:100%" }, "Billede kommer senere"));
  }
  frag.append(hero);

  // ingredienser
  frag.append(el("h3", {}, "Ingredienser"));
  const ingBox = el("div", { class: "ingredients" });
  if (ingredienser.length) {
    ingredienser.forEach((r) => ingBox.appendChild(ingredientRow(r)));
  } else {
    const r = el("div", { class: "ing-row" });
    r.append(el("div", { class: "measure" }, "—"), el("div", { class: "ing-name" }, "Se fremgangsmåden."));
    ingBox.appendChild(r);
  }
  frag.append(ingBox);

  // fremgangsmåde
  frag.append(el("h3", {}, "Fremgangsmåde"));
  const stepsList = el("ol", { class: "steps" });
  (Array.isArray(steps) ? steps : [String(steps)]).forEach((s) => stepsList.appendChild(el("li", {}, s)));
  frag.append(stepsList);

  // lille hjælpetekst
  frag.append(el("div", { class: "modal-footer" }, el("div", { class: "helper" }, viewUnit === "cl" ? "Tip: Skift til oz for US-mål" : "Tip: Skift til cl for metriske mål")));

  return frag;
}

/* ---------- Indkøbsliste: brugstælling ---------- */

// buildUsage: hvor mange drinks bruger hver ingrediens (ingen mængder)
function buildUsage(list) {
  const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

  const map = new Map(); // key = normName → { name, count }

  list.forEach((drink) => {
    const seenInThisDrink = new Set();
    (drink.ingredienser || []).forEach((row) => {
      const raw = row?.ingrediens || "";
      const key = norm(raw);
      if (!key || seenInThisDrink.has(key)) return;

      seenInThisDrink.add(key);

      if (!map.has(key)) {
        map.set(key, { name: raw.trim(), count: 1 });
      } else {
        map.get(key).count += 1;
      }
    });
  });

  return map;
}

function renderShoppingList(map) {
  const sortMode = listSortEl?.value || "most";

  const rows = Array.from(map.values());
  if (sortMode === "alpha") {
    rows.sort((a, b) => a.name.localeCompare(b.name, "da"));
  } else {
    // "most": flest drinks først
    rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "da"));
  }

  const table = document.createElement("table");
  table.className = "list-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Ingrediens</th><th>Bruges i</th></tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.forEach(({ name, count }) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}</td>` + `<td class="qty">${count} ${count === 1 ? "drink" : "drinks"}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  listContainer.replaceChildren(table);
}

/* ---------- Helpers ---------- */

function ingredientRow(row) {
  const { mængde = null, enhed = "", ingrediens = "", valgfri = false, note = "" } = row;

  const m = formatMeasure(mængde, enhed || "");

  const line = el("div", { class: "ing-row" });
  const measure = el("div", { class: "measure" }, m);
  const name = el("div", { class: "ing-name" });

  name.append(document.createTextNode(ingrediens || "—"));
  if (valgfri) {
    name.append(el("span", { class: "ing-optional" }, "(valgfri)"));
  }
  if (note) {
    name.append(el("div", { class: "ing-note" }, note));
  }

  line.append(measure, name);
  return line;
}

// Visning af mål i opskrift
function formatMeasure(n, unit) {
  if (n == null) return "—";
  const u = (unit || "").toLowerCase();

  if (viewUnit === "cl") {
    if (u === "oz") return toFixedSafe(n * 2.95735) + " cl";
    if (u === "ml") return toFixedSmart(n / 10) + " cl";
    if (u === "dl") return toFixedSmart(n * 10) + " cl";
    return `${toFixedSmart(n)} ${unit || ""}`.trim();
  } else {
    if (u === "cl") return toFixedSmart(n * 0.33814) + " oz";
    if (u === "ml") return toFixedSmart(n * 0.033814) + " oz";
    if (u === "dl") return toFixedSmart(n * 3.3814) + " oz";
    return `${toFixedSmart(n)} ${unit}`.trim();
  }
}

function toFixedSmart(x) {
  if (x == null || isNaN(+x)) return String(x ?? "");
  const v = Number(x);
  if (v >= 10) return v.toFixed(0);
  if (v >= 3) return v.toFixed(1);
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function toFixedSafe(x) {
  const v = Number(x);
  if (!isFinite(v)) return "—";
  return v.toFixed(1).replace(/\.0$/, "");
}

function chip(text) {
  return el("span", { class: "chip" }, text);
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
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
