/* =========================================================
   Milio — main.js
   Opstart, routing, zijbalk, thema en sneltoetsen.
   ========================================================= */
import { $, el, svg, icoon, vandaag } from "./util.js";
import { S, laad, opWijziging, voortgang, zetInst } from "./store.js";
import { vakModal } from "./modals.js";
import { renderOverzicht, renderVak } from "./views/vakken.js";
import * as kalender from "./views/kalender.js";
import * as kompas from "./views/vandaag.js";
import * as focus from "./views/focus.js";

// ---------- Views ----------
// vol = de view vult het hele scherm zonder te scrollen (kalender, focus)
const VIEWS = {
  vandaag: { ...kompas, nav: "vandaag" },
  kalender: { ...kalender, nav: "kalender", vol: true },
  vakken: { render: renderOverzicht, nav: "vakken" },
  vak: { render: renderVak, nav: "vakken" },
  focus: { ...focus, nav: "focus", vol: true },
};
const NAV = [
  { route: "vandaag", label: "Kompas", icoon: "kompas", teller: () => tellerEl(kompasOpen()) },
  { route: "kalender", label: "Kalender", icoon: "kalender" },
  { route: "vakken", label: "Vakken", icoon: "vakken" },
  { route: "focus", label: "Focus", icoon: "focus" },
];
const STANDAARD = "vandaag";

function kompasOpen() {
  try {
    const k = JSON.parse(S.inst.kompas || "null");
    return k?.dag === vandaag() ? k.ids.filter((id) => S.taken.some((t) => t.id === id && !t.klaar)).length : 0;
  } catch { return 0; }
}
const tellerEl = (n, dringend = false) => (n ? el("span", { class: "nav-teller" + (dringend ? " dringend" : "") }, n) : null);

let vorigeRoute = "";
let huidigeView = null;
let uitgesteld = false; // er kwam een wijziging binnen tijdens het slepen

function leesRoute() {
  const [naam = STANDAARD, arg] = location.hash.replace(/^#\/?/, "").split("/");
  return { naam: VIEWS[naam] ? naam : STANDAARD, arg, sleutel: `${naam}/${arg || ""}` };
}

function render() {
  if (huidigeView?.bezig?.()) { uitgesteld = true; return; }
  uitgesteld = false;
  const route = leesRoute();
  const def = VIEWS[route.naam];
  const hoofd = $("#hoofd");
  const nieuw = route.sleutel !== vorigeRoute;
  const scroll = hoofd.scrollTop;

  const sectie = el("section", { class: "view" + (def.vol ? " vol" : "") + (nieuw ? " nieuw" : "") });
  huidigeView = def;
  def.render(sectie, route.arg === undefined ? undefined : Number(route.arg) || route.arg);
  hoofd.replaceChildren(sectie);
  def.naRender?.(sectie);
  hoofd.scrollTop = nieuw ? 0 : scroll;
  vorigeRoute = route.sleutel;
  renderZijbalk(def.nav, route);
}

// Klok: views met een tik() krijgen elke halve minuut een seintje (nu-lijn, dagboog).
let laatsteDag = null;
setInterval(() => {
  const dag = new Date().toDateString();
  if (laatsteDag && dag !== laatsteDag) render(); // middernacht: alles opnieuw
  laatsteDag = dag;
  if (uitgesteld) render();
  else huidigeView?.tik?.($("#hoofd > .view"));
}, 30000);

// Elke seconde: de lopende focustimer in de zijbalk en de tabtitel.
setInterval(() => {
  const st = focus.focusStaat();
  document.title = st ? `${focus.klokTekst(st)} · ${st.titel || "Focus"}` : "Milio";
  const pil = $(".focus-pil-tijd");
  if (pil && st) pil.textContent = focus.klokTekst(st);
}, 1000);

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (huidigeView?.naRender) render(); }, 120);
});

