export const INDUSTRIES = [
  "Architecture",
  "Urban Development",
  "Infrastructure",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];
