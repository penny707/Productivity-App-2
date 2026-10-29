/* =========================================================
   Milio — views/kalender.js
   Week- en maandweergave. Past altijd in het scherm (geen scrollen):
   de uren schalen mee met de hoogte van je venster. Navigeren met de pijltjes.
   Slepen in een lege plek = nieuw event, slepen op een event = verplaatsen,
   onderrand slepen = verlengen. Deadlines en streefmomenten staan in de dagrij.
   ========================================================= */
import {
  el, icoon, toast, vandaag, plusDagen, maandagVan, weekNummer, fmtDag, fmtTijd, fmtDuur,
  naarWand, vanWand, minVanDag, moment, nuMinuten, dagVerschil,
} from "../util.js";
import { S, meld, vak, vakVanTaak, bewaar, verwijder, laadEvents, eventsTussen, bereik, eventKleur, onderdeelPad, taak } from "../store.js";
import { formModal, veld, kleurKiezer, bevestig, taakModal } from "../modals.js";

const SNAP = 15; // minuten
const MAX_DAGRIJEN = 3;
let weergave = localStorage.getItem("milio-kal-weergave") || "week";
let anker = sessionStorage.getItem("milio-kal-anker") || vandaag();
let concept = null; // nieuw event dat nog in de modal zit
let sleep = null;   // lopende sleepactie
let annuleerSleep = () => {};
let dagrijOpen = false;
const geladen = new Set();

const hoofdletter = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const urenBereik = () => {
  const ds = Math.max(0, Math.min(23, Number(S.inst.dag_start ?? 7)));
  const de = Math.max(ds + 1, Math.min(24, Number(S.inst.dag_eind ?? 24)));
  return [ds, de];
};

function zetAnker(dag) {
  anker = dag;
  sessionStorage.setItem("milio-kal-anker", dag);
  meld();
}
function zetWeergave(w) {
  weergave = w;
  localStorage.setItem("milio-kal-weergave", w);
  meld();
}
function stap(richting) {
  if (weergave === "week") return zetAnker(plusDagen(anker, 7 * richting));
  const [y, m] = anker.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + richting, 1));
  zetAnker(d.toISOString().slice(0, 10));
}

function zichtbareDagen() {
  if (weergave === "week") {
    const van = maandagVan(anker);
    return Array.from({ length: 7 }, (_, i) => plusDagen(van, i));
  }
  const van = maandagVan(anker.slice(0, 8) + "01");
  return Array.from({ length: 42 }, (_, i) => plusDagen(van, i));
}

function zorgVoorEvents(van, tot) {
  const k = `${van}|${tot}`;
  if (geladen.has(k)) return;
  geladen.add(k);
  laadEvents(van, tot).catch(() => geladen.delete(k));
}

function titelVan(dagen) {
  if (weergave === "maand") return hoofdletter(fmtDag(anker, { month: "long", year: "numeric" }));
  const a = dagen[0], b = dagen.at(-1);
  if (a.slice(0, 7) === b.slice(0, 7)) return hoofdletter(fmtDag(a, { month: "long", year: "numeric" }));
  const ma = hoofdletter(fmtDag(a, { month: "short" })).replace(".", "");
  const mb = fmtDag(b, { month: "short" }).replace(".", "");
  return a.slice(0, 4) === b.slice(0, 4) ? `${ma} – ${mb} ${b.slice(0, 4)}` : `${ma} ${a.slice(0, 4)} – ${mb} ${b.slice(0, 4)}`;
}

