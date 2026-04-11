export function normalizeTenant(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
}
