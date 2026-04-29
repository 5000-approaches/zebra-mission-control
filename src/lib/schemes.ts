export type ColorScheme = {
  id: string;
  label: string;
  company: string;
  swatch: string; // preview color for toggle button
};

export const COLOR_SCHEMES: ColorScheme[] = [
  { id: "zebra-yellow", label: "Zebra Gold", company: "Zebra Consulting", swatch: "#FFC61A" },
  { id: "zebra-blue", label: "Zebra Blue", company: "Zebra Consulting", swatch: "#4d65ff" },
  { id: "cure", label: "Cure", company: "Cure", swatch: "#84CC16" },
  { id: "dinamo", label: "Dinamo", company: "Dinamo", swatch: "#4721fb" },
  { id: "stacc", label: "Stacc", company: "Stacc", swatch: "#14b8a6" },
  { id: "digr", label: "Digr", company: "Digr", swatch: "#c28951" },
  { id: "stack", label: "Stack", company: "Stack", swatch: "#E63946" },
  { id: "kravia", label: "Kravia", company: "Kravia", swatch: "#F26A50" },
];

export const DEFAULT_SCHEME = "zebra-yellow";
export const SCHEME_STORAGE_KEY = "zmc-scheme";

export type Mode = "light" | "dark";
export const DEFAULT_MODE: Mode = "light";
export const MODE_STORAGE_KEY = "zmc-mode";
