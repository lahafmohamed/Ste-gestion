import type { FastifyInstance } from "fastify";
import { importApplySchema, importPreviewSchema } from "@ste/shared";
import { getCachedUser, permissionsFor } from "../permissions.js";
import { applyImport, listImportBatches, previewImport } from "../imports/service.js";

// Import des classeurs Excel du terrain. Le fichier voyage en base64 dans le
// JSON (classeurs de quelques dizaines de Ko ; limite 8 Mo sur ces routes).
// Les permissions se vérifient feuille par feuille dans le service, selon le
// type détecté (étalage, débitage, empotage) et la création éventuelle d'un
// camion.

const MAX_XLSX = 6 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function decodeXlsx(b64: string): Buffer | null {
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0 || buf.length > MAX_XLSX) return null;
  if (!ZIP_MAGIC.every((v, i) => buf[i] === v)) return null;
  return buf;
}

export async function importRoutes(app: FastifyInstance) {
  const opts = { bodyLimit: 9 * 1024 * 1024 };

  app.post("/imports/preview", opts, async (req, reply) => {
    const parsed = importPreviewSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const buf = decodeXlsx(parsed.data.fileBase64);
    if (!buf) return reply.code(400).send({ error: "Fichier attendu : classeur .xlsx (≤ 6 Mo)" });
    const u = await getCachedUser(req.user.sub);
    if (!u) return reply.code(401).send({ error: "Session invalide" });
    try {
      return await previewImport(
        parsed.data.contractId,
        parsed.data.filename,
        buf,
        await permissionsFor(u),
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status) return reply.code(status).send({ error: (e as Error).message });
      req.log.error(e);
      return reply.code(400).send({ error: "Classeur illisible" });
    }
  });

  app.post("/imports/apply", opts, async (req, reply) => {
    const parsed = importApplySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const buf = decodeXlsx(parsed.data.fileBase64);
    if (!buf) return reply.code(400).send({ error: "Fichier attendu : classeur .xlsx (≤ 6 Mo)" });
    const u = await getCachedUser(req.user.sub);
    if (!u) return reply.code(401).send({ error: "Session invalide" });
    try {
      const res = await applyImport(
        parsed.data.contractId,
        parsed.data.filename,
        buf,
        parsed.data.sheets,
        await permissionsFor(u),
        u.id,
      );
      return reply.code(201).send(res);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status) return reply.code(status).send({ error: (e as Error).message });
      throw e;
    }
  });

  // Journal des classeurs déjà enregistrés sur le contrat (lecture partagée).
  app.get("/imports/history", async (req, reply) => {
    const q = req.query as { contractId?: string; limit?: string };
    if (!q.contractId) return reply.code(400).send({ error: "contractId requis" });
    const limit = Math.min(Math.max(Number(q.limit) || 30, 1), 100);
    return listImportBatches(q.contractId, limit);
  });
}
