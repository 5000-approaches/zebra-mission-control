const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The PowerOffice MCP `forecast` tool only accepts dd-MM-yyyy (e.g. 15-05-2024). */
export function toDdMmYyyy(isoDate: string): string {
  const m = ISO_DATE.exec(isoDate);
  if (!m) throw new Error(`Expected yyyy-MM-dd, got "${isoDate}"`);
  const [, year, month, day] = m;
  return `${day}-${month}-${year}`;
}
