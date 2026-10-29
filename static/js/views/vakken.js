/* =========================================================
   Milio — views/vakken.js
   Overzicht van alle vakken (met hun berg) en de detailpagina van één vak.
   ========================================================= */
import { el, svg, icoon, fmtDag, relatief, datumStatus, toast } from "../util.js";
import { S, vak, voortgang, boom, takenVanVak, bewaar, verwijder, zetKlaar, zetInst } from "../store.js";
import { vakModal, onderdeelModal, taakModal, verwijderTaak, bevestig, TYPES, typeKeuze } from "../modals.js";
import { vakBerg } from "../bergen.js";
import { planTaak } from "./kalender.js";

// Onderdelen die je dichtklapte (standaard staat alles open).
const dicht = new Set(JSON.parse(localStorage.getItem("milio-dicht") || "[]"));
let focusNa = null; // na een her-render dit invoerveld opnieuw focussen
const netAfgevinkt = new Map(); // taak-id -> tijdstip, voor de animatie en om even zichtbaar te blijven
const isNet = (t, ms = 900) => Date.now() - (netAfgevinkt.get(t.id) || 0) < ms;

/** Eerstvolgende open deadline van een vak. */
function volgendeDeadline(vakId) {
  return takenVanVak(vakId)
    .filter((t) => !t.klaar && t.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
}

// =========================================================
// OVERZICHT
// =========================================================
export function renderOverzicht(c) {
  c.append(
    el("header", { class: "view-kop" },
      el("div", {},
        el("h1", {}, "Vakken"),
        el("p", { class: "sub" }, S.vakken.length
          ? "Elke berg is een vak. Hoe meer je afvinkt, hoe hoger je klimt."
          : "Begin met een vak, of haal je vakken uit Elio via Instellingen."),
      ),
      el("button", { class: "knop primair", onclick: () => vakModal(null, (v) => (location.hash = `#/vak/${v.id}`)) },
        icoon("plus", 15, 2.2), "Nieuw vak"),
    ),
  );

  if (!S.vakken.length) {
    c.append(el("div", { class: "leeg" },
      icoon("berg", 34, 1.5),
      el("strong", {}, "Nog geen vakken"),
      el("span", {}, "Een vak kan ook een project of levensdomein zijn."),
      el("button", { class: "knop primair", onclick: () => vakModal() }, icoon("plus", 15, 2.2), "Eerste vak maken"),
    ));
    return;
  }

  c.append(el("div", { class: "vakken-raster" }, S.vakken.map((v, i) => {
    const p = voortgang(v.id);
    const dl = volgendeDeadline(v.id);
    return el("a", { class: "vak-kaart", href: `#/vak/${v.id}`, style: { "--k": v.kleur, "--i": i } },
      el("div", { class: "vak-kaart-scene" }, svg(vakBerg(v.id, v.kleur, p.pct))),
      el("div", { class: "vak-kaart-body" },
        el("div", { class: "vak-kaart-kop" },
          el("span", { class: "vak-kaart-naam" }, v.naam),
          el("span", { class: "vak-kaart-pct" }, `${p.pct}%`),
        ),
        el("div", { class: "balk" }, el("div", { style: { width: p.pct + "%" } })),
        el("div", { class: "vak-kaart-meta" },
          el("span", {}, p.totaal ? `${p.klaar} van ${p.totaal} taken` : "Nog geen taken"),
          dl ? el("span", { class: "vak-kaart-dl " + datumStatus(dl.deadline), title: dl.titel },
            icoon("vlag", 12), relatief(dl.deadline)) : null,
        ),
      ),
    );
  })));
}

// =========================================================
// VAK DETAIL
// =========================================================
export function renderVak(c, id) {
  const v = vak(id);
  if (!v) { location.hash = "#/vakken"; return; }
  const p = voortgang(id);
  const dl = volgendeDeadline(id);
  const verberg = S.inst.verberg_klaar === "1";

  c.style.setProperty("--k", v.kleur);
  c.append(
    el("header", { class: "view-kop vak-kop" },
      el("div", { class: "kop-links" },
        el("a", { class: "icoon-knop", href: "#/vakken", title: "Terug naar vakken" }, icoon("links", 18)),
        el("span", { class: "stip groot" }),
        el("div", {},
          el("h1", {}, v.naam),
          el("p", { class: "sub" }, p.totaal ? `${p.klaar} van ${p.totaal} taken afgerond` : "Nog geen taken in dit vak"),
        ),
      ),
      el("div", { class: "kop-rechts" },
        el("button", { class: "icoon-knop", title: "Vak bewerken", onclick: () => vakModal(v) }, icoon("potlood", 16)),
        el("button", {
          class: "icoon-knop gevaar", title: "Vak verwijderen",
          onclick: async () => {
            if (!(await bevestig("Vak verwijderen?", `"${v.naam}" en alle onderdelen en taken erin worden definitief verwijderd.`))) return;
            await verwijder("vakken", v.id);
            location.hash = "#/vakken";
            toast("Vak verwijderd");
          },
        }, icoon("prullenbak", 16)),
      ),
    ),

    el("section", { class: "vak-strook" },
      el("div", { class: "vak-strook-berg" }, svg(vakBerg(v.id, v.kleur, p.pct))),
      el("div", { class: "vak-strook-info" },
        el("div", { class: "vak-strook-pct" }, el("strong", {}, p.pct), "%"),
        el("div", { class: "balk" }, el("div", { style: { width: p.pct + "%" } })),
        el("div", { class: "vak-strook-types" }, Object.entries(TYPES).map(([k, label]) =>
          el("div", {}, el("strong", {}, `${p.perType[k][0]}/${p.perType[k][1]}`), el("span", { class: "type " + k }, label)))),
        dl ? el("p", { class: "klein vak-strook-dl" }, icoon("vlag", 13), "Volgende deadline: ",
          el("strong", {}, dl.titel), ` · ${fmtDag(dl.deadline)} (${relatief(dl.deadline)})`) : null,
      ),
    ),

    el("div", { class: "sectie-kop" },
      el("h2", {}, "Onderdelen"),
      el("label", { class: "vinkje klein" },
        el("input", { type: "checkbox", checked: verberg, onchange: (e) => zetInst({ verberg_klaar: e.target.checked ? "1" : "0" }) }),
        "Verberg afgewerkte taken"),
      el("button", { class: "knop klein", onclick: () => onderdeelModal({ vakId: id }) }, icoon("plus", 14, 2.2), "Onderdeel"),
    ),
  );

  const wortels = boom(id);
  if (!wortels.length) {
    c.append(el("div", { class: "leeg" },
      icoon("sub", 30, 1.5),
      el("strong", {}, "Nog geen onderdelen"),
      el("span", {}, "Een hoofdstuk, thema of labo-reeks. Daarin komen je taken."),
      el("button", { class: "knop primair", onclick: () => onderdeelModal({ vakId: id }) }, icoon("plus", 15, 2.2), "Onderdeel toevoegen"),
    ));
  } else {
    c.append(el("div", { class: "onderdelen" }, wortels.map((o) => onderdeelBlok(o, id, verberg))));
  }

  if (focusNa) {
    c.querySelector(`[data-focus="${focusNa}"]`)?.focus();
    focusNa = null;
  }
}

function telTaken(o) {
  let totaal = 0, klaar = 0;
  for (const t of S.taken) if (t.onderdeel_id === o.id) { totaal++; if (t.klaar) klaar++; }
  for (const k of o.kinderen) { const s = telTaken(k); totaal += s.totaal; klaar += s.klaar; }
  return { totaal, klaar };
}

function onderdeelBlok(o, vakId, verberg) {
  const open = !dicht.has(o.id);
  const tel = telTaken(o);
  // Net afgevinkte taken blijven nog even staan, zodat je ziet wat er gebeurde.
  const zichtbaar = (t) => !(verberg && t.klaar && !isNet(t, 5000));
  const taken = S.taken.filter((t) => t.onderdeel_id === o.id && zichtbaar(t));
  const verborgen = S.taken.filter((t) => t.onderdeel_id === o.id && !zichtbaar(t)).length;

  const blok = el("div", { class: "ond" + (open ? " open" : "") + (tel.totaal && tel.klaar === tel.totaal ? " af" : "") });
  const kop = el("div", {
    class: "ond-kop", role: "button", tabindex: 0, "aria-expanded": String(open),
    onclick: (e) => { if (!e.target.closest(".ond-acties")) wissel(); },
    onkeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === kop) { e.preventDefault(); wissel(); } },
  },
    el("span", { class: "ond-pijl" }, icoon("rechts", 14, 2.2)),
    el("span", { class: "ond-titel" }, o.titel),
    tel.totaal ? el("span", { class: "ond-teller" }, ring(tel.klaar / tel.totaal), `${tel.klaar}/${tel.totaal}`) : null,
    el("div", { class: "ond-acties" },
      el("button", { class: "icoon-knop klein", title: "Sub-onderdeel", onclick: () => onderdeelModal({ vakId, parentId: o.id }) }, icoon("sub", 14)),
      el("button", { class: "icoon-knop klein", title: "Naam wijzigen", onclick: () => onderdeelModal({ vakId, o }) }, icoon("potlood", 14)),
      el("button", {
        class: "icoon-knop klein gevaar", title: "Verwijderen",
        onclick: async () => {
          if (!(await bevestig("Onderdeel verwijderen?", `"${o.titel}" met alle taken en sub-onderdelen wordt definitief verwijderd.`))) return;
          await verwijder("onderdelen", o.id);
          toast("Onderdeel verwijderd");
        },
      }, icoon("prullenbak", 14)),
    ),
  );

  function wissel() {
    const nuOpen = blok.classList.toggle("open");
    kop.setAttribute("aria-expanded", String(nuOpen));
    if (nuOpen) dicht.delete(o.id); else dicht.add(o.id);
    localStorage.setItem("milio-dicht", JSON.stringify([...dicht]));
  }

  // Snel toevoegen: typ en Enter, de cursor blijft staan voor de volgende.
  const sleutel = "nieuw-" + o.id;
  const type = typeKeuze(localStorage.getItem("milio-laatste-type") || "opdracht");
  type.className = "nieuw-type";
  type.title = "Type van de nieuwe taak";
  const invoer = el("input", {
    class: "nieuw-invoer", type: "text", maxlength: 160, placeholder: "Taak toevoegen…", dataset: { focus: sleutel },
    onkeydown: async (e) => {
      if (e.key !== "Enter" || !invoer.value.trim()) return;
      e.preventDefault();
      const titel = invoer.value;
      invoer.value = "";
      localStorage.setItem("milio-laatste-type", type.value);
      focusNa = sleutel;
      await bewaar("taken", { onderdeel_id: o.id, titel, type: type.value }).catch(() => (invoer.value = titel));
    },
  });

  blok.append(kop, el("div", { class: "ond-body" },
    el("div", { class: "taken" }, taken.map(taakRij)),
    verborgen ? el("p", { class: "klein flauw ond-verborgen" }, `${verborgen} afgewerkt (verborgen)`) : null,
    el("div", { class: "nieuw-taak" }, icoon("plus", 14, 2.2), invoer, type),
    o.kinderen.length ? el("div", { class: "ond-subs" }, o.kinderen.map((k) => onderdeelBlok(k, vakId, verberg))) : null,
  ));
  return blok;
}

