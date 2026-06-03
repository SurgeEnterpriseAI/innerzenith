// Fixed constellation figures for the home sky map (Stage 7.2).
// Positions are the SAME for every user. The organic feel comes from
// irregular dot placement within each figure, not per-user randomisation.
//
// Coordinate space: a 100 x 178 portrait viewBox. Each figure has local
// dots (x,y in viewBox units) and edges (pairs of dot indices) forming
// the dashed constellation lines. `label` sits beneath the figure.

import type { CategoryKey } from "./categories";

export type Figure = {
  key: CategoryKey;
  labelX: number;
  labelY: number;
  dots: [number, number][];
  edges: [number, number][];
  big?: boolean;     // surprise me — single larger pulsing dot
};

export const FIGURES: Figure[] = [
  // Career & Purpose — top left — arrow-like (Sagitta)
  {
    key: "career",
    labelX: 24,
    labelY: 38,
    dots: [
      [10, 16], [18, 20], [26, 24], [34, 22], [30, 15], [34, 22], [31, 29],
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 6]],
  },
  // Relationships — top right — two clusters + bridge (Gemini)
  {
    key: "relationships",
    labelX: 76,
    labelY: 40,
    dots: [
      [66, 16], [70, 22], [68, 28], [82, 18], [86, 24], [84, 30],
    ],
    edges: [[0, 1], [1, 2], [3, 4], [4, 5], [1, 4]],
  },
  // Property & Stability — mid left — low wide roof-like (Corvus)
  {
    key: "property",
    labelX: 22,
    labelY: 90,
    dots: [
      [10, 76], [18, 70], [28, 72], [34, 78], [20, 80], [28, 72],
    ],
    edges: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 3]],
  },
  // Health — mid right — gentle crescent arc (Corona Borealis)
  {
    key: "health",
    labelX: 78,
    labelY: 90,
    dots: [
      [66, 80], [70, 73], [77, 70], [84, 73], [88, 80],
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  // Money & Abundance — lower left — tight jewel cluster + one elevated (Pleiades)
  {
    key: "money",
    labelX: 24,
    labelY: 142,
    dots: [
      [16, 128], [22, 126], [19, 132], [25, 131], [21, 119],
    ],
    edges: [[0, 1], [0, 2], [1, 3], [2, 3], [1, 4]],
  },
  // Life Purpose — lower right — wide complex spread w/ crossing lines (Ophiuchus)
  {
    key: "purpose",
    labelX: 76,
    labelY: 144,
    dots: [
      [66, 120], [74, 126], [82, 122], [88, 130], [72, 134], [80, 134], [76, 128],
    ],
    edges: [[0, 6], [6, 2], [1, 6], [6, 3], [4, 6], [6, 5]],
  },
  // Surprise Me — centre — single larger pulsing dot
  {
    key: "surprise",
    labelX: 50,
    labelY: 108,
    dots: [[50, 96]],
    edges: [],
    big: true,
  },
];
