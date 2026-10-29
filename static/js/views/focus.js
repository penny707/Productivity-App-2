/* =========================================================
   Milio — views/focus.js
   Focus-timer. Kies een taak, werk, en bij het stoppen komt de sessie
   als blok in je kalender (start en einde afgerond op 5 minuten).
   De timer overleeft herladen: de staat zit in localStorage.
   ========================================================= */
import { el, svg, icoon, toast, vandaag, nuMoment, naarWand, vanWand, fmtTijd, fmtDuur, minVanDag } from "../util.js";
import { S, meld, taak, vak, vakVanTaak, onderdeelPad, bewaar, zetKlaar } from "../store.js";
import { modal, veld } from "../modals.js";
import { bergruggen } from "../bergen.js";

const SLEUTEL = "milio-focus";
const DUREN = [15, 25, 45, 60, 90];

// ---------- Staat ----------
export function focusStaat() {
  try { return JSON.parse(localStorage.getItem(SLEUTEL) || "null"); } catch { return null; }
}
function zetStaat(st) {
  if (st) localStorage.setItem(SLEUTEL, JSON.stringify(st)); else localStorage.removeItem(SLEUTEL);
}
/** Gewerkte milliseconden, pauzes niet meegeteld. */
export function gewerkt(st, nu = Date.now()) {
  return (st.gepauzeerdOp || nu) - st.start - st.pauzeMs;
}
/** Tekst voor de zijbalk en de tabtitel: resterend (countdown) of verstreken (vrij). */
export function klokTekst(st) {
  const ms = st.duurMin ? st.duurMin * 60000 - gewerkt(st) : gewerkt(st);
  const over = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const u = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const tekst = (u ? `${u}:${String(m).padStart(2, "0")}` : String(m).padStart(2, "0")) + ":" + String(sec).padStart(2, "0");
  return over ? "+" + tekst : tekst;
}

function start(keuze) {
  zetStaat({ ...keuze, start: Date.now(), pauzeMs: 0, gepauzeerdOp: null });
  localStorage.setItem("milio-focus-duur", keuze.duurMin ?? "vrij");
  meld();
}
function pauzeer() {
  const st = focusStaat();
  if (st.gepauzeerdOp) { st.pauzeMs += Date.now() - st.gepauzeerdOp; st.gepauzeerdOp = null; }
  else st.gepauzeerdOp = Date.now();
  zetStaat(st);
  meld();
}
function verleng(min) {
  const st = focusStaat();
  st.duurMin = (st.duurMin || 0) + min;
  zetStaat(st);
  meld();
}

