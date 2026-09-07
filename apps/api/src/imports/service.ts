import type { Prisma } from "@prisma/client";
import {
  M3_TO_CFT,
  classifySize,
  plateKey,
  sawnVolumeM3,
  volumeDiameterM3,
  volumeGirthM3,
  type ImportAppliedSheet,
  type ImportApplyDTO,
  type ImportIssue,
  type ImportLine,
  type ImportPreviewDTO,
  type ImportSheetPreview,
  type Permission,
} from "@ste/shared";
import { prisma } from "../prisma.js";
import { resolveVehicle } from "../vehicles.js";
import { parseWorkbook, type ParsedSheet, type RawRow } from "./parse.js";

// ── Aperçu : ce que l'import ferait, sans rien écrire ───────────────────
// Choix (2026-09-04) : camion absent → créé depuis la marge du classeur ;
// volumes toujours recalculés par l'app, écart avec l'Excel signalé ;
// doublon (relevé du même type, session du même jour, n° conteneur) → refusé,
// à corriger dans l'app avant de réimporter.

const PERMISSION_BY_TYPE: Record<string, Permission> = {
  YARD_DIAMETER: "etalage.create",
  YARD_GIRTH: "etalage.create",
  SAWN: "debitage.create",
  CONTAINER: "empotage.create",
  UNKNOWN: "contracts.view",
};

type TruckRow = {
  id: string;
  registration: string;
  deliveryNote: string | null;
  arrivedAt: Date;
  measurements: { id: string; context: string; logs: { externalId: string | null }[] }[];
  productionRuns: { run: { producedAt: Date } }[];
};

function dec(n: number, digits = 6): string {
  return n.toFixed(digits);
}

function computeLines(sheet: ParsedSheet): ImportLine[] {
  return sheet.rows.map((r: RawRow) => {
    let vol = 0;
    if (sheet.type === "YARD_DIAMETER") vol = volumeDiameterM3(r.a, r.b);
    else if (sheet.type === "YARD_GIRTH") vol = volumeGirthM3(r.a, r.b);
    else vol = sawnVolumeM3(r.a, r.b, r.c ?? 0, r.count ?? 1);
    return {
      n: r.n,
      id: r.id,
      a: String(r.a),
      b: String(r.b),
      c: r.c !== undefined ? String(r.c) : undefined,
      count: r.count,
      grade: r.grade,
      page: r.page,
      volumeM3: dec(vol),
      excelM3: r.excelM3 !== undefined ? dec(r.excelM3) : undefined,
    };
  });
}

/** Camion du contrat visé par la feuille : B/L d'abord, immatriculation sinon. */
function matchTruck(
  sheet: ParsedSheet,
  trucks: TruckRow[],
  issues: ImportIssue[],
): TruckRow | null {
  const { deliveryNote, registration } = sheet.meta;
  if (deliveryNote) {
    const byBl = trucks.filter((t) => t.deliveryNote === deliveryNote);
    if (byBl.length === 1) return byBl[0];
    if (byBl.length > 1) {
      issues.push({
        level: "warning",
        message: `Plusieurs camions portent le B/L ${deliveryNote} : le plus récent est retenu`,
      });
      return byBl[0];
    }
  }
  if (registration) {
    const key = plateKey(registration);
    const byPlate = trucks.filter((t) => plateKey(t.registration) === key);
    if (byPlate.length === 1) {
      if (deliveryNote && byPlate[0].deliveryNote && byPlate[0].deliveryNote !== deliveryNote) {
        issues.push({
          level: "warning",
          message: `Camion ${byPlate[0].registration} retrouvé par l'immatriculation, mais son B/L (${byPlate[0].deliveryNote}) diffère du classeur (${deliveryNote})`,
        });
      }
      return byPlate[0];
    }
    if (byPlate.length > 1) {
      issues.push({
        level: "warning",
        message: `${byPlate.length} voyages du camion ${registration} sur ce contrat : le plus récent est retenu (préciser le B/L dans le classeur pour lever le doute)`,
      });
      return byPlate[0];
    }
  }
  return null;
}

function sumM3(lines: ImportLine[]): number {
  return lines.reduce((a, l) => a + Number(l.volumeM3), 0);
}

function pieceCount(sheet: ParsedSheet): number {
  return sheet.rows.reduce((a, r) => a + (r.count ?? 1), 0);
}