// =========================================================
// RENDER
// =========================================================
export function render(c) {
  const dagen = zichtbareDagen();
  zorgVoorEvents(dagen[0], plusDagen(dagen.at(-1), 1));
  const toonVandaag = !dagen.includes(vandaag()) || (weergave === "maand" && anker.slice(0, 7) !== vandaag().slice(0, 7));

  const raster = el("div", { class: "kal-raster " + weergave });
  if (weergave === "week") renderWeek(raster, dagen); else renderMaand(raster, dagen);

  c.append(el("div", { class: "kal" },
    el("header", { class: "kal-kop" },
      el("div", { class: "kal-nav" },
        el("button", { class: "icoon-knop", title: "Vorige (←)", "aria-label": "Vorige", onclick: () => stap(-1) }, icoon("links", 18, 2)),
        el("button", { class: "icoon-knop", title: "Volgende (→)", "aria-label": "Volgende", onclick: () => stap(1) }, icoon("rechts", 18, 2)),
      ),
      el("h1", { class: "kal-titel" }, titelVan(dagen)),
      weergave === "week" ? el("span", { class: "kal-weeknr" }, `week ${weekNummer(dagen[0])}`) : null,
      el("button", { class: "knop klein" + (toonVandaag ? "" : " stil"), title: "Naar vandaag (T)", onclick: () => zetAnker(vandaag()) }, "Vandaag"),
      el("div", { class: "kal-rechts" },
        el("div", { class: "segment", role: "tablist" },
          ["week", "maand"].map((w) => el("button", {
            class: weergave === w ? "actief" : "", role: "tab", "aria-selected": String(weergave === w),
            title: w === "week" ? "Week (W)" : "Maand (M)", onclick: () => zetWeergave(w),
          }, hoofdletter(w)))),
        el("button", { class: "knop primair klein", title: "Nieuw event (N)", onclick: () => nieuwEvent() }, icoon("plus", 14, 2.4), "Event"),
      ),
    ),
    raster,
  ));
}

export function naRender(c) {
  if (weergave === "maand") pasMaandCellenAan(c);
}

export function toets(e) {
  const k = e.key.toLowerCase();
  if (e.key === "Escape" && sleep) annuleerSleep();
  else if (e.key === "ArrowLeft") stap(-1);
  else if (e.key === "ArrowRight") stap(1);
  else if (k === "t") zetAnker(vandaag());
  else if (k === "w") zetWeergave("week");
  else if (k === "m") zetWeergave("maand");
  else if (k === "n") nieuwEvent();
  else return;
  e.preventDefault();
}

export const bezig = () => !!sleep;

/** Elke halve minuut: enkel de nu-lijn verschuiven. */
export function tik(c) {
  const lijn = c.querySelector(".nu-lijn");
  if (!lijn) return;
  const [ds, de] = urenBereik();
  lijn.style.top = ((nuMinuten() - ds * 60) / ((de - ds) * 60)) * 100 + "%";
}