/** Klein voortgangsringetje. */
function ring(f) {
  const r = 6, omtrek = 2 * Math.PI * r;
  return svg(`<svg class="ring" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <circle cx="8" cy="8" r="${r}" fill="none" stroke="var(--paneel-3)" stroke-width="2.4"/>
    <circle cx="8" cy="8" r="${r}" fill="none" stroke="var(--k)" stroke-width="2.4" stroke-linecap="round"
      stroke-dasharray="${omtrek}" stroke-dashoffset="${omtrek * (1 - f)}" transform="rotate(-90 8 8)"/></svg>`);
}

// =========================================================
// TAAKRIJ (ook gebruikt door Deadlines en Kompas)
// =========================================================
export function vinkKnop(t) {
  return el("button", {
    class: "vink" + (t.klaar ? " aan" : "") + (t.klaar && isNet(t) ? " net" : ""),
    role: "checkbox", "aria-checked": String(!!t.klaar),
    title: t.klaar ? "Markeer als niet klaar" : "Markeer als klaar",
    onclick: (e) => {
      e.stopPropagation();
      if (t.klaar) return zetKlaar(t, false);
      netAfgevinkt.set(t.id, Date.now());
      zetKlaar(t, true);
      toast(`"${t.titel}" afgewerkt`, { actie: { label: "Ongedaan maken", fn: () => zetKlaar(t, false) } });
    },
  }, icoon("check", 12, 3));
}