function compareTotals(lines: ImportLine[], sheet: ParsedSheet, issues: ImportIssue[]) {
  const pieces = sheet.meta.excelPieceCount;
  if (pieces !== undefined && pieces > 0 && pieces !== pieceCount(sheet)) {
    issues.push({
      level: "warning",
      message: `Pièces lues ${pieceCount(sheet)} ≠ « Nbre elm » du classeur ${pieces}`,
    });
  }
  const app = sumM3(lines);
  const excelLines = sheet.rows.reduce((a, r) => a + (r.excelM3 ?? 0), 0);
  const excel = sheet.meta.excelTotalM3 ? Number(sheet.meta.excelTotalM3) : excelLines;
  if (excel > 0 && Math.abs(app - excel) / excel > 0.005) {
    issues.push({
      level: "warning",
      message: `Volume recalculé ${app.toFixed(3)} m³ ≠ classeur ${excel.toFixed(3)} m³ (écart ${(((app - excel) / excel) * 100).toFixed(1)} %) — le volume de l'app fait foi`,
    });
  }
}

export async function previewImport(
  contractId: string,
  filename: string,
  buffer: Buffer,
  permissions: readonly string[],
): Promise<ImportPreviewDTO> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, code: true, status: true },
  });
  if (!contract) throw Object.assign(new Error("Contrat introuvable"), { status: 404 });

  const [sheets, trucks, containers] = await Promise.all([
    parseWorkbook(buffer),
    prisma.truck.findMany({
      where: { contractId },
      orderBy: { arrivedAt: "desc" },
      select: {
        id: true,
        registration: true,
        deliveryNote: true,
        arrivedAt: true,
        measurements: {
          select: { id: true, context: true, logs: { select: { externalId: true } } },
        },
        productionRuns: { select: { run: { select: { producedAt: true } } } },
      },
    }),
    prisma.container.findMany({ where: { contractId }, select: { containerNo: true } }),
  ]);

  // Billes Ø créées par une feuille du même classeur : un billon « 283A » d'une
  // feuille GIRTH peut s'appuyer dessus même si le camion n'existe pas encore.
  const fileBills = new Map<string, Set<string>>();
  // Camions que le classeur va créer (clé : immat normalisée) — une feuille
  // suivante du même fichier les retrouve au lieu d'en créer un second.
  const fileTrucks = new Set<string>();

  const out: ImportSheetPreview[] = [];
  const ordered = [...sheets].sort((a, b) => order(a) - order(b));
  for (const sheet of ordered) {
    const issues: ImportIssue[] = [...sheet.issues];
    const permission = PERMISSION_BY_TYPE[sheet.type];
    const hasPermission = permissions.includes(permission);
    let truck: TruckRow | null = null;
    let truckAction: ImportSheetPreview["truckAction"] = "none";
    const lines = sheet.type === "UNKNOWN" ? [] : computeLines(sheet);

    if (contract.status !== "OPEN") {
      issues.push({ level: "error", message: "Contrat clôturé — le rouvrir pour importer" });
    }
    if (!hasPermission && sheet.type !== "UNKNOWN") {
      issues.push({ level: "error", message: "Permission insuffisante pour ce type de feuille" });
    }
    if (sheet.meta.contractCode && sheet.meta.contractCode !== contract.code) {
      issues.push({
        level: "warning",
        message: `Le classeur mentionne le contrat ${sheet.meta.contractCode}, l'import vise ${contract.code}`,
      });
    }

    if (sheet.type === "YARD_DIAMETER" || sheet.type === "YARD_GIRTH" || sheet.type === "SAWN") {
      truck = matchTruck(sheet, trucks, issues);
      const plate = sheet.meta.registration ? plateKey(sheet.meta.registration) : "";
      if (truck) {
        truckAction = "match";
      } else if (plate && fileTrucks.has(plate)) {
        truckAction = "create";
        issues.push({
          level: "warning",
          message: `Camion ${sheet.meta.registration} : créé par une feuille précédente de ce classeur`,
        });
      } else if (sheet.meta.registration) {
        truckAction = "create";
        if (!permissions.includes("reception.create")) {
          issues.push({
            level: "error",
            message:
              "Camion inconnu : sa création demande la permission « Réceptionner un camion »",
          });
        } else {
          issues.push({
            level: "warning",
            message: `Camion ${sheet.meta.registration}${sheet.meta.deliveryNote ? ` (B/L ${sheet.meta.deliveryNote})` : ""} inconnu sur ${contract.code} : il sera réceptionné automatiquement${sheet.meta.declaredFieldM3 ? `, brousse déclaré ${sheet.meta.declaredFieldM3} m³` : ""}`,
          });
          fileTrucks.add(plate);
        }
      } else if (sheet.type !== "SAWN") {
        issues.push({
          level: "error",
          message:
            "Ni immatriculation (« CAMION … » en titre) ni B/L lisible : impossible de rattacher la feuille à un camion",
        });
      } else {
        issues.push({
          level: "warning",
          message: "Aucun camion identifié : la session de débitage sera créée sans camion lié",
        });
      }
    }

    if (sheet.type === "YARD_DIAMETER" || sheet.type === "YARD_GIRTH") {
      if (truck && truck.measurements.some((m) => m.context === sheet.type)) {
        const m = truck.measurements.find((x) => x.context === sheet.type)!;
        issues.push({
          level: "error",
          message: `Ce camion a déjà un relevé ${sheet.type === "YARD_DIAMETER" ? "Ø" : "girth"} (${m.logs.length} lignes) : le supprimer dans l'app avant de réimporter`,
        });
      }
      const ids = lines.map((l) => l.id).filter((x): x is string => !!x);
      const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
      if (dup.length) {
        issues.push({
          level: "warning",
          message: `N° en double dans la feuille : ${[...new Set(dup)].slice(0, 8).join(", ")}${dup.length > 8 ? "…" : ""}`,
        });
      }
      if (ids.length < lines.length) {
        issues.push({
          level: "warning",
          message: `${lines.length - ids.length} ligne(s) sans n° de bille`,
        });
      }
      const key = truck?.id ?? (sheet.meta.registration ? plateKey(sheet.meta.registration) : "?");
      if (sheet.type === "YARD_DIAMETER") {
        fileBills.set(key, new Set(ids));
      } else {
        // Billon 283A → bille 283 connue (relevé Ø du camion, ou feuille Ø du classeur).
        const known = new Set<string>([
          ...(truck?.measurements
            .find((m) => m.context === "YARD_DIAMETER")
            ?.logs.map((l) => l.externalId ?? "") ?? []),
          ...(fileBills.get(key) ?? []),
        ]);
        if (known.size > 0) {
          const orphans = [...new Set(ids.map((x) => x.replace(/[A-Z]+$/i, "")))].filter(
            (b) => !known.has(b),
          );
          if (orphans.length) {
            issues.push({
              level: "warning",
              message: `${orphans.length} bille(s) mère(s) absentes du relevé Ø : ${orphans.slice(0, 8).join(", ")}${orphans.length > 8 ? "…" : ""}`,
            });
          }
        } else {
          issues.push({
            level: "warning",
            message: "Aucun relevé Ø connu pour ce camion : billons importés sans bille mère",
          });
        }
      }
    }

    if (sheet.type === "SAWN" && truck && sheet.meta.date) {
      const day = sheet.meta.date.slice(0, 10);
      if (truck.productionRuns.some((r) => r.run.producedAt.toISOString().slice(0, 10) === day)) {
        issues.push({
          level: "error",
          message: `Une session de débitage existe déjà le ${day} pour ce camion : la supprimer dans l'app avant de réimporter`,
        });
      }
    }

    if (sheet.type === "CONTAINER") {
      if (!sheet.meta.containerNo) {
        issues.push({
          level: "error",
          message: "N° de conteneur illisible (attendu « MRKU 684202/0 » dans le titre)",
        });
      } else if (
        containers.some(
          (c) => c.containerNo.replace(/\s/g, "") === sheet.meta.containerNo!.replace(/\s/g, ""),
        )
      ) {
        issues.push({
          level: "error",
          message: `Conteneur ${sheet.meta.containerNo} déjà présent sur ce contrat`,
        });
      }
    }

    if (lines.length) compareTotals(lines, sheet, issues);

    out.push({
      name: sheet.name,
      type: sheet.type,
      meta: sheet.meta,
      truck: truck
        ? { id: truck.id, registration: truck.registration, deliveryNote: truck.deliveryNote }
        : null,
      truckAction,
      lines,
      totalM3: dec(sumM3(lines), 3),
      pieceCount: pieceCount(sheet),
      issues,
      permission,
      hasPermission,
      canApply: sheet.type !== "UNKNOWN" && !issues.some((i) => i.level === "error"),
    });
  }
  return { filename, contract, sheets: out };
}

