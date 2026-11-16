import type { FastifyInstance, FastifyReply } from "fastify";
import type ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import {
  classifySize,
  sawnVolumeM3,
  stockImportApplySchema,
  stockImportPreviewSchema,
  stockMovementCreateSchema,
  type Permission,
  type StockMovementKind,
} from "@ste/shared";
import { prisma } from "../prisma.js";
import { userHas } from "../permissions.js";
import { parcStock, stockSummary } from "../stock.js";
import { stockLedger, stockRows } from "../stock-ledger.js";
import { stockWorkbook, suiviWorkbook } from "../stock-excel.js";
import {
  movementLines,
  parseStockWorkbook,
  type StockImportLine,
} from "../imports/stock-import.js";

// Stock général — tous contrats confondus. `?contractId=` ne sert qu'au
// résumé par contrat (fiche contrat). La page Stock lit le journal : dernier
// inventaire + sciage + resciage − empotage − sorties saisies.
type Q = { Querystring: { contractId?: string } };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_XLSX = 6 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

const movementInclude = { lines: { orderBy: { position: "asc" as const } } };
type MovementWithLines = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

function serializeMovement(m: MovementWithLines) {
  const { userId: _u, ...rest } = m;
  return {
    ...rest,
    totalM3: m.lines.reduce((s, l) => s + Number(l.volumeM3), 0).toFixed(6),
    pieces: m.lines.reduce((s, l) => s + l.count, 0),
  };
}

/** Inventaire = remise à zéro du stock : réservé à « Modifier » ; sorties = « Saisir ». */
function permissionFor(kind: StockMovementKind, action: "write" | "delete"): Permission {
  if (kind === "INVENTAIRE") return "stock.edit";
  return action === "write" ? "stock.create" : "stock.delete";
}

async function deny(reply: FastifyReply, userId: string, permission: Permission) {
  if (await userHas(userId, permission)) return false;
  await reply.code(403).send({ error: "Permission insuffisante pour cette action", permission });
  return true;
}

function decodeXlsx(b64: string): Buffer | null {
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0 || buf.length > MAX_XLSX) return null;
  if (!ZIP_MAGIC.every((v, i) => buf[i] === v)) return null;
  return buf;
}

async function sendWorkbook(reply: FastifyReply, wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  return reply
    .type(XLSX_MIME)
    .header("Content-Disposition", `attachment; filename="${filename.replace(/[^\w.-]+/g, "-")}"`)
    .send(Buffer.from(buf));
}

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** Plusieurs feuilles → un seul mouvement : les mêmes pièces se cumulent. */
function mergeLines(lines: StockImportLine[]): StockImportLine[] {
  const m = new Map<string, StockImportLine>();
  for (const l of lines) {
    const key = `${Number(l.lengthFt)}x${Number(l.widthIn)}x${Number(l.thicknessIn)}:${l.quality}`;
    const acc = m.get(key);
    if (acc) acc.count += l.count;
    else m.set(key, { ...l });
  }
  return [...m.values()].filter((l) => l.count > 0);
}

