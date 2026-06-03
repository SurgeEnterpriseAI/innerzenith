// dotit categories — Stage 07 home figures + Stage 7.5 context slices.

export type CategoryKey =
  | "career"
  | "relationships"
  | "property"
  | "health"
  | "money"
  | "purpose"
  | "surprise";

export type Category = {
  key: CategoryKey;
  title: string;     // session title
  short: string;     // History short-form
  label: string;     // tiny label under the figure
};

export const CATEGORIES: Category[] = [
  { key: "career", title: "Career & Purpose", short: "C&P", label: "career & purpose" },
  { key: "relationships", title: "Relationships", short: "REL", label: "relationships" },
  { key: "property", title: "Property & Stability", short: "P&S", label: "property & stability" },
  { key: "health", title: "Health", short: "HLT", label: "health" },
  { key: "money", title: "Money & Abundance", short: "M&A", label: "money & abundance" },
  { key: "purpose", title: "Life Purpose", short: "LP", label: "life purpose" },
  { key: "surprise", title: "Surprise Me", short: "SUR", label: "surprise me" },
];

export function categoryByKey(key: string): Category | undefined {
  return CATEGORIES.find((c) => c.key === key);
}
