/* =========================================================
   Milio — modals.js
   Eén klein modal-systeem + de formulieren voor vak, onderdeel, taak.
   ========================================================= */
import { el, $$, icoon, toast, KLEUREN } from "./util.js";
import { S, bewaar, verwijder, onderdeelPad, vak } from "./store.js";

// ---------- Basis ----------
/** Toont een modal. inhoud = functie (sluit) => Node. Geeft sluit() terug. */
export function modal(inhoud, { breed = false, opSluit = null } = {}) {
  const vorigeFocus = document.activeElement;
  const laag = el("div", { class: "modal-laag" });
  const doos = el("div", { class: "modal" + (breed ? " breed" : ""), role: "dialog", "aria-modal": "true" });
  const sluit = () => {
    if (!laag.isConnected) return;
    laag.remove();
    document.removeEventListener("keydown", opToets, true);
    vorigeFocus?.focus?.();
    opSluit?.();
  };
  const opToets = (e) => {
    if (e.key === "Escape" && laag === $$(".modal-laag").at(-1)) {
      e.stopPropagation();
      sluit();
    }
  };
  laag.addEventListener("pointerdown", (e) => { if (e.target === laag) sluit(); });
  document.addEventListener("keydown", opToets, true);
  doos.appendChild(inhoud(sluit));
  laag.appendChild(doos);
  document.body.appendChild(laag);
  setTimeout(() => doos.querySelector("[autofocus], input:not([type=hidden]), button.primair")?.focus(), 30);
  return sluit;
}

/** Formulier-modal met titel, velden en Opslaan/Annuleren. */
export function formModal({ titel, velden, opslaan, knop = "Opslaan", links = null, breed = false, opSluit = null }) {
  return modal((sluit) => {
    const form = el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        const knopEl = form.querySelector("button[type=submit]");
        knopEl.disabled = true;
        try {
          if ((await opslaan(form)) !== false) sluit();
        } catch { /* toast is al getoond */ }
        knopEl.disabled = false;
      },
    },
    el("h2", {}, titel),
    velden,
    el("div", { class: "modal-acties" },
      links ? links(sluit) : null,
      el("button", { type: "button", class: "knop stil", onclick: sluit }, "Annuleren"),
      el("button", { type: "submit", class: "knop primair" }, knop),
    ));
    return form;
  }, { breed, opSluit });
}

/** Vraagt bevestiging; geeft een Promise<boolean>. */
export function bevestig(titel, tekst, knop = "Verwijderen") {
  return new Promise((klaar) => {
    let antwoord = false;
    modal((sluit) => el("div", {},
      el("h2", {}, titel),
      el("p", { class: "uitleg" }, tekst),
      el("div", { class: "modal-acties" },
        el("button", { class: "knop stil", onclick: sluit }, "Annuleren"),
        el("button", { class: "knop gevaar", autofocus: true, onclick: () => { antwoord = true; sluit(); } }, knop),
      ),
    ), { opSluit: () => klaar(antwoord) });
  });
}

// ---------- Kleine bouwstenen ----------
export function veld(label, invoer, extraKlasse = "") {
  return el("label", { class: "veld " + extraKlasse }, el("span", {}, label), invoer);
}

export function kleurKiezer(gekozen, opKies) {
  const rij = el("div", { class: "kleuren", role: "radiogroup" });
  const teken = () => {
    rij.replaceChildren(...KLEUREN.map((k) => el("button", {
      type: "button",
      class: "kleur-optie" + (k.toLowerCase() === gekozen.toLowerCase() ? " gekozen" : ""),
      style: { "--k": k },
      title: k,
      "aria-label": "Kleur " + k,
      onclick: () => { gekozen = k; opKies(k); teken(); },
    })));
  };
  teken();
  return rij;
}