// ---------- Zijbalk ----------
const THEMAS = { dark: "Donker", grey: "Grijs", light: "Licht" };
// Inline (niet als <img>), anders flikkert het logo bij elke her-render.
const LOGO = `<svg class="merk-logo" viewBox="0 0 32 32" aria-hidden="true">
  <defs><linearGradient id="logo-lucht" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9db2ff"/><stop offset="1" stop-color="#5a6fd8"/></linearGradient></defs>
  <rect width="32" height="32" rx="8" fill="url(#logo-lucht)"/><circle cx="21.5" cy="10.5" r="3.4" fill="#ffe0a3"/>
  <path d="M3 27 L11.5 14 L15.5 19.5 L19.5 15 L29 27 Z" fill="#fff" opacity=".96"/></svg>`;

function pasThemaToe(thema) {
  document.documentElement.dataset.thema = thema;
  localStorage.setItem("milio-thema", thema);
}

function renderZijbalk(actief, route) {
  const z = $("#zijbalk");
  z.classList.toggle("ingeklapt", S.inst.sidebar_ingeklapt === "1");
  const thema = S.inst.thema || "dark";

  z.replaceChildren(...[
    el("div", { class: "merk" },
      svg(LOGO),
      el("span", { class: "merk-naam" }, "Milio"),
      el("button", {
        class: "icoon-knop", title: "Zijbalk in-/uitklappen", "aria-label": "Zijbalk in-/uitklappen",
        onclick: () => zetInst({ sidebar_ingeklapt: S.inst.sidebar_ingeklapt === "1" ? "0" : "1" }),
      }, icoon("zijbalk", 18, 1.7)),
    ),
    el("nav", { class: "nav" }, NAV.map((n) =>
      el("a", { class: "nav-item" + (n.route === actief ? " actief" : ""), href: `#/${n.route}`, title: n.label },
        icoon(n.icoon, 18, 1.8), el("span", { class: "label" }, n.label), n.teller?.() || null))),
    focus.focusStaat() && actief !== "focus"
      ? el("a", { class: "focus-pil", href: "#/focus", title: "Focussessie loopt" },
        el("span", { class: "puls" }), el("span", { class: "label" }, "Focus"), el("span", { class: "focus-pil-tijd label" }))
      : null,

    el("div", { class: "zijbalk-sectie" },
      el("span", {}, "Vakken"),
      el("button", { class: "icoon-knop klein", title: "Nieuw vak", onclick: () => vakModal(null, (v) => (location.hash = `#/vak/${v.id}`)) }, icoon("plus", 15, 2.2)),
    ),
    el("div", { class: "zijbalk-vakken" }, S.vakken.map((v) =>
      el("a", {
        class: "vak-nav" + (route.naam === "vak" && Number(route.arg) === v.id ? " actief" : ""),
        href: `#/vak/${v.id}`, title: v.naam, style: { "--k": v.kleur },
      },
        el("span", { class: "stip" }),
        el("span", { class: "vak-nav-naam" }, v.naam),
        el("span", { class: "vak-nav-pct" }, voortgang(v.id).totaal ? voortgang(v.id).pct + "%" : ""),
      ))),

    el("div", { class: "zijbalk-voet" },
      el("button", {
        class: "icoon-knop", title: "Thema wisselen",
        onclick: () => {
          const lijst = Object.keys(THEMAS);
          const volgende = lijst[(lijst.indexOf(thema) + 1) % lijst.length];
          pasThemaToe(volgende);
          zetInst({ thema: volgende });
        },
      }, icoon(thema === "light" ? "zon" : "maan", 17, 1.8)),
      el("span", { class: "thema-label" }, THEMAS[thema]),
    ),
  ].filter(Boolean));
}

// ---------- Sneltoetsen ----------
document.addEventListener("keydown", (e) => {
  if (document.querySelector(".modal-laag")) return;
  if (e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  huidigeView?.toets?.(e);
});

// ---------- Start ----------
async function start() {
  opWijziging(render);
  window.addEventListener("hashchange", render);
  try {
    await laad();
    pasThemaToe(S.inst.thema || "dark");
  } catch {
    $("#hoofd").replaceChildren(el("div", { class: "view" }, el("div", { class: "leeg" },
      el("strong", {}, "Milio kan de server niet bereiken"),
      el("span", {}, "Start de app via start_app.bat en laat het zwarte venster openstaan."))));
  }
}
start();