export function datumChips(t) {
  return [
    t.deadline ? el("span", { class: "chip deadline " + datumStatus(t.deadline), title: `Harde deadline · ${relatief(t.deadline)}` },
      icoon("vlag", 11, 2.2), fmtDag(t.deadline)) : null,
    t.streefdatum ? el("span", { class: "chip streef " + datumStatus(t.streefdatum), title: `Mijn streefmoment · ${relatief(t.streefdatum)}` },
      icoon("klok", 11, 2.2), fmtDag(t.streefdatum)) : null,
  ];
}

function taakRij(t) {
  return el("div", { class: "taak" + (t.klaar ? " klaar" : "") + (t.klaar && isNet(t) ? " net" : ""), dataset: { taak: t.id } },
    vinkKnop(t),
    el("button", { class: "taak-titel", title: "Bewerken", onclick: () => taakModal(t) }, t.titel),
    t.notitie ? el("span", { class: "taak-notitie", title: t.notitie }, icoon("sub", 12)) : null,
    el("span", { class: "type " + t.type }, TYPES[t.type]),
    datumChips(t),
    el("div", { class: "taak-acties" },
      t.klaar ? null : el("button", { class: "icoon-knop klein", title: "Inplannen in kalender", onclick: () => planTaak(t) }, icoon("kalenderPlus", 14)),
      el("button", { class: "icoon-knop klein", title: "Bewerken", onclick: () => taakModal(t) }, icoon("potlood", 14)),
      el("button", { class: "icoon-knop klein gevaar", title: "Verwijderen", onclick: () => verwijderTaak(t) }, icoon("prullenbak", 14)),
    ),
  );
}