// =========================================================
// WEEK
// =========================================================
function renderWeek(raster, dagen) {
  const [ds, de] = urenBereik();
  const N = de - ds;
  const t = vandaag();
  raster.style.setProperty("--uren", N);

  // Koppen
  raster.append(el("div", { class: "wk-hoek" }),
    ...dagen.map((d, i) => el("button", {
      class: "wk-kop" + (d === t ? " vandaag" : "") + (i > 4 ? " weekend" : ""),
      title: "Nieuw event op deze dag", ondblclick: () => nieuwEvent(d),
    },
      el("span", { class: "wk-wd" }, fmtDag(d, { weekday: "short" }).replace(".", "")),
      el("span", { class: "wk-nr" }, Number(d.slice(8))),
    )));

  // Hele-dagrij: events van een hele dag + deadlines + streefmomenten
  const items = dagItems(dagen);
  const rijen = items.reduce((m, x) => Math.max(m, x.rij + 1), 0);
  const zichtbaar = dagrijOpen ? rijen : Math.min(rijen, MAX_DAGRIJEN);
  const verborgen = items.filter((x) => x.rij >= zichtbaar).length;
  raster.append(
    el("div", { class: "wk-dagrij-goot" },
      verborgen || dagrijOpen && rijen > MAX_DAGRIJEN
        ? el("button", { class: "dagrij-meer", title: dagrijOpen ? "Inklappen" : "Alles tonen", onclick: () => { dagrijOpen = !dagrijOpen; meld(); } },
          dagrijOpen ? "minder" : `+${verborgen}`)
        : el("span", { class: "flauw" }, "dag")),
    el("div", { class: "wk-dagrij", style: { "--rijen": Math.max(1, zichtbaar) } },
      items.filter((x) => x.rij < zichtbaar).map((x) => dagItemEl(x))),
  );

  // Uren
  const uren = el("div", { class: "wk-uren" },
    el("div", { class: "wk-goot" },
      Array.from({ length: N - 1 }, (_, i) => el("span", { style: { top: ((i + 1) / N) * 100 + "%" } }, `${ds + i + 1}:00`)),
      dagen.includes(t) && nuInZicht(ds, de) ? el("span", { class: "nu-label", style: { top: nuPct(ds, de) } }, fmtTijd(nuMinuten())) : null,
    ),
    ...dagen.map((d, i) => {
      const kolom = el("div", { class: "wk-kolom" + (i > 4 ? " weekend" : "") + (d === t ? " vandaag" : ""), dataset: { dag: d } });
      const segs = [];
      for (const e of eventsTussen(d, plusDagen(d, 1))) {
        if (e.hele_dag) continue;
        const g = segment(e, d, ds, de);
        if (g) segs.push(g);
      }
      legUit(segs.filter((g) => !g.buiten));
      for (const g of segs) kolom.append(blokEl(g));
      if (d === t && nuInZicht(ds, de)) kolom.append(el("div", { class: "nu-lijn", style: { top: nuPct(ds, de) } }));
      return kolom;
    }),
  );
  raster.append(uren);
  koppelSlepen(uren, dagen, ds, de);
  if (concept && !concept.hele_dag) tekenSpook(uren, dagen, [naarWand(concept.start), naarWand(concept.eind)]);
}

const nuInZicht = (ds, de) => nuMinuten() >= ds * 60 && nuMinuten() <= de * 60;
const nuPct = (ds, de) => ((nuMinuten() - ds * 60) / ((de - ds) * 60)) * 100 + "%";

/** Het stuk van een event dat op dag d zichtbaar is (fracties van de kolomhoogte). */
function segment(e, d, ds, de, [a, b] = bereik(e)) {
  const d0 = naarWand(d);
  const zA = d0 + ds * 60, zB = d0 + de * 60, totaal = (de - ds) * 60;
  if (b <= d0 || a >= d0 + 1440) return null;
  const s = Math.max(a, zA), t = Math.min(b, zB);
  if (t > s) return { e, a, b, s, t, top: (s - zA) / totaal, hoogte: (t - s) / totaal, knipBoven: a < zA, knipOnder: b > zB };
  // Helemaal buiten de getoonde uren: toon een klein randje, maar enkel op de dag waarop het begint.
  if (a >= d0) return { e, a, b, s: a, t: b, buiten: a < zA ? "boven" : "onder" };
  return null;
}

/** Overlappende events naast elkaar zetten. */
function legUit(segs) {
  segs.sort((x, y) => x.s - y.s || (y.t - y.s) - (x.t - x.s));
  let groep = [], eind = -Infinity;
  const sluit = () => {
    const kolommen = [];
    for (const g of groep) {
      let k = kolommen.findIndex((t) => t <= g.s);
      if (k < 0) k = kolommen.length;
      kolommen[k] = g.t;
      g.kol = k;
    }
    for (const g of groep) g.aantal = kolommen.length;
  };
  for (const g of segs) {
    if (g.s >= eind && groep.length) { sluit(); groep = []; eind = -Infinity; }
    groep.push(g);
    eind = Math.max(eind, g.t);
  }
  if (groep.length) sluit();
}

