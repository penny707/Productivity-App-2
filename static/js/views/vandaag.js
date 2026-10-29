/* =========================================================
   Milio — views/vandaag.js  ("Kompas")
   Elke dag maximaal drie taken die nu tellen, met de reden erbij.
   De keuze blijft de hele dag hetzelfde, zodat de lijst echt af kan.
   Daarboven de dagboog: je dag als zonnebaan, je events als bogen.
   ========================================================= */
import { el, svg, icoon, toast, vandaag, plusDagen, dagVerschil, fmtDag, fmtTijd, fmtDuur, minVanDag, naarWand, nuMinuten, relatief } from "../util.js";
import { S, meld, vakVanTaak, taak, onderdeelPad, bewaar, zetInst, zorgVoorEvents, eventsTussen, bereik, eventKleur } from "../store.js";
import { taakModal } from "../modals.js";
import { bergruggen } from "../bergen.js";
import { vinkKnop } from "./vakken.js";
import { planTaak } from "./kalender.js";
import { elioBlok } from "../instellingen.js";

const MAX_KEUZES = 3;

// =========================================================
// KEUZE: welke taken tellen vandaag?
// =========================================================
function geplandVandaag() {
  const d = vandaag();
  return new Set(eventsTussen(d, plusDagen(d, 1)).map((e) => e.taak_id).filter(Boolean));
}

/** Score + mensentaal-reden. Hoger = dringender. */
export function beoordeel(t, gepland = geplandVandaag()) {
  const n = vandaag();
  let s = 0, reden = "", soort = "rustig";
  if (t.deadline) {
    const d = dagVerschil(n, t.deadline);
    s = d < 0 ? 100 + Math.min(-d, 10) : d === 0 ? 96 : d === 1 ? 88 : d <= 7 ? 75 - d * 4 : Math.max(4, 40 - d);
    reden = d < 0 ? `deadline ${-d}d geleden` : d === 0 ? "deadline vandaag" : d === 1 ? "deadline morgen"
      : d <= 7 ? `deadline over ${d} dagen` : `deadline ${fmtDag(t.deadline)}`;
    soort = d <= 1 ? "dringend" : d <= 7 ? "deadline" : "rustig";
  }
  if (t.streefdatum) {
    const d = dagVerschil(n, t.streefdatum);
    const ss = d < 0 ? 70 + Math.min(-d, 5) : d === 0 ? 68 : d === 1 ? 45 : d <= 3 ? 35 : 8;
    if (ss > s) {
      s = ss;
      reden = d < 0 ? `streefmoment ${-d}d geleden`
        : d === 0 ? "streefmoment vandaag" : d === 1 ? "streefmoment morgen" : `streefmoment over ${d} dagen`;
      soort = d <= 0 ? "streef" : "rustig";
    }
  }
  if (gepland.has(t.id)) {
    s += 30;
    reden = reden ? `${reden} · staat in je kalender` : "staat vandaag in je kalender";
    if (soort === "rustig") soort = "gepland";
  }
  if (!reden) reden = "volgende stap";
  s += { opdracht: 2, labo: 1, theorie: 0 }[t.type] || 0;
  return { s, reden, soort };
}

/** De volgende kandidaten, beste eerst. Taken zonder datum: hoogstens één per vak (de eerste open). */
function kandidaten(uitsluiten = new Set()) {
  const gepland = geplandVandaag();
  const open = S.taken.filter((t) => !t.klaar && !uitsluiten.has(t.id));
  const metDatum = open
    .map((t) => ({ t, ...beoordeel(t, gepland) }))
    .filter((x) => x.s >= 20)
    .sort((a, b) => b.s - a.s);
  // Rustige aanvulling: per vak de eerste open taak, in de volgorde van het vak.
  const rustig = [];
  const ondVolgorde = new Map(S.onderdelen.map((o, i) => [o.id, i]));
  for (const v of S.vakken) {
    const eerste = open
      .filter((t) => vakVanTaak(t)?.id === v.id && !metDatum.some((x) => x.t === t))
      .sort((a, b) => ondVolgorde.get(a.onderdeel_id) - ondVolgorde.get(b.onderdeel_id) || a.volgorde - b.volgorde)[0];
    if (eerste) rustig.push({ t: eerste, ...beoordeel(eerste, gepland) });
  }
  return [...metDatum, ...rustig];
}

// De keuze van de dag: { dag, ids (gekozen), weg (vandaag weggeschoven, komen niet terug) }
function bewaarKeuze(k) {
  zetInst({ kompas: JSON.stringify({ dag: k.dag, ids: k.ids, weg: k.weg }) }, { stil: true });
}

