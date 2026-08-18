export const UNDO_MS = 8000;

export function archiveLabel(n: number): string {
  return n === 1 ? "Archived" : `Archived ${n}`;
}

export function flagLabel(n: number, on: boolean): string {
  if (n === 1) return on ? "Flagged" : "Unflagged";
  return on ? `Flagged ${n}` : `Unflagged ${n}`;
}
