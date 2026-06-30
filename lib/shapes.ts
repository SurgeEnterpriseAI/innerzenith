// The "dot shape library" for the §13.6 forming / loading screens (Pankhuri,
// 2026-06-30). Every wait-for-calculation screen picks ONE shape at random from
// this library and loops its draw animation (dots → connect into the figure →
// reset to dots → redraw) until the calculation lands. "Not general random" —
// only these curated figures. Each has exactly seven dots, in a 100×100 viewBox,
// plus a path of smooth curves that draws the figure (pathLength-normalised so a
// single stroke-dashoffset sweep reveals it).

export type ConstellationShape = {
  name: string;
  dots: [number, number][];
  path: string;
};

export const SHAPE_LIBRARY: ConstellationShape[] = [
  {
    name: "butterfly",
    dots: [[50, 48], [12, 34], [88, 34], [32, 80], [68, 80], [44, 14], [56, 14]],
    path:
      "M50,48 C38,16 10,20 12,34 C13,43 36,46 50,48 " + // upper-left wing (large)
      "M50,48 C62,16 90,20 88,34 C87,43 64,46 50,48 " + // upper-right wing (large)
      "M50,48 C42,60 26,74 32,80 C38,84 48,62 50,48 " + // lower-left wing (small)
      "M50,48 C58,60 74,74 68,80 C62,84 52,62 50,48 " + // lower-right wing (small)
      "M50,50 C46,34 45,22 44,14 M50,50 C54,34 55,22 56,14 " + // antennae
      "M50,50 L50,64", // body
  },
  {
    name: "crown",
    dots: [[24, 58], [33, 36], [42, 47], [50, 30], [58, 47], [67, 36], [76, 58]],
    path:
      "M24,58 Q29,41 33,36 Q39,43 42,47 Q47,34 50,30 Q53,34 58,47 Q61,43 67,36 Q71,41 76,58 " +
      "M24,58 Q50,65 76,58", // base
  },
  {
    name: "bird",
    dots: [[26, 58], [48, 52], [66, 46], [42, 40], [34, 24], [58, 40], [72, 26]],
    path:
      "M26,58 Q37,55 48,52 Q57,49 66,46 " + // body: tail -> head
      "M48,52 Q44,46 42,40 Q37,31 34,24 " + // near wing sweeping up
      "M48,52 Q53,46 58,40 Q65,33 72,26", // far wing sweeping up
  },
  {
    name: "lotus",
    dots: [[50, 12], [32, 26], [68, 26], [12, 52], [88, 52], [34, 70], [66, 70]],
    path:
      "M50,70 C44,46 46,24 50,12 C54,24 56,46 50,70 " + // center petal
      "M50,70 C36,52 28,34 32,26 C40,30 46,50 50,70 " + // inner-left petal
      "M50,70 C64,52 72,34 68,26 C60,30 54,50 50,70 " + // inner-right petal
      "M50,70 C30,64 14,56 12,52 C18,46 40,58 50,70 " + // outer-left petal
      "M50,70 C70,64 86,56 88,52 C82,46 60,58 50,70 " + // outer-right petal
      "M34,70 Q50,77 66,70", // base
  },
];

// Pick one shape at random from the library (only these three).
export function randomShape(): ConstellationShape {
  return SHAPE_LIBRARY[Math.floor(Math.random() * SHAPE_LIBRARY.length)];
}
