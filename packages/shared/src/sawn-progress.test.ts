import { describe, expect, it } from "vitest";
import { truckSawnProgress, type LogDTO, type MeasurementDTO } from "./index.js";

// Avancement débitage : billons girth du camion × logIds des sessions.

const log = (id: string, externalId: string): LogDTO => ({
  id,
  position: 1,
  externalId,
  lengthM: "2.000",
  lengthFt: null,
  diameterIn: null,
  circumferenceCm: "120.00",
  volumeM3: "0.180000",
  cft: null,
});

const girth = (logs: LogDTO[]): MeasurementDTO => ({
  id: "m1",
  truckId: "t1",
  context: "YARD_GIRTH",
  measuredAt: "",
  logs,
});

const truck = (logs: LogDTO[]) => ({ id: "t1", measurements: [girth(logs)] });

describe("truckSawnProgress", () => {
  const billons = [log("l1", "266A"), log("l2", "266B"), log("l3", "267A")];

  it("camion jamais scié", () => {
    const p = truckSawnProgress(truck(billons), []);
    expect(p).toMatchObject({ total: 3, sawn: 0, started: false, complete: false });
    expect(p.remaining).toHaveLength(3);
  });

  it("session partielle : compte les billons sciés, liste le reste", () => {
    const p = truckSawnProgress(truck(billons), [{ truckIds: ["t1"], logIds: ["l1", "l3"] }]);
    expect(p).toMatchObject({ total: 3, sawn: 2, started: true, complete: false });
    expect(p.remaining.map((l) => l.externalId)).toEqual(["266B"]);
  });

  it("plusieurs sessions cumulent jusqu'à complet", () => {
    const p = truckSawnProgress(truck(billons), [
      { truckIds: ["t1"], logIds: ["l1", "l3"] },
      { truckIds: ["t1"], logIds: ["l2"] },
    ]);
    expect(p).toMatchObject({ total: 3, sawn: 3, complete: true });
    expect(p.remaining).toHaveLength(0);
  });

  it("session camion entier (logIds vides) = tout scié", () => {
    const p = truckSawnProgress(truck(billons), [{ truckIds: ["t1"], logIds: [] }]);
    expect(p).toMatchObject({ total: 3, sawn: 3, started: true, complete: true });
    expect(p.remaining).toHaveLength(0);
  });

  it("sessions d'autres camions ignorées, sauf leurs logIds sur nos billons", () => {
    // Session liée à t2 seulement mais qui référence un billon de t1
    // (saisie main/API) : le billon compte scié → camion considéré entamé.
    const p = truckSawnProgress(truck(billons), [{ truckIds: ["t2"], logIds: ["l1"] }]);
    expect(p).toMatchObject({ total: 3, sawn: 1, started: true, complete: false });
  });

  it("camion sans étalage girth : complet seulement si session camion entier", () => {
    const none = truckSawnProgress(truck([]), []);
    expect(none).toMatchObject({ total: 0, sawn: 0, started: false, complete: false });
    const whole = truckSawnProgress(truck([]), [{ truckIds: ["t1"], logIds: [] }]);
    expect(whole).toMatchObject({ total: 0, started: true, complete: true });
  });
});
