/* =========================================================
   Milio — bergen.js
   Getekende landschappen. Elk vak heeft zijn eigen berg (vast per id),
   en je voortgang is een bolletje dat het pad naar de top beklimt.
   ========================================================= */
import { zaad } from "./util.js";

const mix = (kleur, pct, met = "var(--paneel)") => `color-mix(in srgb, ${kleur} ${pct}%, ${met})`;
const pt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

/** Een bergrug als gesloten pad over de hele breedte. */
function rug(rnd, b, h, basis, amp, stappen) {
  let d = `M0,${h} L0,${basis}`;
  for (let i = 1; i <= stappen; i++) {
    const x = (b / stappen) * i;
    const y = basis - amp * (0.35 + rnd() * 0.65) * (i % 2 ? 1 : 0.55);
    d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d + ` L${b},${h} Z`;
}

/** Punt op een polyline op fractie t (0..1) van de totale lengte. */
function puntOp(punten, t) {
  const lengtes = [];
  let totaal = 0;
  for (let i = 1; i < punten.length; i++) {
    const l = Math.hypot(punten[i][0] - punten[i - 1][0], punten[i][1] - punten[i - 1][1]);
    lengtes.push(l);
    totaal += l;
  }
  let rest = totaal * Math.min(1, Math.max(0, t));
  const af = [punten[0]];
  for (let i = 0; i < lengtes.length; i++) {
    if (rest <= lengtes[i]) {
      const f = lengtes[i] ? rest / lengtes[i] : 0;
      const p = [punten[i][0] + (punten[i + 1][0] - punten[i][0]) * f, punten[i][1] + (punten[i + 1][1] - punten[i][1]) * f];
      af.push(p);
      return { p, af };
    }
    rest -= lengtes[i];
    af.push(punten[i + 1]);
  }
  return { p: punten.at(-1), af };
}

/** SVG-markup voor de berg van een vak. pct = 0..100 */
export function vakBerg(id, kleur, pct) {
  const rnd = zaad(id + 7);
  const B = 300, H = 112;
  const px = 125 + rnd() * 60, py = 16 + rnd() * 10;
  const schouder = [px + 38 + rnd() * 20, py + 22 + rnd() * 12];
  const tweede = [schouder[0] + 26 + rnd() * 16, schouder[1] - 6 - rnd() * 8];

  // Hoofdberg met wat ruis op de linkerflank
  const links = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    links.push([px - 150 + 150 * t + (i && i < 4 ? (rnd() - 0.5) * 12 : 0), H - (H - py) * t + (i && i < 4 ? (rnd() - 0.5) * 8 : 0)]);
  }
  const berg = `M${pt(links[0])} ${links.slice(1).map((p) => "L" + pt(p)).join(" ")} L${pt(schouder)} L${pt(tweede)} L${px + 175},${H} Z`;
  const sneeuw = `M${pt([px - 13, py + 17])} L${px},${py} L${px + 11},${py + 13} L${px + 5},${py + 10} L${px - 2},${py + 16} L${px - 7},${py + 12} Z`;

  // Zigzagpad van de voet naar de top
  const pad = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const zig = i === n ? 0 : (i % 2 ? 1 : -1) * 16 * (1 - t);
    pad.push([px - 62 + 62 * t + zig, H - 3 - (H - 3 - py - 3) * t]);
  }
  const { p: wandelaar, af } = puntOp(pad, pct / 100);
  const klaar = pct >= 100;

  return `<svg viewBox="0 0 ${B} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path d="${rug(rnd, B, H, 62, 26, 9)}" style="fill:${mix(kleur, 16)}"/>
    <path d="${rug(rnd, B, H, 84, 18, 7)}" style="fill:${mix(kleur, 26)}"/>
    <path d="${berg}" style="fill:${mix(kleur, 62, "var(--paneel-2)")}"/>
    <path d="${berg}" style="fill:url(#licht-${id})"/>
    <path d="${sneeuw}" fill="rgba(255,255,255,.85)"/>
    <defs><linearGradient id="licht-${id}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".56" stop-color="#000" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".02"/>
    </linearGradient></defs>
    <polyline points="${pad.map(pt).join(" ")}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.4" stroke-dasharray="1.5 4" stroke-linecap="round"/>
    <polyline points="${af.map(pt).join(" ")}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>
    ${klaar
      ? `<g transform="translate(${px},${py})"><line x1="0" y1="0" x2="0" y2="-15" stroke="#fff" stroke-width="1.6"/><path d="M0,-15 L11,-11.5 L0,-8 Z" fill="#fff"/></g>`
      : `<circle cx="${wandelaar[0].toFixed(1)}" cy="${wandelaar[1].toFixed(1)}" r="7" fill="#fff" opacity=".25"/>
         <circle cx="${wandelaar[0].toFixed(1)}" cy="${wandelaar[1].toFixed(1)}" r="4" fill="#fff" stroke="${kleur}" stroke-width="2"/>`}
  </svg>`;
}

/**
 * Drie bergruggen als <path>-markup, voor in een groter SVG (Kompas, Focus).
 * lagen = hoeveel % accentkleur per laag (achter → voor); 0 = exact de paginakleur.
 */
export function bergruggen(seed, breedte, hoogte, { kleur = "var(--accent)", lagen = [24, 13, 0], top = 0.5 } = {}) {
  const rnd = zaad(seed);
  const span = hoogte * (1 - top);
  const vormen = [[0.25, 0.42, 11], [0.55, 0.32, 9], [0.8, 0.24, 13]];
  return vormen.map(([basis, amp, stappen], i) =>
    `<path d="${rug(rnd, breedte, hoogte, hoogte * top + span * basis, span * amp, stappen)}" style="fill:${mix(kleur, lagen[i], "var(--bg)")}"/>`).join("");
}