/** De keuze van vandaag; nieuw berekend bij een nieuwe dag, of als ze leeg is en je niets wegschoof. */
function keuze() {
  let k = null;
  try { k = JSON.parse(S.inst.kompas || "null"); } catch { /* opnieuw beginnen */ }
  const nieuweDag = !k || k.dag !== vandaag();
  if (nieuweDag) k = { dag: vandaag(), ids: [], weg: [] };
  k.weg ||= [];
  const ids = (k.ids || []).filter((id) => taak(id));
  if (!ids.length && !k.weg.length) {
    const vers = kandidaten().slice(0, MAX_KEUZES).map((x) => x.t.id);
    if (vers.length || nieuweDag) {
      k.ids = vers;
      bewaarKeuze(k);
      return k;
    }
  }
  if (ids.length !== (k.ids || []).length) { k.ids = ids; bewaarKeuze(k); }
  return k;
}
const nietMeer = (k) => new Set([...k.ids, ...k.weg]);

function voegToe(id) {
  const k = keuze();
  if (!k.ids.includes(id)) k.ids.push(id);
  k.weg = k.weg.filter((x) => x !== id);
  bewaarKeuze(k);
  meld();
}

async function schuifOp(t, dagen) {
  const k = keuze();
  const vorige = { ...k, ids: [...k.ids], weg: [...k.weg] };
  const oud = t.streefdatum;
  const nieuw = plusDagen(vandaag(), dagen);
  bewaarKeuze({ ...k, ids: k.ids.filter((id) => id !== t.id), weg: [...k.weg, t.id] });
  await bewaar("taken", { id: t.id, streefdatum: nieuw });
  toast(`Verschoven naar ${dagen === 1 ? "morgen" : fmtDag(nieuw, { weekday: "long" })}`, {
    actie: {
      label: "Ongedaan maken",
      fn: async () => { bewaarKeuze(vorige); await bewaar("taken", { id: t.id, streefdatum: oud }); },
    },
  });
}

// =========================================================
// RENDER
// =========================================================
export function render(c) {
  const d = vandaag();
  zorgVoorEvents(d, plusDagen(d, 2));
  const k = keuze();
  const ids = k.ids;
  const gekozen = ids.map(taak).filter(Boolean);
  const gedaan = gekozen.filter((t) => t.klaar).length;

  c.append(
    hero(gekozen),
    el("section", { class: "kompas-blok" },
      el("div", { class: "kompas-kop" },
        el("h2", {}, "Eerst dit"),
        gekozen.length ? el("div", { class: "kompas-stippen", title: `${gedaan} van ${gekozen.length} gedaan` },
          gekozen.map((t) => el("span", { class: t.klaar ? "aan" : "" }))) : null,
        gekozen.length ? el("span", { class: "klein" }, `${gedaan} van ${gekozen.length}`) : null,
      ),
      keuzeLijst(gekozen, k),
    ),
    el("div", { class: "kompas-kolommen" },
      el("section", { class: "kompas-blok" }, el("div", { class: "kompas-kop" }, el("h2", {}, "Niet vergeten")), nietVergeten(ids)),
      el("section", { class: "kompas-blok" }, el("div", { class: "kompas-kop" }, el("h2", {}, "In je kalender"),
        el("a", { class: "knop stil klein", href: "#/kalender" }, "Kalender", icoon("rechts", 13, 2.2))), agenda()),
    ),
    rustLijn(ids),
  );
}

export function tik(c) {
  const oud = c.querySelector(".kompas-hero");
  if (!oud) return;
  oud.replaceWith(hero(keuze().ids.map(taak).filter(Boolean)));
}

// ---------- Hero met dagboog ----------
const groet = (u) => (u < 6 ? "Goedenacht" : u < 12 ? "Goedemorgen" : u < 18 ? "Goedemiddag" : "Goedenavond");