function blokEl(g) {
  const { e } = g;
  const tijd = `${fmtTijd(minVanDag(e.start))} – ${fmtTijd(minVanDag(e.eind))}`;
  const duur = g.b - g.a;
  const titel = e.titel || (taak(e.taak_id)?.titel) || "(geen titel)";
  if (g.buiten) {
    return el("div", {
      class: `ev buiten ${g.buiten}`, dataset: { id: e.id }, style: { "--k": eventKleur(e) }, title: `${titel}\n${tijd} (buiten je getoonde uren)`,
    }, el("span", { class: "ev-titel" }, `${fmtTijd(minVanDag(e.start))} ${titel}`));
  }
  const kort = g.t - g.s < 45;
  const aantal = g.aantal || 1;
  return el("div", {
    class: "ev" + (kort ? " kort" : "") + (e.soort === "focus" ? " focus" : "") + (sleep?.ev?.id === e.id ? " weg" : "")
      + (g.knipBoven ? " knip-boven" : "") + (g.knipOnder ? " knip-onder" : ""),
    dataset: { id: e.id },
    style: {
      "--k": eventKleur(e), top: g.top * 100 + "%", height: g.hoogte * 100 + "%",
      left: `calc(${(g.kol || 0) / aantal * 100}% + 1px)`, width: `calc(${100 / aantal}% - 3px)`,
    },
    title: `${titel}\n${tijd} · ${fmtDuur(duur)}${vak(e.vak_id) ? "\n" + vak(e.vak_id).naam : ""}`,
  },
    el("div", { class: "ev-titel" }, e.soort === "focus" ? icoon("focus", 11, 2.4) : null, titel,
      kort ? el("span", { class: "ev-tijd" }, fmtTijd(minVanDag(e.start))) : null),
    kort ? null : el("div", { class: "ev-tijd" }, tijd),
    el("div", { class: "ev-greep", title: "Sleep om te verlengen" }),
  );
}

// ---------- Hele-dagrij ----------
function dagItems(dagen) {
  const van = dagen[0], aantal = dagen.length;
  const items = [];
  for (const e of eventsTussen(van, plusDagen(van, aantal))) {
    if (!e.hele_dag) continue;
    items.push({ a: Math.max(0, dagVerschil(van, e.start)), b: Math.min(aantal - 1, dagVerschil(van, e.eind)), e, soort: "event" });
  }
  for (const t of S.taken) {
    if (t.klaar) continue;
    for (const [veldNaam, soort] of [["deadline", "deadline"], ["streefdatum", "streef"]]) {
      const i = t[veldNaam] ? dagVerschil(van, t[veldNaam]) : -1;
      if (i >= 0 && i < aantal) items.push({ a: i, b: i, t, soort });
    }
  }
  const volgorde = { event: 0, deadline: 1, streef: 2 };
  items.sort((x, y) => x.a - y.a || volgorde[x.soort] - volgorde[y.soort] || (y.b - y.a) - (x.b - x.a));
  const rijEind = [];
  for (const x of items) {
    let r = rijEind.findIndex((b) => b < x.a);
    if (r < 0) r = rijEind.length;
    rijEind[r] = x.b;
    x.rij = r;
  }
  return items;
}

function dagItemEl(x) {
  const plek = { "grid-column": `${x.a + 1} / ${x.b + 2}`, "grid-row": String(x.rij + 1) };
  if (x.soort === "event") {
    return el("button", {
      class: "dag-item event", style: { ...plek, "--k": eventKleur(x.e) }, title: x.e.titel, onclick: () => eventModal(x.e),
    }, x.e.titel || "(geen titel)");
  }
  const v = vakVanTaak(x.t);
  return el("button", {
    class: `dag-item ${x.soort}`, style: { ...plek, "--k": v?.kleur || "var(--accent)" },
    title: `${x.soort === "deadline" ? "Deadline" : "Streefmoment"}: ${x.t.titel}\n${v?.naam || ""} · ${onderdeelPad(x.t.onderdeel_id)}`,
    onclick: () => taakModal(x.t),
  }, icoon(x.soort === "deadline" ? "vlag" : "klok", 11, 2.3), x.t.titel);
}

