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
    dots: [[50, 50], [31, 33], [69, 33], [37, 68], [63, 68], [45, 23], [55, 23]],
    path:
      "M50,50 C38,12 11,42 50,50 " + // upper-left wing loop
      "M50,50 C62,12 89,42 50,50 " + // upper-right wing loop
      "M50,50 C49,86 16,62 50,50 " + // lower-left wing loop
      "M50,50 C51,86 84,62 50,50 " + // lower-right wing loop
      "M50,47 L45,23 M50,47 L55,23", // antennae V
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
];

// Pick one shape at random from the library (only these three).
export function randomShape(): ConstellationShape {
  return SHAPE_LIBRARY[Math.floor(Math.random() * SHAPE_LIBRARY.length)];
}
