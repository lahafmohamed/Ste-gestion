// Smoke E2E : vérifie que /contracts/:id/summary rend les chiffres Excel du
// camion réel (contrat A3-2026-014). Requiert l'API démarrée + base seedée.
//   node apps/api/scripts/smoke-summary.mjs
// Variables : API_URL (défaut http://localhost:3001), ADMIN_EMAIL, ADMIN_PASSWORD
// (sinon lus depuis apps/api/.env).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = process.env.API_URL ?? "http://localhost:3001";

function fromEnvFile(key) {
  try {
    const p = fileURLToPath(new URL("../.env", import.meta.url));
    const line = readFileSync(p, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).replace(/^"|"$/g, "") : undefined;
  } catch {
    return undefined;
  }
}

const email = process.env.ADMIN_EMAIL ?? fromEnvFile("ADMIN_EMAIL") ?? "admin@local";
const password = process.env.ADMIN_PASSWORD ?? fromEnvFile("ADMIN_PASSWORD") ?? "admin123";

let failures = 0;
function check(label, actual, expected, tol = 0.01) {
  const ok =
    typeof expected === "number" ? Math.abs(Number(actual) - expected) <= tol : actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${label} = ${actual}${ok ? "" : ` (attendu ${expected})`}`);
  if (!ok) failures++;
}

async function main() {
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login HTTP ${login.status} — API démarrée ? mot de passe correct ?`);
  const { token } = await login.json();
  const auth = { Authorization: `Bearer ${token}` };

  const contracts = await (await fetch(`${API}/contracts`, { headers: auth })).json();
  const c = contracts.find((x) => x.code === "A3-2026-014");
  if (!c) throw new Error("Contrat A3-2026-014 introuvable — base seedée ? (pnpm prisma:seed)");

  const s = await (await fetch(`${API}/contracts/${c.id}/summary`, { headers: auth })).json();

  check("trucksEntered", s.trucksEntered, 1);
  check("trucksSawn", s.trucksSawn, 1);
  check("girthM3", s.girthM3, 28.865, 0.01);
  check("diaM3", s.diaM3, 27.294, 0.01);
  check("declaredFieldM3", s.declaredFieldM3, 33.171, 0.01);
  check("brousseM3 (→ quota)", s.brousseM3, 33.171, 0.01);
  check("quotaUsedPct (brousse/1000)", s.quotaUsedPct, 3.3171, 0.01);
  check("debitedM3", s.debitedM3, 15.9257, 0.01);
  check("outputPct (rendement/billons)", s.outputPct, 55.17, 0.1);
  check("billonCount (girth)", s.billonCount, 275);
  check("billeCount (étalage Ø)", s.billeCount, 60);

  if (failures > 0) {
    console.error(`\n✗ ${failures} vérification(s) en échec`);
    process.exit(1);
  }
  console.log("\n✓ Smoke summary OK — chiffres Excel confirmés de bout en bout");
}

main().catch((e) => {
  console.error("Erreur:", e.message);
  process.exit(1);
});