function hero(gekozen) {
  const d = vandaag();
  const nu = nuMinuten();
  const naam = (S.inst.naam || "").trim();
  const vandaagEvents = eventsTussen(d, plusDagen(d, 1)).filter((e) => !e.hele_dag);
  const nuWand = naarWand(d) + nu;
  const huidig = vandaagEvents.filter((e) => { const [a, b] = bereik(e); return a <= nuWand && nuWand < b; });
  const straks = vandaagEvents.filter((e) => bereik(e)[0] > nuWand).sort((a, b) => a.start.localeCompare(b.start))[0];

  const open = gekozen.filter((t) => !t.klaar).length;
  const eersteDl = S.taken.filter((t) => !t.klaar && t.deadline && t.deadline >= d).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const nogEvents = vandaagEvents.filter((e) => bereik(e)[1] > nuWand).length;
  const samenvatting = [
    gekozen.length ? (open ? `${open} ${open === 1 ? "ding" : "dingen"} voor vandaag` : "alles van vandaag is af") : null,
    nogEvents ? `nog ${nogEvents} ${nogEvents === 1 ? "event" : "events"}` : null,
    eersteDl ? `volgende deadline ${relatief(eersteDl.deadline)}` : null,
  ].filter(Boolean).join(" · ");

  let nuTekst;
  if (huidig.length) {
    const e = huidig[0];
    nuTekst = [el("span", { class: "nu-pil" }, "nu"), el("strong", {}, e.titel || taak(e.taak_id)?.titel || "Event"),
      ` tot ${fmtTijd(minVanDag(e.eind))}`];
  } else if (straks) {
    const over = bereik(straks)[0] - nuWand;
    nuTekst = [el("span", { class: "nu-pil straks" }, "straks"), el("strong", {}, straks.titel || "Event"),
      ` om ${fmtTijd(minVanDag(straks.start))} (over ${fmtDuur(over)})`];
  } else {
    nuTekst = [el("span", { class: "nu-pil vrij" }, "vrij"), "Niets meer gepland vandaag"];
  }

  return el("div", { class: "kompas-hero" },
    el("header", { class: "kompas-hero-tekst" },
      el("h1", {}, naam ? `${groet(new Date().getHours())}, ${naam}` : groet(new Date().getHours())),
      el("p", { class: "sub" },
        el("span", { class: "kompas-datum" }, fmtDag(d, { weekday: "long", day: "numeric", month: "long" })),
        samenvatting ? ` · ${samenvatting}` : ""),
    ),
    el("section", { class: "kompas-scene", style: lucht() },
      svg(dagboog(vandaagEvents)),
      el("div", { class: "kompas-nu" }, nuTekst),
    ),
  );
}

/** Luchtkleuren volgens het uur: ochtendgloed, dag, avondrood, nacht. */
function lucht() {
  const u = new Date().getHours() + new Date().getMinutes() / 60;
  const donker = document.documentElement.dataset.thema === "dark";
  const fase = u < 6 || u >= 21.5 ? "nacht" : u < 9.5 ? "ochtend" : u < 17 ? "dag" : "avond";
  const P = donker
    ? { nacht: ["#0b0e1c", "#151a30"], ochtend: ["#18203d", "#3d2c45"], dag: ["#14203f", "#20305a"], avond: ["#1b1a38", "#4a2a3e"] }
    : { nacht: ["#c9d1ec", "#e4e2f1"], ochtend: ["#dfe6ff", "#ffe2d2"], dag: ["#d6e4ff", "#eef3ff"], avond: ["#e2dbfa", "#ffd8cc"] };
  return { "--lucht-1": P[fase][0], "--lucht-2": P[fase][1] };
}

function dagboog(events) {
  const W = 1000, H = 300, cx = 500, cy = 268, rx = 420, ry = 205;
  const ds = Number(S.inst.dag_start ?? 7), de = Number(S.inst.dag_eind ?? 24);
  const f = (min) => Math.min(1, Math.max(0, (min - ds * 60) / ((de - ds) * 60)));
  const p = (t, schaal = 1) => {
    const a = Math.PI * (1 - t);
    return [cx + rx * schaal * Math.cos(a), cy - ry * schaal * Math.sin(a)];
  };
  const boog = (t1, t2) => {
    const n = Math.max(2, Math.ceil((t2 - t1) * 80));
    return "M" + Array.from({ length: n + 1 }, (_, i) => p(t1 + ((t2 - t1) * i) / n).map((v) => v.toFixed(1)).join(",")).join(" L");
  };
  const nu = nuMinuten();
  const fn = f(nu);
  const nuZichtbaar = nu >= ds * 60 && nu <= de * 60;
  const d0 = naarWand(vandaag());

  const bogen = events.map((e) => {
    const [a, b] = bereik(e);
    const t1 = f(a - d0), t2 = f(b - d0);
    if (t2 - t1 < 0.002) return "";
    const voorbij = b - d0 <= nu;
    return `<path d="${boog(t1, t2)}" stroke="${eventKleur(e)}" stroke-width="9" stroke-linecap="round" fill="none" opacity="${voorbij ? 0.4 : 1}"><title>${(e.titel || "").replace(/[<&"]/g, "")}</title></path>`;
  }).join("");

  const uren = [];
  for (let u = Math.ceil(ds / 3) * 3; u <= de; u += 3) {
    const [x, y] = p(f(u * 60), 1.085);
    uren.push(`<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" class="boog-uur">${u % 24}u</text>`);
  }

  const [zx, zy] = p(fn);
  const sterren = !nuZichtbaar || new Date().getHours() >= 20
    ? Array.from({ length: 26 }, (_, i) => {
      const x = (i * 397) % W, y = ((i * 211) % 150) + 8;
      return `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.6}" fill="#fff" opacity="${0.25 + (i % 4) * 0.12}"/>`;
    }).join("") : "";

  return `<svg class="dagboog" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="zongloed"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    </defs>
    ${sterren}
    <path d="${boog(0, 1)}" class="boog-basis" fill="none"/>
    ${nuZichtbaar ? `<path d="${boog(0, fn)}" class="boog-voorbij" fill="none"/>` : ""}
    ${bogen}
    ${uren.join("")}
    ${nuZichtbaar ? `<circle cx="${zx}" cy="${zy}" r="46" fill="url(#zongloed)"/><circle cx="${zx}" cy="${zy}" r="12" fill="#ffd27a"/><circle cx="${zx}" cy="${zy}" r="12" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>` : ""}
    ${bergruggen(11, W, H, { top: 0.6 })}
  </svg>`;
}

