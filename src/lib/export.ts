// ─── ייצוא דוחות ל-Excel (.xlsx) ─────────────────────────────────────────────
// מקור יחיד לבניית קובץ אקסל RTL בעברית. נקרא מ-/api/export.

import ExcelJS from 'exceljs'

export interface ExportColumn {
  header: string
  key:    string
  width?: number
}

// Supabase join ל-"אחד" עשוי לחזור כאובייקט או כמערך — מנרמל לאובייקט יחיד.
export function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined)
}

export function fmtDate(d?: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('he-IL')
}

export async function buildXlsx(
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] })

  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 20 }))

  const header = ws.getRow(1)
  header.font = { bold: true }
  header.alignment = { horizontal: 'right' }

  rows.forEach(r => ws.addRow(r))

  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
