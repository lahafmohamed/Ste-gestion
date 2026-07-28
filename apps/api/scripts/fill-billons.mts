// Complète un étalage girth avec les billons du classeur Excel (seed-data.json).
// N'écrase rien : les billons déjà saisis sont conservés (et comparés), seuls
// les manquants sont ajoutés, dans l'ordre de la feuille GIRTH.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { volumeGirthM3, billParent } from "@ste/shared";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const data: { girth: { length: number; circ: number; numLog: string | null }[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../prisma/seed-data.json", import.meta.url)), "utf8")
);

const m = await prisma.logMeasurement.findFirst({
  where: { context: "YARD_GIRTH" },
  include: { logs: { orderBy: { position: "asc" } }, truck: { select: { registration: true } } },
  orderBy: { createdAt: "asc" },
});
if (!m) throw new Error("Aucun étalage girth en base");

const existing = new Map(m.logs.filter((l) => l.externalId).map((l) => [l.externalId!, l]));
console.log(`Étalage ${m.id} — ${m.truck.registration} — ${m.logs.length} billons déjà saisis`);

// Contrôle des billons déjà saisis vs Excel (aucune écriture dessus).
for (const g of data.girth) {
  const cur = existing.get(g.numLog ?? "");
  if (!cur) continue;
  const same = Number(cur.lengthM) === g.length && Number(cur.circumferenceCm) === g.circ;
  if (!same) {
    console.log(
      `  ≠ ${g.numLog} : base ${cur.lengthM}m/${cur.circumferenceCm}cm · Excel ${g.length}m/${g.circ}cm (conservé tel quel)`
    );
  }
}

const missing = data.girth.filter((g) => !g.numLog || !existing.has(g.numLog));
let position = m.logs.reduce((max, l) => Math.max(max, l.position), 0);
const rows = missing.map((g) => ({
  measurementId: m.id,
  position: ++position,
  externalId: g.numLog,
  lengthM: g.length.toFixed(3),
  circumferenceCm: g.circ.toFixed(2),
  volumeM3: volumeGirthM3(g.length, g.circ).toFixed(6),
}));

const addedM3 = rows.reduce((s, r) => s + Number(r.volumeM3), 0);
const totalM3 = m.logs.reduce((s, l) => s + Number(l.volumeM3), 0) + addedM3;
const bills = new Set(
  [...m.logs.map((l) => l.externalId), ...rows.map((r) => r.externalId)]
    .map((id) => billParent(id))
    .filter(Boolean)
);
console.log(`À ajouter : ${rows.length} billons (${addedM3.toFixed(6)} m³)`);
console.log(`Après : ${m.logs.length + rows.length} billons · ${bills.size} billes · ${totalM3.toFixed(6)} m³`);

if (!APPLY) {
  console.log("\n(dry-run — relancer avec --apply pour écrire)");
} else {
  await prisma.log.createMany({ data: rows });
  console.log("\n✓ écrit en base");
}
await prisma.$disconnect();
