import type { HTMLAttributes } from "react";
import type { SizeGroup } from "@ste/shared";

// Pastille statique (statut, écart, groupe de taille). Une seule gamme de
// teintes : fond -50 / texte -700 (slate : -100/-600, le -50 est invisible
// sur fond blanc).
export type BadgeTone = "emerald" | "amber" | "sky" | "violet" | "slate";

const TONE: Record<BadgeTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
  slate: "bg-slate-100 text-slate-600",
};

/** Teinte par groupe de taille débitée — partagé par toutes les vues sciage/stock. */
export const SIZE_GROUP_TONE: Record<SizeGroup, BadgeTone> = {
  MAIN: "sky",
  SIDE: "amber",
  ONE_INCH: "violet",
  OTHER: "slate",
};

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

export default function Badge({ tone = "slate", className = "", ...rest }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