// =========================================================
// SLEPEN
// =========================================================
function koppelSlepen(uren, dagen, ds, de) {
  const N = de - ds;
  const punt = (e) => {
    const kol = uren.querySelectorAll(".wk-kolom");
    const r0 = kol[0].getBoundingClientRect(), rN = kol[kol.length - 1].getBoundingClientRect();
    const i = Math.min(dagen.length - 1, Math.max(0, Math.floor((e.clientX - r0.left) / ((rN.right - r0.left) / dagen.length))));
    const f = Math.min(1, Math.max(0, (e.clientY - r0.top) / r0.height));
    return naarWand(dagen[i]) + ds * 60 + f * N * 60;
  };
  const snap = (m, f = Math.round) => f(m / SNAP) * SNAP;

  uren.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || concept) return;
    const evEl = e.target.closest(".ev");
    const p = punt(e);
    if (evEl) {
      const ev = S.events.get(Number(evEl.dataset.id));
      if (!ev) return;
      const [a, b] = bereik(ev);
      const soort = evEl.classList.contains("buiten") ? "klik" : e.target.closest(".ev-greep") ? "rek" : "schuif";
      sleep = { soort, ev, a, b, offset: p - a, x: e.clientX, y: e.clientY, bewogen: false, nieuw: [a, b] };
    } else {
      const s = snap(p, Math.floor);
      sleep = { soort: "maak", anker: s, x: e.clientX, y: e.clientY, bewogen: false, nieuw: [s, s + SNAP] };
    }
    uren.setPointerCapture(e.pointerId);
  });

  uren.addEventListener("pointermove", (e) => {
    if (!sleep || sleep.soort === "klik") return;
    if (!sleep.bewogen && Math.hypot(e.clientX - sleep.x, e.clientY - sleep.y) < 5) return;
    if (!sleep.bewogen) {
      sleep.bewogen = true;
      uren.classList.add("sleept");
      if (sleep.ev) uren.querySelectorAll(`.ev[data-id="${sleep.ev.id}"]`).forEach((b) => b.classList.add("weg"));
    }
    const p = punt(e);
    if (sleep.soort === "maak") {
      const q = snap(p);
      sleep.nieuw = q >= sleep.anker ? [sleep.anker, Math.max(q, sleep.anker + SNAP)] : [q, sleep.anker + SNAP];
    } else if (sleep.soort === "schuif") {
      const s = snap(p - sleep.offset);
      sleep.nieuw = [s, s + (sleep.b - sleep.a)];
    } else {
      sleep.nieuw = [sleep.a, Math.max(sleep.a + SNAP, snap(p))];
    }
    tekenSpook(uren, dagen, sleep.nieuw, sleep.ev);
  });

  const stop = async (e, geannuleerd = false) => {
    if (!sleep) return;
    const s = sleep;
    sleep = null;
    uren.classList.remove("sleept");
    if (geannuleerd) return meld();
    if (!s.bewogen) {
      if (s.ev) eventModal(s.ev);
      return;
    }
    const [a, b] = s.nieuw;
    if (s.soort === "maak") {
      concept = { start: vanWand(a), eind: vanWand(b), hele_dag: 0, titel: "", soort: "gepland" };
      meld();
      eventModal(concept);
      return;
    }
    if (a === s.a && b === s.b) return meld();
    const oud = { start: s.ev.start, eind: s.ev.eind };
    Object.assign(s.ev, { start: vanWand(a), eind: vanWand(b) });
    meld();
    try {
      await bewaar("events", { id: s.ev.id, start: s.ev.start, eind: s.ev.eind });
    } catch {
      Object.assign(s.ev, oud);
      meld();
    }
  };
  uren.addEventListener("pointerup", (e) => stop(e));
  uren.addEventListener("pointercancel", (e) => stop(e, true));
  annuleerSleep = () => stop(null, true);
  uren.addEventListener("dblclick", (e) => {
    if (e.target.closest(".ev")) return;
    const s = snap(punt(e), Math.floor);
    concept = { start: vanWand(s), eind: vanWand(s + 60), hele_dag: 0, titel: "", soort: "gepland" };
    meld();
    eventModal(concept);
  });
}

