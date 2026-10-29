/* =========================================================
   Milio — instellingen.js
   Naam, thema, uren van de kalender, animaties, Elio-import.
   ========================================================= */
import { el, icoon, toast, api, pasThemaToe } from "./util.js";
import { S, laad, zetInst } from "./store.js";
import { formModal, veld, bevestig } from "./modals.js";

const THEMAS = { dark: "Donker", grey: "Grijs", light: "Licht" };

/**
 * Status van Elio + importknop. Vult zichzelf zodra de server antwoordt.
 * aanbod = true: enkel iets tonen als er echt iets te importeren valt (voor lege schermen).
 */
export function elioBlok({ aanbod = false } = {}) {
  const blok = el("div", { class: "inst-elio" + (aanbod ? " elio-aanbod" : "") },
    aanbod ? null : el("span", { class: "klein" }, "Elio zoeken…"));
  api("/elio").then((st) => {
    if (aanbod && (st.geimporteerd_op || !st.gevonden)) return blok.remove();
    if (st.geimporteerd_op) {
      blok.replaceChildren(el("span", { class: "klein" }, icoon("check", 13, 2.4), ` Geïmporteerd op ${st.geimporteerd_op.replace("T", " om ")}.`));
    } else if (!st.gevonden) {
      blok.replaceChildren(el("span", { class: "klein" }, "Geen Elio gevonden op ", el("code", {}, st.pad), "."));
    } else {
      blok.replaceChildren(
        el("span", { class: "klein" }, aanbod
          ? "Elio gevonden. Haal je vakken, onderdelen en taken in één klik op; Elio zelf blijft onaangeroerd."
          : "Elio gevonden. Je vakken, onderdelen en taken worden gekopieerd; Elio zelf blijft onaangeroerd."),
        el("span", { class: "klein flauw elio-pad" }, el("code", {}, st.pad),
          st.laatst_gebruikt ? ` · laatst gebruikt ${st.laatst_gebruikt.replace("T", " om ")}` : ""),
        el("button", {
          type: "button", class: "knop klein" + (aanbod ? " primair" : ""),
          onclick: async () => {
            if (!(await bevestig("Elio importeren?", "Alle vakken, onderdelen en taken uit Elio worden aan Milio toegevoegd. Dit kan maar één keer.", "Importeren"))) return;
            const r = await api("/elio", "POST");
            blok.replaceChildren(el("span", { class: "klein" }, icoon("check", 13, 2.4), ` ${r.vakken} vakken, ${r.onderdelen} onderdelen en ${r.taken} taken geïmporteerd.`));
            toast("Elio geïmporteerd");
            await laad();
          },
        }, icoon("import", 14, 2), "Importeren uit Elio"),
      );
    }
  }).catch(() => blok.remove());
  return blok;
}

export function instellingenModal() {
  const naam = el("input", { type: "text", maxlength: 40, placeholder: "Voor de begroeting in Kompas", value: S.inst.naam || "" });
  let thema = S.inst.thema || "dark";
  const themaKeuze = el("div", { class: "segment" });
  const tekenThema = () => themaKeuze.replaceChildren(...Object.entries(THEMAS).map(([k, label]) =>
    el("button", { type: "button", class: k === thema ? "actief" : "", onclick: () => { thema = k; pasThemaToe(k); tekenThema(); } }, label)));
  tekenThema();

  const uur = (van, tot, waarde) => el("select", {}, Array.from({ length: tot - van + 1 }, (_, i) => van + i)
    .map((u) => el("option", { value: u, selected: u === Number(waarde) }, `${u}:00`)));
  const start = uur(0, 12, S.inst.dag_start ?? 7);
  const eind = uur(13, 24, S.inst.dag_eind ?? 24);
  const animaties = el("input", { type: "checkbox", checked: S.inst.animaties !== "0" });
  const elio = elioBlok();

  formModal({
    titel: "Instellingen",
    breed: true,
    velden: [
      veld("Je naam", naam),
      el("div", { class: "veld" }, el("span", {}, "Thema"), themaKeuze),
      el("div", { class: "veld-rij" }, veld("Kalender begint om", start), veld("Kalender eindigt om", eind)),
      el("label", { class: "vinkje", style: { "margin-bottom": "18px" } }, animaties, "Bewegende wolken en vogel bij Focus"),
      el("div", { class: "inst-blok" }, el("strong", {}, "Uit Elio overzetten"), elio),
      el("div", { class: "inst-blok" }, el("strong", {}, "Je gegevens"),
        el("span", { class: "klein" }, "Alles staat in ", el("code", {}, "data.db"),
          " in de map van Milio, op je eigen pc. Kopieer dat bestand af en toe naar OneDrive of een USB-stick als backup.")),
      el("div", { class: "inst-blok" }, el("strong", {}, "Sneltoetsen"),
        el("span", { class: "klein" }, "Kalender: ← → vorige/volgende, T vandaag, W week, M maand, N nieuw event. Focus: spatie = pauze. Esc sluit vensters.")),
    ],
    opslaan: async () => {
      if (Number(eind.value) <= Number(start.value)) {
        toast("Het einde moet na het begin liggen.", { fout: true });
        return false;
      }
      await zetInst({ naam: naam.value.trim(), thema, dag_start: start.value, dag_eind: eind.value, animaties: animaties.checked ? "1" : "0" });
      toast("Instellingen bewaard");
    },
    opSluit: () => pasThemaToe(S.inst.thema || "dark"),
  });
}
