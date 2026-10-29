/* =========================================================
   Milio — util.js
   Kleine hulpjes: DOM, iconen, datums, toast, API.
   ========================================================= */

// ---------- DOM ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el("div", { class: "x", onclick: fn, style: { "--k": kleur } }, kind, "tekst", ...) */
export function el(tag, attrs = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") {
      for (const [p, w] of Object.entries(v)) e.style.setProperty(p, w);
    } else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else if (k === "checked") e.checked = !!v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  voegToe(e, kinderen);
  return e;
}

function voegToe(e, kinderen) {
  for (const k of kinderen) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) voegToe(e, k);
    else e.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** Maakt een element vanuit SVG-markup (enkel voor onze eigen, vaste SVG's). */
export function svg(markup) {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

// ---------- Iconen (lijnstijl, 24x24) ----------
const ICONEN = {
  kompas: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z",
  kalender: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  vakken: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22H20v-5",
  vlag: "M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1",
  focus: "M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  plus: "M12 5v14M5 12h14",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  links: "M15 18l-6-6 6-6",
  rechts: "M9 18l6-6-6-6",
  omlaag: "M6 9l6 6 6-6",
  potlood: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z",
  prullenbak: "M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
  klok: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  zon: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  maan: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  instellingen: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  zijbalk: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18",
  spelen: "M7 4.5v15l12-7.5z",
  pauze: "M8 5v14M16 5v14",
  stop: "M7 7h10v10H7z",
  kalenderPlus: "M8 2v4M16 2v4M3 10h18M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8M19 16v6M16 19h6",
  later: "M5 12h14M13 6l6 6-6 6",
  oog: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  oogUit: "M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M6.6 6.6A18 18 0 0 0 1 12s4 8 11 8a9.7 9.7 0 0 0 5.4-1.6M1 1l22 22M14.1 14.1a3 3 0 1 1-4.2-4.2",
  sub: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  berg: "M8 3l4 8 5-5 5 15H2z",
  import: "M12 3v12M7 10l5 5 5-5M5 21h14",
  ster: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
};
const GEVULD = new Set(["spelen"]);

export function icoon(naam, grootte = 16, dikte = 1.9) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", grootte);
  s.setAttribute("height", grootte);
  s.setAttribute("aria-hidden", "true");
  const vul = GEVULD.has(naam);
  s.setAttribute("fill", vul ? "currentColor" : "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", dikte);
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", ICONEN[naam] || "");
  s.appendChild(p);
  return s;
}

// ---------- Datums ----------
// Datums zijn 'YYYY-MM-DD' (lokaal); momenten 'YYYY-MM-DDTHH:MM' (lokaal).
// Rekenen met "wandklok-minuten" (alsof de lokale tijd UTC is) vermijdt zomeruur-gedoe.
const pad = (n) => String(n).padStart(2, "0");

export function isoDag(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const vandaag = () => isoDag(new Date());
export function nuMoment() {
  const d = new Date();
  return `${isoDag(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function nuMinuten() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export function naarWand(m) {
  const [y, mo, d] = m.slice(0, 10).split("-").map(Number);
  const h = m.length > 10 ? Number(m.slice(11, 13)) : 0;
  const mi = m.length > 10 ? Number(m.slice(14, 16)) : 0;
  return Date.UTC(y, mo - 1, d, h, mi) / 60000;
}
export function vanWand(min, metTijd = true) {
  const d = new Date(Math.round(min) * 60000);
  const dag = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return metTijd ? `${dag}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : dag;
}
export const plusDagen = (dag, n) => vanWand(naarWand(dag) + n * 1440, false);
export const dagVerschil = (van, tot) => Math.round((naarWand(tot) - naarWand(van)) / 1440);
export const moment = (dag, minuten) => vanWand(naarWand(dag) + minuten);
export const minVanDag = (m) => Number(m.slice(11, 13)) * 60 + Number(m.slice(14, 16));

export function maandagVan(dag) {
  const wd = (new Date(naarWand(dag) * 60000).getUTCDay() + 6) % 7; // ma = 0
  return plusDagen(dag, -wd);
}
export function weekNummer(dag) {
  // ISO-week: de week van de donderdag telt.
  const d = new Date(naarWand(dag) * 60000);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const jaarStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d - jaarStart) / 86400000 + 1) / 7);
}

const datumObj = (dag) => new Date(naarWand(dag) * 60000);
export function fmtDag(dag, opties = { day: "numeric", month: "short" }) {
  return datumObj(dag).toLocaleDateString("nl-BE", { timeZone: "UTC", ...opties });
}
export const fmtTijd = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(Math.round(min % 60))}`;
export function fmtDuur(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const u = Math.floor(min / 60), r = min % 60;
  return r ? `${u}u${pad(r)}` : `${u}u`;
}

/** "vandaag", "morgen", "over 3d", "gisteren", "2d te laat" */
export function relatief(dag, teLaatWoord = "te laat") {
  const n = dagVerschil(vandaag(), dag);
  if (n === 0) return "vandaag";
  if (n === 1) return "morgen";
  if (n === -1) return teLaatWoord === "te laat" ? "1d te laat" : "gisteren";
  if (n < 0) return `${-n}d ${teLaatWoord}`;
  if (n < 7) return `over ${n}d`;
  if (n < 14) return "volgende week";
  return `over ${Math.round(n / 7)} weken`;
}
export function datumStatus(dag) {
  if (!dag) return "";
  const t = vandaag();
  return dag < t ? "verlopen" : dag === t ? "vandaag" : "";
}

// ---------- Kleur ----------
export const KLEUREN = [
  "#5B7FD6", "#4E9F6E", "#D0605B", "#C99A2E", "#8B6CC9",
  "#D07B45", "#3E9C9C", "#C46A8E", "#6B7A8F", "#7E9A3E",
];

// ---------- Kleine deterministische random (voor bergen per vak) ----------
export function zaad(n) {
  let a = (n * 2654435761) >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Toast ----------
let toastTimer = null;
export function toast(bericht, { fout = false, actie = null, duur = 3200 } = {}) {
  const t = $("#toast");
  t.replaceChildren(el("span", {}, bericht));
  if (actie) {
    t.appendChild(el("button", {
      onclick: () => { t.classList.remove("zichtbaar"); actie.fn(); },
    }, actie.label));
  }
  t.className = "toast zichtbaar" + (fout ? " fout" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("zichtbaar"), actie ? duur + 2500 : duur);
}

// ---------- API ----------
export async function api(pad, methode = "GET", body = null) {
  const opties = { method: methode, headers: { "Content-Type": "application/json" } };
  if (body) opties.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(`/api${pad}`, opties);
  } catch {
    toast("Geen verbinding met Milio. Draait het zwarte venster nog?", { fout: true });
    throw new Error("offline");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.fout || `Er ging iets mis (${res.status})`, { fout: true });
    throw new Error(data.fout || res.status);
  }
  return data;
}