/** Tekent het voorbeeldblok tijdens het slepen of terwijl de modal open staat. */
function tekenSpook(uren, dagen, [a, b], ev = null) {
  uren.querySelectorAll(".ev.spook").forEach((x) => x.remove());
  const [ds, de] = urenBereik();
  const nep = { ...(ev || {}), id: 0, start: vanWand(a), eind: vanWand(b), hele_dag: 0, titel: ev?.titel || concept?.titel || "Nieuw event" };
  uren.querySelectorAll(".wk-kolom").forEach((kolom, i) => {
    const g = segment(nep, dagen[i], ds, de, [a, b]);
    if (!g || g.buiten) return;
    const blok = blokEl(g);
    blok.classList.add("spook");
    blok.style.left = "1px";
    blok.style.width = "calc(100% - 3px)";
    kolom.append(blok);
  });
}

// =========================================================
// MAAND
// =========================================================
function renderMaand(raster, dagen) {
  const t = vandaag(), maand = anker.slice(0, 7);
  raster.append(...dagen.slice(0, 7).map((d, i) =>
    el("div", { class: "md-wd" + (i > 4 ? " weekend" : "") }, fmtDag(d, { weekday: "short" }).replace(".", ""))));

  const items = dagItems(dagen);
  const perDag = dagen.map(() => []);
  for (const x of items) for (let i = x.a; i <= x.b; i++) perDag[i].push(x);
  const getimed = eventsTussen(dagen[0], plusDagen(dagen.at(-1), 1)).filter((e) => !e.hele_dag);

  dagen.forEach((d, i) => {
    const lijst = [...perDag[i].map((x) => {
      const node = dagItemEl(x);
      node.style.removeProperty("grid-column");
      node.style.removeProperty("grid-row");
      return node;
    }),
    ...getimed.filter((e) => e.start.slice(0, 10) === d).map((e) =>
      el("button", { class: "md-ev", style: { "--k": eventKleur(e) }, title: e.titel, onclick: (ev) => { ev.stopPropagation(); eventModal(e); } },
        el("span", { class: "stip" }), el("span", { class: "md-tijd" }, fmtTijd(minVanDag(e.start))), e.titel || taak(e.taak_id)?.titel || "(geen titel)"))];
    raster.append(el("div", {
      class: "md-cel" + (d.slice(0, 7) !== maand ? " anders" : "") + (d === t ? " vandaag" : "") + (i % 7 > 4 ? " weekend" : ""),
      onclick: (e) => { if (!e.target.closest("button")) { weergave = "week"; localStorage.setItem("milio-kal-weergave", "week"); zetAnker(d); } },
      ondblclick: (e) => { if (!e.target.closest("button")) nieuwEvent(d); },
      title: "Klik: open deze week · Dubbelklik: nieuw event",
    },
      el("span", { class: "md-nr" }, Number(d.slice(8)) === 1 ? fmtDag(d, { day: "numeric", month: "short" }).replace(".", "") : Number(d.slice(8))),
      el("div", { class: "md-items" }, lijst),
    ));
  });
}

/** Wat niet in een cel past verbergen we achter "+N". Kan pas na het tekenen gemeten worden. */
function pasMaandCellenAan(c) {
  c.querySelectorAll(".md-items").forEach((lijst) => {
    const kinderen = [...lijst.children];
    if (!kinderen.length) return;
    const ruimte = lijst.clientHeight;
    const hoogte = kinderen[0].offsetHeight + 2;
    const past = Math.floor(ruimte / hoogte);
    if (kinderen.length <= past) return;
    kinderen.slice(Math.max(0, past - 1)).forEach((k) => (k.style.display = "none"));
    lijst.append(el("span", { class: "md-meer" }, `+${kinderen.length - Math.max(0, past - 1)} meer`));
  });
}

