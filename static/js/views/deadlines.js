/* =========================================================
   Milio — views/deadlines.js
   Harde deadlines en persoonlijke streefmomenten, apart (zoals in Elio),
   gegroepeerd per periode en meteen afvinkbaar.
   ========================================================= */
import { el, icoon, vandaag, plusDagen, fmtDag, relatief, dagVerschil } from "../util.js";
import { S, meld, vakVanTaak, onderdeelPad } from "../store.js";
import { taakModal, TYPES } from "../modals.js";
import { vinkKnop } from "./vakken.js";

let tab = sessionStorage.getItem("milio-dl-tab") || "deadline";

export function render(c) {
  const veld = tab === "deadline" ? "deadline" : "streefdatum";
  const d = vandaag();
  const lijst = S.taken.filter((t) => !t.klaar && t[veld]).sort((a, b) => a[veld].localeCompare(b[veld]));
  const groepen = [
    ["Te laat", lijst.filter((t) => t[veld] < d), "te-laat"],
    ["Deze week", lijst.filter((t) => t[veld] >= d && t[veld] <= plusDagen(d, 7)), ""],
    ["Later", lijst.filter((t) => t[veld] > plusDagen(d, 7)), ""],
  ].filter(([, g]) => g.length);
  const tel = (v) => S.taken.filter((t) => !t.klaar && t[v]).length;

  c.append(
    el("header", { class: "view-kop" },
      el("div", {},
        el("h1", {}, "Deadlines"),
        el("p", { class: "sub" }, "Wat echt moet, en wat je jezelf voornam. Los van elkaar."),
      ),
    ),
    el("div", { class: "segment dl-tabs", role: "tablist" },
      [["deadline", "Harde deadlines", tel("deadline")], ["streef", "Mijn streefmomenten", tel("streefdatum")]].map(([k, label, n]) =>
        el("button", {
          class: tab === k ? "actief" : "", role: "tab", "aria-selected": String(tab === k),
          onclick: () => { tab = k; sessionStorage.setItem("milio-dl-tab", k); meld(); },
        }, label, n ? el("span", { class: "dl-tab-n" }, n) : null))),
  );

  if (!groepen.length) {
    c.append(el("div", { class: "leeg" },
      icoon(tab === "deadline" ? "vlag" : "klok", 30, 1.5),
      el("strong", {}, tab === "deadline" ? "Geen open deadlines" : "Geen streefmomenten"),
      el("span", {}, tab === "deadline"
        ? "Zet een deadline bij een taak (potloodje) en ze verschijnt hier en in je kalender."
        : "Een streefmoment is je eigen doel: 'tegen dan wil ik dit af hebben'."),
    ));
    return;
  }

  for (const [titel, taken, klasse] of groepen) {
    c.append(el("section", { class: "dl-groep " + klasse },
      el("h2", {}, titel, el("span", { class: "flauw" }, ` ${taken.length}`)),
      el("div", { class: "lijst" }, taken.map((t) => {
        const v = vakVanTaak(t);
        const dag = t[veld];
        const n = dagVerschil(d, dag);
        return el("div", { class: "lijst-rij dl-rij", style: { "--k": v?.kleur || "var(--accent)" } },
          el("span", { class: "dl-kleur" }),
          vinkKnop(t),
          el("button", { class: "lijst-titel", onclick: () => taakModal(t) }, t.titel,
            el("span", { class: "lijst-sub" }, el("span", { class: "stip" }), v?.naam || "", ` · ${onderdeelPad(t.onderdeel_id)} · ${TYPES[t.type]}`)),
          el("div", { class: "dl-datum" + (n < 0 ? " te-laat" : n === 0 ? " vandaag" : "") },
            el("strong", {}, fmtDag(dag, { weekday: "short", day: "numeric", month: "short" })),
            el("span", {}, relatief(dag))),
        );
      })),
    ));
  }
}
