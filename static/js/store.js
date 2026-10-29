/* =========================================================
   Milio — store.js
   Alle data in het geheugen, één bron van waarheid voor de views.
   Wijzigingen gaan naar de server en daarna roept meld() alle views op.
   ========================================================= */
import { api, naarWand } from "./util.js";

export const S = {
  vakken: [],
  onderdelen: [],
  taken: [],
  inst: {},
  events: new Map(), // id -> event (enkel wat al eens geladen is)
};

const luisteraars = new Set();
export const opWijziging = (fn) => luisteraars.add(fn);
export const meld = () => luisteraars.forEach((fn) => fn());

// ---------- Indexen ----------
let I = { vak: new Map(), ond: new Map(), taak: new Map() };
function herindexeer() {
  I = {
    vak: new Map(S.vakken.map((v) => [v.id, v])),
    ond: new Map(S.onderdelen.map((o) => [o.id, o])),
    taak: new Map(S.taken.map((t) => [t.id, t])),
  };
}
export const vak = (id) => I.vak.get(id);
export const onderdeel = (id) => I.ond.get(id);
export const taak = (id) => I.taak.get(id);
export const vakVanTaak = (t) => vak(onderdeel(t.onderdeel_id)?.vak_id);

export function takenVanVak(vakId) {
  return S.taken.filter((t) => onderdeel(t.onderdeel_id)?.vak_id === vakId);
}

export function voortgang(vakId) {
  const lijst = takenVanVak(vakId);
  const perType = { opdracht: [0, 0], theorie: [0, 0], labo: [0, 0] };
  let klaar = 0;
  for (const t of lijst) {
    perType[t.type][1]++;
    if (t.klaar) { klaar++; perType[t.type][0]++; }
  }
  const totaal = lijst.length;
  return { totaal, klaar, open: totaal - klaar, pct: totaal ? Math.round((klaar / totaal) * 100) : 0, perType };
}

/** Onderdelen van een vak als boom (children), in volgorde. */
export function boom(vakId) {
  const knopen = new Map();
  for (const o of S.onderdelen) if (o.vak_id === vakId) knopen.set(o.id, { ...o, kinderen: [] });
  const wortels = [];
  for (const k of knopen.values()) {
    const ouder = k.parent_id && knopen.get(k.parent_id);
    (ouder ? ouder.kinderen : wortels).push(k);
  }
  return wortels;
}

/** Pad als tekst, bv. "Hoofdstuk 2 › Oefeningen". */
export function onderdeelPad(id) {
  const delen = [];
  for (let o = onderdeel(id); o; o = o.parent_id ? onderdeel(o.parent_id) : null) delen.unshift(o.titel);
  return delen.join(" › ");
}

// ---------- Laden ----------
export async function laad() {
  const d = await api("/data");
  S.vakken = d.vakken;
  S.onderdelen = d.onderdelen;
  S.taken = d.taken;
  S.inst = d.instellingen;
  herindexeer();
  meld();
}

// ---------- Opslaan / verwijderen ----------
export async function bewaar(tabel, obj) {
  const { id, ...rest } = obj;
  const rij = id ? await api(`/${tabel}/${id}`, "PUT", rest) : await api(`/${tabel}`, "POST", rest);
  if (tabel === "events") {
    S.events.set(rij.id, rij);
  } else {
    const lijst = S[tabel];
    const i = lijst.findIndex((x) => x.id === rij.id);
    if (i >= 0) lijst[i] = rij; else lijst.push(rij);
    herindexeer();
  }
  meld();
  return rij;
}

export async function verwijder(tabel, id) {
  await api(`/${tabel}/${id}`, "DELETE");
  if (tabel === "events") {
    S.events.delete(id);
    meld();
  } else if (tabel === "taken") {
    S.taken = S.taken.filter((t) => t.id !== id);
    for (const e of S.events.values()) if (e.taak_id === id) e.taak_id = null;
    herindexeer();
    meld();
  } else {
    await laad(); // vakken/onderdelen: de database ruimt kinderen op, dus alles opnieuw lezen
    S.events.clear();
  }
}

/** Taak afvinken: meteen zichtbaar, daarna pas naar de server. */
export async function zetKlaar(t, klaar) {
  const oud = t.klaar;
  t.klaar = klaar ? 1 : 0;
  meld();
  try {
    Object.assign(t, await api(`/taken/${t.id}`, "PUT", { klaar }));
  } catch {
    t.klaar = oud;
  }
  meld();
}

export async function zetInst(obj, { stil = false } = {}) {
  for (const [k, v] of Object.entries(obj)) S.inst[k] = String(v);
  if (!stil) meld();
  await api("/instellingen", "PUT", obj).catch(() => {});
}

// ---------- Events ----------
const geladenBereiken = new Set();
/** Laadt een bereik één keer (views roepen dit bij elke render aan). */
export function zorgVoorEvents(van, tot) {
  const k = `${van}|${tot}`;
  if (geladenBereiken.has(k)) return;
  geladenBereiken.add(k);
  laadEvents(van, tot).catch(() => geladenBereiken.delete(k));
}

/** Laadt alle events tussen van (incl.) en tot (excl.) in de cache. */
export async function laadEvents(van, tot) {
  const lijst = await api(`/events?van=${van}&tot=${tot}`);
  for (const [id, e] of S.events) if (overlapt(e, van, tot)) S.events.delete(id);
  for (const e of lijst) S.events.set(e.id, e);
  meld();
}

/** Begin en einde in wandklok-minuten (hele dag: tot het einde van de laatste dag). */
export function bereik(e) {
  return [naarWand(e.start), e.hele_dag ? naarWand(e.eind) + 1440 : naarWand(e.eind)];
}
export function overlapt(e, van, tot) {
  const [a, b] = bereik(e);
  return a < naarWand(tot) && b > naarWand(van);
}
export function eventsTussen(van, tot) {
  return [...S.events.values()].filter((e) => overlapt(e, van, tot));
}
/** Minuten per vak in [van, tot), stukken buiten het bereik tellen niet mee. */
export function tijdPerVak(van, tot) {
  const a0 = naarWand(van), b0 = naarWand(tot);
  const uit = new Map();
  for (const e of eventsTussen(van, tot)) {
    if (e.hele_dag || !e.vak_id) continue;
    const [a, b] = bereik(e);
    const min = Math.max(0, Math.min(b, b0) - Math.max(a, a0));
    const r = uit.get(e.vak_id) || { min: 0, focus: 0 };
    r.min += min;
    if (e.soort === "focus") r.focus += min;
    uit.set(e.vak_id, r);
  }
  return uit;
}

export function eventKleur(e) {
  return vak(e.vak_id)?.kleur || e.kleur || "#6B7A8F";
}
