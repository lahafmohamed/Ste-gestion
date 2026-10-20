// Bout d'une bille de teck, vu en coupe : cœur, cernes de croissance, aubier,
// écorce et fentes de séchage — avec le numéro peint au parc (266…), comme sur
// les billes étalées. C'est l'objet que l'application mesure toute la journée
// (Ø, circonférence) : il tient lieu d'illustration, sans photo empruntée.
//
// Dessin déterministe (graine fixe) : le même bois à chaque visite. Couleurs
// = palette Atelier (teck du logo, numéro en vert sève).

const TAU = Math.PI * 2;

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seeded(266);

// Forme commune à tous les cernes : une bille n'est jamais ronde, et ses
// cernes épousent la même ovalisation.
const PHASE = [rand() * TAU, rand() * TAU, rand() * TAU];

// Cœur décentré : le teck pousse plus d'un côté que de l'autre.
const PITH = { x: -26, y: 18 };
const HEART_R = 236; // limite duramen / aubier
const SAP_R = 262; // limite aubier / écorce
const BARK_R = 286;

function ring(r: number, noise: number, noisePhase: number, steps = 132): string {
  // Centre du cerne : glisse du cœur (décentré) vers le centre de l'écorce.
  const k = 1 - Math.min(r / BARK_R, 1);
  const cx = PITH.x * k;
  const cy = PITH.y * k;
  // Petits cernes : pas de festons (le cœur virait à l'engrenage).
  const n = noise * Math.min(1, r / 60);
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const rr =
      r +
      0.026 * r * (0.6 * Math.sin(2 * a + PHASE[0]) + 0.3 * Math.sin(3 * a + PHASE[1])) +
      0.01 * r * Math.sin(5 * a + PHASE[2]) +
      n * Math.sin(9 * a + noisePhase);
    d += `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}

// Cernes : larges au cœur (croissance juvénile rapide du teck), plus serrés
// ensuite ; un sur quatre environ plus marqué (bois d'été).
const RINGS: { d: string; w: number; o: number }[] = [];
for (let r = 9, i = 0; r < SAP_R - 6; i++) {
  const late = rand() < 0.28;
  RINGS.push({
    d: ring(r, 0.6 + rand() * 1.4, rand() * TAU),
    w: late ? 2.4 : 1.2,
    o: late ? 0.75 : 0.35 + rand() * 0.25,
  });
  r += (r < 70 ? 11 : 6) + rand() * 9;
}

// Gerces de cœur : fentes courtes et brisées qui partent du cœur (longues et
// droites, elles se lisaient comme les aiguilles d'une horloge).
const CHECKS = Array.from({ length: 3 }, (_, k) => {
  const a = (k / 3) * TAU + rand() * 1.2;
  const len = 38 + rand() * 52;
  const pts: string[] = [];
  for (let s = 0; s <= 5; s++) {
    const t = 0.12 + (s / 5) * 0.88;
    const jitter = s === 0 ? 0 : (rand() - 0.5) * 5;
    const x = PITH.x + Math.cos(a) * len * t - Math.sin(a) * jitter;
    const y = PITH.y + Math.sin(a) * len * t + Math.cos(a) * jitter;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
});

const BARK = ring(BARK_R, 2.6, 1.1, 180);
const SAP = ring(SAP_R, 1.2, 2.3);
const HEART = ring(HEART_R, 1, 0.4);

export default function LogEnd({
  number = "266",
  className = "",
}: {
  /** Numéro peint sur la bille (étalage). */
  number?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="-300 -300 600 600"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={BARK} className="fill-accent-950" />
      <path d={SAP} className="fill-accent-300" />
      <path d={HEART} className="fill-accent-500" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {RINGS.map((r, i) => (
          <path
            key={i}
            d={r.d}
            strokeWidth={r.w}
            strokeOpacity={r.o}
            className="stroke-accent-800"
          />
        ))}
        {CHECKS.map((d, i) => (
          <path key={i} d={d} strokeWidth={1.6} className="stroke-accent-950" strokeOpacity={0.55} />
        ))}
      </g>
      <circle cx={PITH.x} cy={PITH.y} r={4} className="fill-accent-900" />
      {/* Numéro de bille peint à l'étalage — vert sève, à la main. */}
      <text
        x={70}
        y={-58}
        transform="rotate(-11 70 -58)"
        textAnchor="middle"
        fontSize={56}
        fontWeight={800}
        letterSpacing={-1.5}
        className="fill-parc-400"
        fillOpacity={0.9}
      >
        {number}
      </text>
    </svg>
  );
}
