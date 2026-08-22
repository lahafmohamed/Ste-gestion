import type { HTMLAttributes } from "react";
import type { SizeGroup } from "@ste/shared";

// Pastille statique (statut, écart, groupe de taille). Une seule gamme de
// teintes : fond -50 / texte -700 (brand et accent : -100, le -50 est
// invisible sur fond blanc).
// info : seul ton froid conservé — stats sciage (longueurs, MS, « scié »,
// « à billonner »). Jusqu'à 5 badges cohabitent (SawnEntry) : la palette
// chaude seule ne suffit pas à les distinguer.
export type BadgeTone = "parc" | "amber" | "accent" | "brand" | "info";

const TONE: Record<BadgeTone, string> = {
  parc: "bg-parc-50 text-parc-700",
  amber: "bg-amber-50 text-amber-700",
  accent: "bg-accent-100 text-accent-700",
  brand: "bg-brand-100 text-brand-600",
  info: "bg-sky-50 text-sky-700",
};

/** Teinte par groupe de taille débitée — partagé par toutes les vues sciage/stock. */
export const SIZE_GROUP_TONE: Record<SizeGroup, BadgeTone> = {
  MAIN: "parc",
  SIDE: "amber",
  ONE_INCH: "accent",
  OTHER: "brand",
};

// md : pastilles de synthèse en tête de fiche (lisibles debout, tablette).
const SIZE = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
} as const;

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  size?: keyof typeof SIZE;
};

export default function Badge({ tone = "brand", size = "sm", className = "", ...rest }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${SIZE[size]} ${TONE[tone]}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