/** Ronden op 5 minuten (wandklok-minuten). */
const op5 = (wand) => Math.round(wand / 5) * 5;
function lokaalMoment(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function afronden() {
  const st = focusStaat();
  if (!st) return;
  const t = taak(st.taakId);
  const a = op5(naarWand(lokaalMoment(st.start)));
  let b = op5(naarWand(st.gepauzeerdOp ? lokaalMoment(st.gepauzeerdOp) : nuMoment()));
  if (b <= a) b = a + 5;
  const werk = Math.round(gewerkt(st) / 60000);
  const klaarVink = el("input", { type: "checkbox" });

  modal((sluit) => el("div", {},
    el("h2", {}, "Sessie afronden"),
    el("p", { class: "uitleg" },
      "Je werkte ", el("strong", {}, fmtDuur(Math.max(1, werk))), " aan ", el("strong", {}, st.titel || "je sessie"), ". ",
      `In je kalender: ${fmtTijd(minVanDag(vanWand(a)))} – ${fmtTijd(minVanDag(vanWand(b)))}.`),
    t && !t.klaar ? el("label", { class: "vinkje", style: { "margin-bottom": "6px" } }, klaarVink, "De taak is af") : null,
    el("div", { class: "modal-acties" },
      el("button", {
        class: "knop stil gevaar links",
        onclick: () => { zetStaat(null); sluit(); meld(); toast("Sessie niet bewaard"); },
      }, "Weggooien"),
      el("button", { class: "knop stil", onclick: sluit }, "Verder werken"),
      el("button", {
        class: "knop primair", autofocus: true,
        onclick: async () => {
          sluit();
          const ev = await bewaar("events", {
            titel: st.titel || t?.titel || "Focus", start: vanWand(a), eind: vanWand(b),
            vak_id: st.vakId || null, taak_id: st.taakId || null, soort: "focus",
          });
          zetStaat(null);
          if (klaarVink.checked && t) await zetKlaar(t, true);
          meld();
          toast(`Bewaard in je kalender · ${fmtDuur(naarWand(ev.eind) - naarWand(ev.start))}`, {
            actie: { label: "Bekijk", fn: () => (location.hash = "#/kalender") },
          });
        },
      }, "Opslaan in kalender"),
    ),
  ));
}

// =========================================================
// RENDER
// =========================================================
export function render(c, arg) {
  const st = focusStaat();
  c.append(scene(!!st), st ? lopend(st) : opzet(Number(arg) || null));
}

/** Rustige achtergrond: lucht, wolken, een vogel en bergen. */
function scene(lopend) {
  const u = new Date().getHours();
  const donker = document.documentElement.dataset.thema === "dark";
  const nacht = u < 6 || u >= 21;
  const lucht = donker
    ? (nacht ? ["#0b0e1c", "#161b33"] : ["#141d3a", "#2c2a4a"])
    : (nacht ? ["#ccd3ee", "#e6e3f2"] : ["#d9e5ff", "#f6efe9"]);
  const stil = S.inst.animaties === "0";
  return el("div", { class: "focus-scene" + (stil ? " stil" : "") + (lopend ? " lopend" : ""), style: { "--lucht-1": lucht[0], "--lucht-2": lucht[1] } },
    el("div", { class: "wolk w1" }), el("div", { class: "wolk w2" }), el("div", { class: "wolk w3" }),
    svg(`<svg class="vogel" viewBox="0 0 28 10" aria-hidden="true"><path d="M1 7 Q7 1 14 7 Q21 1 27 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`),
    svg(`<svg class="focus-bergen" viewBox="0 0 1400 360" preserveAspectRatio="none" aria-hidden="true">${bergruggen(29, 1400, 360, { top: 0.15, lagen: [20, 11, 0] })}</svg>`),
  );
}

// ---------- Opzet ----------
function opzet(voorkeurTaak) {
  // Standaard: de eerste open taak van het Kompas, anders niets.
  let kompasTaak = null;
  try {
    const k = JSON.parse(S.inst.kompas || "null");
    kompasTaak = k?.dag === vandaag() ? k.ids.map(taak).find((t) => t && !t.klaar) : null;
  } catch { /* geen keuze */ }
  const gekozen = taak(voorkeurTaak) || kompasTaak;

  const taakSel = el("select", { class: "focus-taak" },
    el("option", { value: "" }, "Iets anders (vrije titel)"),
    S.vakken.map((v) => {
      const open = S.taken.filter((t) => !t.klaar && vakVanTaak(t)?.id === v.id);
      return open.length ? el("optgroup", { label: v.naam }, open.map((t) =>
        el("option", { value: t.id, selected: t.id === gekozen?.id }, `${t.titel}  ·  ${onderdeelPad(t.onderdeel_id)}`))) : null;
    }));
  const vrijTitel = el("input", { type: "text", maxlength: 160, placeholder: "bv. Mails wegwerken" });
  const vrijVak = el("select", {}, el("option", { value: "" }, "Geen vak"), S.vakken.map((v) => el("option", { value: v.id }, v.naam)));
  const vrij = el("div", { class: "veld-rij focus-vrij" }, veld("Titel", vrijTitel), veld("Vak", vrijVak));
  const bijwerken = () => { vrij.hidden = !!taakSel.value; };
  taakSel.addEventListener("change", bijwerken);
  bijwerken();

  const laatste = localStorage.getItem("milio-focus-duur") || "25";
  let duur = laatste === "vrij" ? null : Number(laatste);
  const duurKnoppen = el("div", { class: "segment focus-duren" });
  const tekenDuren = () => duurKnoppen.replaceChildren(...[...DUREN, null].map((d) =>
    el("button", { type: "button", class: d === duur ? "actief" : "", onclick: () => { duur = d; tekenDuren(); } }, d ? `${d} min` : "Vrij")));
  tekenDuren();

  const go = () => {
    const t = taak(Number(taakSel.value));
    if (!t && !vrijTitel.value.trim()) { vrijTitel.focus(); toast("Geef je sessie een titel, of kies een taak.", { fout: true }); return; }
    start({
      taakId: t?.id ?? null,
      vakId: t ? vakVanTaak(t)?.id ?? null : Number(vrijVak.value) || null,
      titel: t ? t.titel : vrijTitel.value.trim(),
      duurMin: duur,
    });
  };

  return el("div", { class: "focus-midden" },
    el("form", { class: "focus-kaart", onsubmit: (e) => { e.preventDefault(); go(); } },
      el("div", { class: "focus-kaart-kop" }, icoon("focus", 22, 1.8), el("h1", {}, "Focus")),
      el("p", { class: "sub" }, "Eén ding tegelijk. Als je stopt, komt de sessie in je kalender."),
      veld("Waar werk je aan?", taakSel),
      vrij,
      el("div", { class: "veld" }, el("span", {}, "Hoe lang?"), duurKnoppen),
      el("button", { type: "submit", class: "knop primair focus-start" }, icoon("spelen", 16), "Start"),
    ),
  );
}

// ---------- Lopend ----------
function lopend(st) {
  const t = taak(st.taakId);
  const v = vak(st.vakId);
  const R = 128, omtrek = 2 * Math.PI * R;
  const ring = svg(`<svg class="focus-ring" viewBox="0 0 300 300" aria-hidden="true">
    <circle cx="150" cy="150" r="${R}" class="ring-baan"/>
    <circle cx="150" cy="150" r="${R}" class="ring-voortgang" stroke-dasharray="${omtrek}" stroke-dashoffset="${omtrek}" transform="rotate(-90 150 150)"/>
  </svg>`);
  const klok = el("div", { class: "focus-klok" });
  const status = el("div", { class: "focus-status" });
  const pauzeKnop = el("button", { class: "knop focus-knop", onclick: pauzeer });

  const blok = el("div", { class: "focus-midden" },
    el("div", { class: "focus-lopend", style: { "--k": v?.kleur || "var(--accent)" } },
      el("div", { class: "focus-wijzer" }, ring, el("div", { class: "focus-binnen" }, status, klok,
        el("div", { class: "focus-titel", title: st.titel }, st.titel),
        v ? el("div", { class: "focus-vak" }, el("span", { class: "stip" }), v.naam, t ? el("span", { class: "flauw" }, " · " + onderdeelPad(t.onderdeel_id)) : null) : null,
      )),
      el("div", { class: "focus-knoppen" },
        pauzeKnop,
        el("button", { class: "knop focus-knop", title: "5 minuten erbij", onclick: () => verleng(5) }, icoon("plus", 15, 2.2), "5 min"),
        el("button", { class: "knop primair focus-knop", onclick: afronden }, icoon("check", 16, 2.4), "Klaar"),
      ),
    ),
  );

  const teken = () => {
    const s = focusStaat();
    if (!s || !blok.isConnected) return false;
    const ms = gewerkt(s);
    const totaal = s.duurMin ? s.duurMin * 60000 : null;
    const f = totaal ? Math.min(1, ms / totaal) : (ms % 3600000) / 3600000; // vrij: één ronde per uur
    ring.querySelector(".ring-voortgang").setAttribute("stroke-dashoffset", String(omtrek * (1 - f)));
    klok.textContent = klokTekst(s);
    const voorbij = totaal && ms >= totaal;
    blok.querySelector(".focus-lopend").classList.toggle("voorbij", !!voorbij);
    blok.querySelector(".focus-lopend").classList.toggle("pauze", !!s.gepauzeerdOp);
    status.textContent = s.gepauzeerdOp ? "gepauzeerd" : voorbij ? "tijd voor een pauze" : totaal ? "nog" : "bezig";
    pauzeKnop.replaceChildren(icoon(s.gepauzeerdOp ? "spelen" : "pauze", 15, 2.2), s.gepauzeerdOp ? "Hervat" : "Pauze");
    return true;
  };
  teken();
  const timer = setInterval(() => { if (!teken()) clearInterval(timer); }, 1000);
  return blok;
}

export function toets(e) {
  const st = focusStaat();
  if (!st) return;
  if (e.key === " " && !e.target.closest("button, a")) { e.preventDefault(); pauzeer(); }
}