// ---------- Eerst dit ----------
function keuzeLijst(gekozen, k) {
  const volgende = kandidaten(nietMeer(k))[0];
  if (!gekozen.length) {
    return el("div", { class: "kompas-leeg" },
      icoon("berg", 28, 1.5),
      el("strong", {}, volgende ? "Niets meer voor vandaag" : "Geen open taken"),
      el("span", {}, volgende ? "Je schoof alles door. Dat mag. Wil je toch iets doen?" : "Voeg taken toe in je vakken, dan kiest Kompas elke dag wat telt."),
      volgende
        ? el("button", { class: "knop", onclick: () => voegToe(volgende.t.id) }, icoon("plus", 14, 2.2), "Geef me er eentje")
        : el("a", { class: "knop", href: "#/vakken" }, "Naar vakken"),
      S.vakken.length ? null : elioBlok({ aanbod: true }),
    );
  }
  const gepland = geplandVandaag();
  const allesAf = gekozen.every((t) => t.klaar);
  const kaarten = gekozen.map((t, i) => {
    const v = vakVanTaak(t);
    const { reden, soort } = beoordeel(t, gepland);
    return el("article", { class: "keuze" + (t.klaar ? " klaar" : ""), style: { "--k": v?.kleur || "var(--accent)", "--i": i } },
      vinkKnop(t),
      el("div", { class: "keuze-tekst" },
        el("button", { class: "keuze-titel", onclick: () => taakModal(t), title: "Bewerken" }, t.titel),
        el("div", { class: "keuze-meta" },
          el("span", { class: "stip" }), v?.naam || "", el("span", { class: "flauw" }, " · " + onderdeelPad(t.onderdeel_id))),
      ),
      t.klaar ? el("span", { class: "keuze-reden ok" }, icoon("check", 12, 2.6), "gedaan")
        : el("span", { class: "keuze-reden " + soort }, reden),
      t.klaar ? null : el("div", { class: "keuze-acties" },
        el("a", { class: "icoon-knop", title: "Focus hierop", href: `#/focus/${t.id}` }, icoon("focus", 16)),
        el("button", { class: "icoon-knop", title: "Inplannen in kalender", onclick: () => planTaak(t) }, icoon("kalenderPlus", 16)),
        laterMenu(t),
      ),
    );
  });
  return el("div", { class: "keuzes" },
    kaarten,
    allesAf ? el("div", { class: "kompas-af" },
      el("div", {}, el("strong", {}, "Klaar voor vandaag."), el("span", {}, ` Je hebt ${gekozen.length === 1 ? "je taak" : `alle ${gekozen.length} taken`} afgewerkt. De rest mag wachten.`)),
      volgende ? el("button", { class: "knop klein", onclick: () => voegToe(volgende.t.id) }, icoon("plus", 13, 2.4), "Nog eentje") : null,
    ) : null,
  );
}

