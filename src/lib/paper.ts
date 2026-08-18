export type PaperStock = "cream" | "newsprint" | "sepia" | "night";

export const PAPER_STOCKS: { id: PaperStock; label: string }[] = [
  { id: "cream", label: "Cream" },
  { id: "newsprint", label: "Newsprint" },
  { id: "sepia", label: "Sepia" },
  { id: "night", label: "Night" },
];

const KEY = "bateleur.paper";
const KNOWN = new Set<PaperStock>(PAPER_STOCKS.map((stock) => stock.id));

export function paperInk(stock: PaperStock): "dark" | "light" {
  return stock === "night" ? "light" : "dark";
}

export function loadPaper(): PaperStock {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === "day") return "cream";
    if (raw && KNOWN.has(raw as PaperStock)) return raw as PaperStock;
  } catch {
    /* ignore quota / private mode */
  }
  return "cream";
}

export function savePaper(stock: PaperStock) {
  try {
    window.localStorage.setItem(KEY, stock);
  } catch {
    /* ignore quota / private mode */
  }
}
