export const INDUSTRIES = [
  "Construction",
  "Architecture",
  "Urban Development",
  "Infrastructure",
  "Engineering",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];
