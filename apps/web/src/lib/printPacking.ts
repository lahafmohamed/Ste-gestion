import type { ContainerDTO } from "@ste/shared";
import { containerPieceCount, containerTotalM3 } from "@ste/shared";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });
const n = (v: string | number) => nf.format(Number(v));
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Packing list conteneur imprimable (format du document EMPOTAGES réel).
// Ouvre une fenêtre autonome et lance l'impression → « Enregistrer en PDF ».
export function printContainerPackingList(
  c: ContainerDTO,
  opts: { contractCode?: string; truckRegistrations?: string[] } = {}
): void {
  const rows = c.items
    .map(
      (it) => `<tr>
        <td>${it.position}</td>
        <td>${n(it.lengthFt)}</td>
        <td>${n(it.widthIn)}</td>
        <td>${n(it.thicknessIn)}</td>
        <td class="r">${it.count}</td>
        <td>${esc(it.sizeCode)}</td>
        <td class="r">${n(it.volumeM3)}</td>
      </tr>`
    )
    .join("");

  const meta = [
    ["N° conteneur", c.containerNo],
    ["Grade", c.grade],
    ["N° plomb", c.sealNo],
    ["Faux plomb", c.fauxSealNo],
    ["Booking", c.bookingNo],
    ["Destination", c.destination],
    ["Contrat", opts.contractCode],
    ["Camions d'origine", opts.truckRegistrations?.join(", ")],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span>${k}</span><strong>${esc(String(v))}</strong></div>`)
    .join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <title>Packing list ${esc(c.containerNo)}</title>
  <style>
    * { font-family: Arial, sans-serif; }
    body { margin: 24px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; font-size: 12px; }
    .meta span { color: #666; display: inline-block; min-width: 130px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
    th { background: #eee; }
    td.r, th.r { text-align: right; }
    tfoot td { font-weight: bold; background: #f4f4f4; }
    .foot { margin-top: 24px; font-size: 11px; color: #666; display: flex; justify-content: space-between; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <h1>PACKING LIST — EMPOTAGE TECK</h1>
    <div class="sub">S.T.E — Gestion scierie</div>
    <div class="meta">${meta}</div>
    <table>
      <thead><tr>
        <th>N°</th><th>Long (ft)</th><th>Larg (in)</th><th>Épais (in)</th>
        <th class="r">Nbr</th><th>Taille</th><th class="r">Volume m³</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4">Total</td>
        <td class="r">${containerPieceCount(c)}</td>
        <td></td>
        <td class="r">${n(containerTotalM3(c).toFixed(6))}</td>
      </tr></tfoot>
    </table>
    <div class="foot"><span>Nbre éléments : ${containerPieceCount(c)}</span><span>Signature / visa :</span></div>
    <script>window.onload = function(){ window.print(); };</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