function laterMenu(t) {
  const menu = el("div", { class: "later-menu", hidden: true },
    [[1, "Morgen"], [2, "Overmorgen"], [7, "Volgende week"]].map(([n, label]) =>
      el("button", { onclick: () => schuifOp(t, n) }, label, el("span", { class: "flauw" }, fmtDag(plusDagen(vandaag(), n), { weekday: "short", day: "numeric" })))));
  const knop = el("button", {
    class: "knop stil klein", title: "Mag later",
    onclick: (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      document.querySelectorAll(".later-menu").forEach((m) => (m.hidden = true));
      menu.hidden = !open;
      if (open) setTimeout(() => document.addEventListener("click", () => (menu.hidden = true), { once: true }), 0);
    },
  }, "Later", icoon("omlaag", 13, 2.2));
  return el("div", { class: "later" }, knop, menu);
}

// ---------- Niet vergeten ----------
function nietVergeten(ids) {
  const d = vandaag(), grens = plusDagen(d, 7);
  const rijen = [];
  for (const t of S.taken) {
    if (t.klaar || ids.includes(t.id)) continue;
    if (t.deadline && t.deadline <= grens) rijen.push({ t, dag: t.deadline, soort: "deadline" });
    else if (t.streefdatum && t.streefdatum <= plusDagen(d, 1)) rijen.push({ t, dag: t.streefdatum, soort: "streef" });
  }
  rijen.sort((a, b) => a.dag.localeCompare(b.dag));
  if (!rijen.length) return el("p", { class: "kompas-stil" }, "Niets in de komende 7 dagen. Lekker.");
  return el("div", { class: "lijst" }, rijen.slice(0, 7).map(({ t, dag, soort }) => {
    const v = vakVanTaak(t);
    const n = dagVerschil(d, dag);
    return el("div", { class: "lijst-rij", style: { "--k": v?.kleur || "var(--accent)" } },
      vinkKnop(t),
      el("button", { class: "lijst-titel", onclick: () => taakModal(t) }, t.titel,
        el("span", { class: "lijst-sub" }, el("span", { class: "stip" }), v?.naam || "")),
      el("span", { class: `lijst-dag ${soort}` + (n < 0 ? " te-laat" : n <= 1 ? " bijna" : ""), title: soort === "deadline" ? "Harde deadline" : "Streefmoment" },
        icoon(soort === "deadline" ? "vlag" : "klok", 11, 2.3), relatief(dag)),
      el("button", { class: "icoon-knop klein", title: "Zet bij 'Eerst dit'", onclick: () => voegToe(t.id) }, icoon("plus", 14, 2.2)),
    );
  }), rijen.length > 7 ? el("a", { class: "klein lijst-meer", href: "#/deadlines" }, `en nog ${rijen.length - 7}…`) : null);
}

// ---------- Agenda ----------
function agenda() {
  const d = vandaag();
  const nuWand = naarWand(d) + nuMinuten();
  const lijst = eventsTussen(d, plusDagen(d, 1)).sort((a, b) => (b.hele_dag - a.hele_dag) || a.start.localeCompare(b.start));
  if (!lijst.length) {
    return el("p", { class: "kompas-stil" }, "Je kalender is leeg vandaag. ",
      el("a", { href: "#/kalender" }, "Plan iets"), " of laat de dag gewoon gebeuren.");
  }
  return el("div", { class: "lijst" }, lijst.map((e) => {
    const [a, b] = bereik(e);
    const status = b <= nuWand ? " voorbij" : a <= nuWand ? " nu" : "";
    return el("a", { class: "agenda-rij" + status, href: "#/kalender", style: { "--k": eventKleur(e) } },
      el("span", { class: "agenda-tijd" }, e.hele_dag ? "hele dag"
        : `${a < naarWand(d) ? "…" : fmtTijd(minVanDag(e.start))} – ${b > naarWand(plusDagen(d, 1)) ? "…" : fmtTijd(minVanDag(e.eind))}`),
      el("span", { class: "agenda-balk" }),
      el("span", { class: "agenda-titel" }, e.soort === "focus" ? icoon("focus", 12, 2.2) : null, e.titel || taak(e.taak_id)?.titel || "(geen titel)"),
      status === " nu" ? el("span", { class: "nu-pil" }, "nu") : null,
    );
  }));
}

// ---------- De rest wacht ----------
function rustLijn(ids) {
  const open = S.taken.filter((t) => !t.klaar).length;
  const rest = open - ids.filter((id) => !taak(id)?.klaar).length;
  if (rest <= 0) return null;
  return el("p", { class: "kompas-rust" },
    icoon("berg", 15, 1.8),
    `${rest} andere open ${rest === 1 ? "taak wacht" : "taken wachten"} rustig. Die hoeven vandaag niet.`,
    el("a", { href: "#/vakken" }, "Bekijk vakken"));
}
