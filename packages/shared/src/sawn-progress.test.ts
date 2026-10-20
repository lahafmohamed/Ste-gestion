import { describe, expect, it } from "vitest";
import {
  runSawnGirthM3,
  sawnGirthByTruck,
  truckSawnProgress,
  type LogDTO,
  type MeasurementDTO,
} from "./index.js";

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

  it("session à deux camions : aucun billon de t1 coché = t1 scié en entier", () => {
    // Billons cochés pour t2 seulement : à la saisie, « aucun coché = camion
    // entier » vaut camion par camion — t1 est donc parti en entier.
    const p = truckSawnProgress(truck(billons), [{ truckIds: ["t1", "t2"], logIds: ["x9"] }]);
    expect(p).toMatchObject({ total: 3, sawn: 3, complete: true });
  });

  it("cubage scié = billons passés à la scie, pas tout le camion", () => {
    const p = truckSawnProgress(truck(billons), [{ truckIds: ["t1"], logIds: ["l1"] }]);
    expect(p.girthM3).toBeCloseTo(0.54, 6);
    expect(p.sawnGirthM3).toBeCloseTo(0.18, 6);
    const whole = truckSawnProgress(truck(billons), [{ truckIds: ["t1"], logIds: [] }]);
    expect(whole.sawnGirthM3).toBeCloseTo(0.54, 6);
  });
});

// Rendement F6 d'un camion entamé : débité ÷ billons sciés. Diviser par tous
// les billons du camion faisait tomber un camion à moitié scié à ~27 %.
describe("sawnGirthByTruck", () => {
  const logs = [
    { id: "a1", truckId: "A", volumeM3: "0.300000" },
    { id: "a2", truckId: "A", volumeM3: "0.200000" },
    { id: "b1", truckId: "B", volumeM3: "0.400000" },
    { id: "b2", truckId: "B", volumeM3: "0.100000" },
    { id: "c1", truckId: "C", volumeM3: "0.500000" },
  ];

  it("billons cochés seulement pour un camion entamé", () => {
    const m = sawnGirthByTruck(logs, [{ runId: "r1", truckId: "A" }], [{ runId: "r1", logId: "a1" }]);
    expect(m.get("A")).toBeCloseTo(0.3, 6);
    expect(m.has("B")).toBe(false);
  });

  it("session sans billon coché = camion entier", () => {
    const m = sawnGirthByTruck(logs, [{ runId: "r1", truckId: "B" }], []);
    expect(m.get("B")).toBeCloseTo(0.5, 6);
  });

  it("session à deux camions : billons cochés pour A, B pris en entier", () => {
    const m = sawnGirthByTruck(
      logs,
      [
        { runId: "r1", truckId: "A" },
        { runId: "r1", truckId: "B" },
      ],
      [{ runId: "r1", logId: "a2" }]
    );
    expect(m.get("A")).toBeCloseTo(0.2, 6);
    expect(m.get("B")).toBeCloseTo(0.5, 6);
    expect(m.has("C")).toBe(false);
  });

  it("sessions cumulées : billons de deux sessions, sans doublon", () => {
    const m = sawnGirthByTruck(
      logs,
      [
        { runId: "r1", truckId: "A" },
        { runId: "r2", truckId: "A" },
      ],
      [
        { runId: "r1", logId: "a1" },
        { runId: "r2", logId: "a1" },
        { runId: "r2", logId: "a2" },
      ]
    );
    expect(m.get("A")).toBeCloseTo(0.5, 6);
  });
});

describe("runSawnGirthM3", () => {
  const t1 = truck([log("l1", "266A"), log("l2", "266B")]);
  const t2 = { id: "t2", measurements: [girth([log("k1", "300A"), log("k2", "300B")])] };

  it("billons cochés, ou camion entier quand aucun des siens ne l'est", () => {
    expect(runSawnGirthM3([t1], ["l1"])).toBeCloseTo(0.18, 6);
    expect(runSawnGirthM3([t1], [])).toBeCloseTo(0.36, 6);
    // t1 : un billon coché ; t2 : aucun → entier.
    expect(runSawnGirthM3([t1, t2], ["l2"])).toBeCloseTo(0.18 + 0.36, 6);
  });
});