// Ø avant girth (les billons s'appuient sur les billes), puis débitage, empotage.
function order(s: ParsedSheet): number {
  return { YARD_DIAMETER: 0, YARD_GIRTH: 1, SAWN: 2, CONTAINER: 3, UNKNOWN: 9 }[s.type];
}

// ── Application ─────────────────────────────────────────────────────────
// L'aperçu est recalculé côté serveur (jamais confiance au client), puis
// chaque feuille cochée et applicable est créée avec les MÊMES calculs que
// les routes de saisie (volumes F1/F2/F3, classement F4).

export async function applyImport(
  contractId: string,
  filename: string,
  buffer: Buffer,
  wanted: string[],
  permissions: readonly string[],
): Promise<ImportApplyDTO> {
  const preview = await previewImport(contractId, filename, buffer, permissions);
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    select: { parcel: true, origin: true },
  });
  const applied: ImportAppliedSheet[] = [];
  const skipped: ImportApplyDTO["skipped"] = [];
  // Camions créés dans ce passage (clé immat normalisée) — partagés entre feuilles.
  const created = new Map<string, string>();

  for (const sheet of preview.sheets) {
    if (!wanted.includes(sheet.name)) continue;
    if (!sheet.canApply) {
      skipped.push({
        name: sheet.name,
        reason: sheet.issues.find((i) => i.level === "error")?.message ?? "Non applicable",
      });
      continue;
    }

    let truckId = sheet.truck?.id;
    let createdTruck = false;
    if (!truckId && sheet.truckAction === "create" && sheet.meta.registration) {
      const key = plateKey(sheet.meta.registration);
      truckId = created.get(key);
      if (!truckId) {
        const vehicle = await resolveVehicle(sheet.meta.registration);
        const t = await prisma.truck.create({
          data: {
            contractId,
            vehicleId: vehicle?.id ?? null,
            registration: vehicle?.registration ?? sheet.meta.registration,
            driver: vehicle?.driver,
            trailer: vehicle?.trailer,
            deliveryNote: sheet.meta.deliveryNote ?? null,
            declaredFieldM3: sheet.meta.declaredFieldM3 ?? null,
            arrivedAt: sheet.meta.date ? new Date(sheet.meta.date) : undefined,
            parcel: sheet.meta.parcel ?? contract.parcel,
            origin: sheet.meta.origin ?? contract.origin,
          },
          select: { id: true },
        });
        truckId = t.id;
        created.set(key, t.id);
        createdTruck = true;
      }
    }

    if (sheet.type === "YARD_DIAMETER" || sheet.type === "YARD_GIRTH") {
      if (!truckId) {
        skipped.push({ name: sheet.name, reason: "Camion introuvable" });
        continue;
      }
      const isDia = sheet.type === "YARD_DIAMETER";
      const logs: Prisma.LogCreateWithoutMeasurementInput[] = sheet.lines.map((l, i) => {
        const vol = Number(l.volumeM3);
        return isDia
          ? {
              position: i + 1,
              externalId: l.id,
              lengthFt: l.a,
              diameterIn: l.b,
              volumeM3: l.volumeM3,
              cft: (vol * M3_TO_CFT).toFixed(4),
            }
          : {
              position: i + 1,
              externalId: l.id,
              lengthM: l.a,
              circumferenceCm: l.b,
              volumeM3: l.volumeM3,
            };
      });
      const m = await prisma.logMeasurement.create({
        data: { truckId, context: sheet.type, logs: { create: logs } },
        select: { id: true },
      });
      applied.push({
        name: sheet.name,
        type: sheet.type,
        truckId,
        createdTruck,
        createdId: m.id,
        lines: logs.length,
      });
      continue;
    }

    if (sheet.type === "SAWN") {
      const lines = sheet.lines.map((l, i) => {
        const size = classifySize(Number(l.b), Number(l.c));
        return {
          position: i + 1,
          lengthFt: l.a,
          widthIn: l.b,
          thicknessIn: l.c!,
          count: l.count ?? 1,
          sizeCode: size.code,
          sizeGroup: size.group,
          volumeM3: l.volumeM3,
        };
      });
      const r = await prisma.productionRun.create({
        data: {
          contractId,
          producedAt: sheet.meta.date ? new Date(sheet.meta.date) : undefined,
          note: `Import ${filename} — ${sheet.name}`,
          lines: { create: lines },
          trucks: truckId ? { create: [{ truckId }] } : undefined,
        },
        select: { id: true },
      });
      applied.push({
        name: sheet.name,
        type: sheet.type,
        truckId,
        createdTruck,
        createdId: r.id,
        lines: lines.length,
      });
      continue;
    }

    if (sheet.type === "CONTAINER") {
      const items = sheet.lines.map((l, i) => {
        const size = classifySize(Number(l.b), Number(l.c));
        return {
          position: i + 1,
          lengthFt: l.a,
          widthIn: l.b,
          thicknessIn: l.c!,
          count: l.count ?? 1,
          sizeCode: size.code,
          sizeGroup: size.group,
          volumeM3: l.volumeM3,
        };
      });
      const loadedAt = sheet.meta.date ? new Date(sheet.meta.date) : new Date();
      const c = await prisma.container.create({
        data: {
          contractId,
          containerNo: sheet.meta.containerNo!,
          sealNo: sheet.meta.sealNo,
          grade: sheet.meta.grade,
          status: "LOADED",
          loadedAt,
          items: { create: items },
        },
        select: { id: true },
      });
      applied.push({ name: sheet.name, type: sheet.type, createdId: c.id, lines: items.length });
    }
  }
  return { applied, skipped };
}