// =========================================================
// EVENT-MODAL
// =========================================================
function nieuwEvent(dag = null) {
  let m = Math.ceil((nuMinuten() + 1) / 30) * 30;
  const d = dag || (weergave === "week" && !zichtbareDagen().includes(vandaag()) ? zichtbareDagen()[0] : vandaag());
  if (dag || d !== vandaag()) m = 9 * 60;
  concept = { start: moment(d, m), eind: moment(d, m + 60), hele_dag: 0, titel: "", soort: "gepland" };
  meld();
  eventModal(concept);
}

/** Een taak inplannen: event van een uur, vanaf het volgende halfuur. */
export function planTaak(t) {
  const m = Math.ceil((nuMinuten() + 1) / 30) * 30;
  eventModal({
    titel: t.titel, start: moment(vandaag(), m), eind: moment(vandaag(), m + 60), hele_dag: 0,
    vak_id: vakVanTaak(t)?.id ?? null, taak_id: t.id, soort: "gepland",
  }, (ev) => toast("Ingepland", { actie: { label: "Bekijk in kalender", fn: () => { anker = ev.start.slice(0, 10); weergave = "week"; location.hash = "#/kalender"; meld(); } } }));
}

export function eventModal(e, naOpslaan = null) {
  const nieuw = !e.id;
  const titel = el("input", { type: "text", maxlength: 160, placeholder: "Waar ga je aan werken?", value: e.titel || "", autofocus: true });
  const heleDag = el("input", { type: "checkbox", checked: !!e.hele_dag });
  const startDag = el("input", { type: "date", required: true, value: e.start.slice(0, 10) });
  const startTijd = el("input", { type: "time", step: 300, value: e.hele_dag ? "09:00" : e.start.slice(11, 16) });
  const eindDag = el("input", { type: "date", required: true, value: e.eind.slice(0, 10) });
  const eindTijd = el("input", { type: "time", step: 300, value: e.hele_dag ? "10:00" : e.eind.slice(11, 16) });
  const duur = el("span", { class: "ev-modal-duur" });
  const vakSel = el("select", {}, el("option", { value: "" }, "Geen vak"),
    S.vakken.map((v) => el("option", { value: v.id, selected: v.id === e.vak_id }, v.naam)));
  const vakStip = el("span", { class: "stip" });
  let kleur = e.kleur || "#6B7A8F";
  const kleurVeld = el("div", { class: "veld" }, el("span", {}, "Kleur"), kleurKiezer(kleur, (k) => { kleur = k; }));
  const taakSel = el("select");
  const notitie = el("textarea", { maxlength: 4000, placeholder: "Notitie (optioneel)", value: e.notitie || "" });

  const momentVan = (dag, tijd) => naarWand(`${dag.value}T${tijd.value || "00:00"}`);
  let vorigeStart = momentVan(startDag, startTijd);

  function bijwerken() {
    const hd = heleDag.checked;
    startTijd.hidden = eindTijd.hidden = hd;
    const v = vak(Number(vakSel.value));
    vakStip.style.setProperty("--k", v?.kleur || kleur);
    kleurVeld.hidden = !!v;
    if (hd) {
      const n = dagVerschil(startDag.value, eindDag.value) + 1;
      duur.textContent = n > 0 ? (n === 1 ? "hele dag" : `${n} dagen`) : "";
    } else {
      const min = momentVan(eindDag, eindTijd) - momentVan(startDag, startTijd);
      duur.textContent = min > 0 ? fmtDuur(min) : "";
    }
    // Taken van het gekozen vak (open taken + de gekoppelde)
    const huidig = Number(taakSel.value) || e.taak_id || null;
    const opties = S.taken.filter((t) => (!t.klaar || t.id === huidig) && v && vakVanTaak(t)?.id === v.id);
    const gekoppeld = taak(huidig);
    if (gekoppeld && !opties.includes(gekoppeld)) opties.unshift(gekoppeld);
    taakSel.replaceChildren(
      el("option", { value: "" }, v || gekoppeld ? "Geen taak" : "Kies eerst een vak"),
      ...opties.map((t) => el("option", { value: t.id, selected: t.id === huidig }, `${onderdeelPad(t.onderdeel_id)} › ${t.titel}`)),
    );
    taakSel.disabled = !opties.length;
  }

  // Begin verschuiven = einde schuift mee (de duur blijft).
  const startVerandert = () => {
    const nu = momentVan(startDag, startTijd);
    if (!Number.isNaN(nu) && !Number.isNaN(vorigeStart)) {
      const eind = vanWand(momentVan(eindDag, eindTijd) + (nu - vorigeStart));
      eindDag.value = eind.slice(0, 10);
      eindTijd.value = eind.slice(11, 16);
    }
    vorigeStart = nu;
    bijwerken();
  };
  startDag.addEventListener("change", startVerandert);
  startTijd.addEventListener("change", startVerandert);
  [eindDag, eindTijd, heleDag, vakSel].forEach((x) => x.addEventListener("change", bijwerken));
  taakSel.addEventListener("change", () => {
    const t = taak(Number(taakSel.value));
    if (t && !titel.value.trim()) titel.value = t.titel;
  });
  bijwerken();

  formModal({
    titel: el("span", { class: "ev-modal-kop" }, vakStip, nieuw ? "Nieuw event" : e.soort === "focus" ? "Focussessie" : "Event"),
    breed: true,
    velden: [
      veld("Titel", titel),
      el("div", { class: "ev-modal-tijd" },
        el("div", { class: "veld" }, el("span", {}, "Begin"), el("div", { class: "tijd-rij" }, startDag, startTijd)),
        el("span", { class: "ev-modal-pijl" }, icoon("later", 16)),
        el("div", { class: "veld" }, el("span", {}, "Einde"), el("div", { class: "tijd-rij" }, eindDag, eindTijd)),
      ),
      el("div", { class: "ev-modal-opties" }, el("label", { class: "vinkje" }, heleDag, "Hele dag"), duur),
      el("div", { class: "veld-rij" }, veld("Vak", vakSel), veld("Gekoppelde taak", taakSel)),
      kleurVeld,
      veld("Notitie", notitie),
    ],
    links: nieuw ? null : (sluit) => el("button", {
      type: "button", class: "knop stil gevaar links",
      onclick: async () => {
        sluit();
        if (!(await bevestig("Event verwijderen?", `"${e.titel || "Dit event"}" wordt uit je kalender gehaald.`))) return;
        const kopie = { ...e };
        await verwijder("events", e.id);
        toast("Event verwijderd", { actie: { label: "Ongedaan maken", fn: () => { const { id, ...rest } = kopie; void id; bewaar("events", rest); } } });
      },
    }, icoon("prullenbak", 15), "Verwijderen"),
    opslaan: async () => {
      const hd = heleDag.checked;
      const start = hd ? startDag.value : `${startDag.value}T${startTijd.value}`;
      const eind = hd ? eindDag.value : `${eindDag.value}T${eindTijd.value}`;
      if (eind < start || (!hd && eind === start)) {
        toast("Het einde moet na het begin liggen.", { fout: true });
        return false;
      }
      const vakId = Number(vakSel.value) || null;
      const rij = await bewaar("events", {
        id: e.id, titel: titel.value, start, eind, hele_dag: hd, vak_id: vakId, kleur: vakId ? null : kleur,
        taak_id: Number(taakSel.value) || null, notitie: notitie.value, soort: e.soort || "gepland",
      });
      if (naOpslaan) naOpslaan(rij); else toast(nieuw ? "Event toegevoegd" : "Event bijgewerkt");
    },
    opSluit: () => { if (concept) { concept = null; meld(); } },
  });
}