export async function stockRoutes(app: FastifyInstance) {
  app.get<Q>("/stock/summary", async (req) => stockSummary(req.query.contractId));

  // Stock par dimension et qualité (page Stock, panier d'empotage).
  app.get("/stock/sawn-inventory", async () => stockRows());

  // Suivi par épaisseur : une ligne par mouvement depuis le dernier inventaire.
  app.get("/stock/ledger", async () => stockLedger());

  app.get<Q>("/stock/parc", async (req) => (await parcStock(req.query.contractId)).rows);

  // ── Inventaires et sorties saisis ──
  app.get("/stock/movements", async () => {
    const list = await prisma.stockMovement.findMany({
      orderBy: [{ movedAt: "desc" }, { createdAt: "desc" }],
      include: movementInclude,
    });
    return list.map(serializeMovement);
  });

  app.post("/stock/movements", async (req, reply) => {
    const parsed = stockMovementCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const d = parsed.data;
    if (await deny(reply, req.user.sub, permissionFor(d.kind, "write"))) return;

    const m = await prisma.stockMovement.create({
      data: {
        kind: d.kind,
        movedAt: d.movedAt,
        reference: d.reference || null,
        note: d.note || null,
        userId: req.user.sub,
        lines: {
          create: d.lines.map((l, i) => {
            const size = classifySize(Number(l.widthIn), Number(l.thicknessIn));
            return {
              position: i + 1,
              lengthFt: l.lengthFt,
              widthIn: l.widthIn,
              thicknessIn: l.thicknessIn,
              count: l.count,
              quality: l.quality ?? "B",
              sizeCode: size.code,
              sizeGroup: size.group,
              volumeM3: sawnVolumeM3(
                Number(l.lengthFt),
                Number(l.widthIn),
                Number(l.thicknessIn),
                l.count
              ).toFixed(6),
            };
          }),
        },
      },
      include: movementInclude,
    });
    return reply.code(201).send(serializeMovement(m));
  });

  app.delete<{ Params: { id: string } }>("/stock/movements/:id", async (req, reply) => {
    const m = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      select: { id: true, kind: true },
    });
    if (!m) return reply.code(404).send({ error: "Mouvement introuvable" });
    if (await deny(reply, req.user.sub, permissionFor(m.kind, "delete"))) return;
    try {
      await prisma.stockMovement.delete({ where: { id: m.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return reply.code(404).send({ error: "Mouvement introuvable" });
      }
      throw e;
    }
    return reply.code(204).send();
  });

  // ── Import d'un classeur au format STOCK ──
  const importOpts = { bodyLimit: 9 * 1024 * 1024 };

  app.post("/stock/import/preview", importOpts, async (req, reply) => {
    const parsed = stockImportPreviewSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const buf = decodeXlsx(parsed.data.fileBase64);
    if (!buf) return reply.code(400).send({ error: "Fichier attendu : classeur .xlsx (≤ 6 Mo)" });
    try {
      const sheets = await parseStockWorkbook(buf, parsed.data.kind);
      return { kind: parsed.data.kind, sheets: sheets.map(({ lines: _l, ...s }) => s) };
    } catch (e) {
      req.log.error(e);
      return reply.code(400).send({ error: "Classeur illisible" });
    }
  });

  app.post("/stock/import/apply", importOpts, async (req, reply) => {
    const parsed = stockImportApplySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const d = parsed.data;
    if (await deny(reply, req.user.sub, permissionFor(d.kind, "write"))) return;
    const buf = decodeXlsx(d.fileBase64);
    if (!buf) return reply.code(400).send({ error: "Fichier attendu : classeur .xlsx (≤ 6 Mo)" });

    let sheets;
    try {
      sheets = await parseStockWorkbook(buf, d.kind);
    } catch (e) {
      req.log.error(e);
      return reply.code(400).send({ error: "Classeur illisible" });
    }
    // Relu côté serveur : on n'applique que ce que l'aperçu a montré.
    const chosen = sheets.filter((s) => d.sheets.includes(s.name) && s.usable);
    if (chosen.length === 0) {
      return reply.code(400).send({ error: "Aucune feuille lisible parmi celles choisies" });
    }
    const lines = mergeLines(chosen.flatMap((s) => s.lines));
    if (lines.length === 0) return reply.code(400).send({ error: "Aucune pièce à enregistrer" });

    // Date : celle choisie, sinon celle du nom de la feuille, sinon aujourd'hui.
    const sheetDate = chosen.find((s) => s.date)?.date;
    const movedAt = d.movedAt ?? (sheetDate ? new Date(sheetDate) : undefined);
    const names = chosen.map((s) => s.name).join(", ");
    const m = await prisma.stockMovement.create({
      data: {
        kind: d.kind,
        movedAt,
        reference: d.reference || null,
        note: d.note || `Import ${d.filename} — ${names}`,
        sourceFile: d.filename,
        userId: req.user.sub,
        lines: { create: movementLines(lines) },
      },
      include: movementInclude,
    });
    return reply.code(201).send(serializeMovement(m));
  });

  // ── Exports au format des classeurs du client ──
  app.get("/stock/stock.xlsx", async (_req, reply) => {
    const now = new Date();
    return sendWorkbook(reply, stockWorkbook(await stockRows(), now), `STOCK DU ${stamp(now)}.xlsx`);
  });

  app.get("/stock/suivi.xlsx", async (_req, reply) => {
    const now = new Date();
    return sendWorkbook(
      reply,
      suiviWorkbook(await stockLedger()),
      `SUIVI SCIAGE PAR EPAISSEUR DU ${stamp(now)}.xlsx`
    );
  });
}