// ---------- Vak ----------
export function vakModal(v = null, naOpslaan = null) {
  let kleur = v?.kleur || KLEUREN[S.vakken.length % KLEUREN.length];
  const naam = el("input", { type: "text", required: true, maxlength: 80, placeholder: "bv. Ethical Hacking", value: v?.naam || "" });
  formModal({
    titel: v ? "Vak bewerken" : "Nieuw vak",
    velden: [
      veld("Naam", naam),
      el("div", { class: "veld" }, el("span", {}, "Kleur"), kleurKiezer(kleur, (k) => (kleur = k))),
    ],
    opslaan: async () => {
      const r = await bewaar("vakken", { id: v?.id, naam: naam.value, kleur });
      toast(v ? "Vak bijgewerkt" : "Vak aangemaakt");
      naOpslaan?.(r);
    },
  });
}

// ---------- Onderdeel ----------
export function onderdeelModal({ vakId, o = null, parentId = null }) {
  const titel = el("input", { type: "text", required: true, maxlength: 120, placeholder: "bv. Hoofdstuk 3", value: o?.titel || "" });
  formModal({
    titel: o ? "Onderdeel bewerken" : parentId ? "Nieuw sub-onderdeel" : "Nieuw onderdeel",
    velden: [
      parentId ? el("p", { class: "uitleg" }, "Onder: " + onderdeelPad(parentId)) : null,
      veld("Titel", titel),
    ],
    opslaan: async () => {
      await bewaar("onderdelen", o ? { id: o.id, titel: titel.value } : { vak_id: vakId, parent_id: parentId, titel: titel.value });
      toast(o ? "Onderdeel bijgewerkt" : "Onderdeel aangemaakt");
    },
  });
}

// ---------- Taak ----------
export const TYPES = { opdracht: "Opdracht", theorie: "Theorie", labo: "Labo" };
const TYPE_UITLEG = { opdracht: "Opdracht (uploaden)", theorie: "Theorie (slides gelezen)", labo: "Labo (gemaakt)" };

export function typeKeuze(waarde = "opdracht") {
  return el("select", {}, Object.entries(TYPE_UITLEG).map(([k, l]) => el("option", { value: k, selected: k === waarde }, l)));
}

export function taakModal(t = null, onderdeelId = null) {
  const oid = t?.onderdeel_id ?? onderdeelId;
  const titel = el("input", { type: "text", required: true, maxlength: 160, placeholder: "bv. Oefening 3.2 uploaden", value: t?.titel || "" });
  const type = typeKeuze(t?.type);
  const deadline = el("input", { type: "date", value: t?.deadline || "" });
  const streef = el("input", { type: "date", value: t?.streefdatum || "" });
  const notitie = el("textarea", { maxlength: 4000, placeholder: "Links, waar je bent gebleven, ...", value: t?.notitie || "" });
  formModal({
    titel: t ? "Taak bewerken" : "Nieuwe taak",
    velden: [
      el("p", { class: "uitleg" }, (vak(S.onderdelen.find((o) => o.id === oid)?.vak_id)?.naam || "") + " · " + onderdeelPad(oid)),
      veld("Titel", titel),
      veld("Type", type),
      el("div", { class: "veld-rij" },
        veld("Harde deadline", deadline),
        veld("Mijn streefmoment", streef),
      ),
      el("p", { class: "klein", style: { "margin-top": "-6px", "margin-bottom": "14px" } },
        "Deadline = moet echt af. Streefmoment = wil ik tegen dan af hebben. Allebei optioneel."),
      veld("Notitie", notitie),
    ],
    links: t ? (sluit) => el("button", {
      type: "button", class: "knop stil gevaar links",
      onclick: async () => { sluit(); await verwijderTaak(t); },
    }, icoon("prullenbak", 15), "Verwijderen") : null,
    opslaan: async () => {
      await bewaar("taken", {
        id: t?.id, onderdeel_id: oid, titel: titel.value, type: type.value,
        deadline: deadline.value || null, streefdatum: streef.value || null, notitie: notitie.value,
      });
      toast(t ? "Taak bijgewerkt" : "Taak toegevoegd");
    },
  });
}

export async function verwijderTaak(t) {
  if (!(await bevestig("Taak verwijderen?", `"${t.titel}" wordt definitief verwijderd. Tip: afvinken bewaart hem wel.`))) return;
  await verwijder("taken", t.id);
  toast("Taak verwijderd");
}
