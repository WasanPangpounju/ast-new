// ลายผ้าที่อนุญาตให้แสดงตอนพิมพ์ใบส่งสินค้า — เพิ่ม/ลบได้ที่นี่ที่เดียว
export const PRINTABLE_FABRIC_PATTERNS = ["1/1", "2/1", "3/1", "2/2", "4/1", "OXFORD"];

// ตัดส่วนขยายออก ("3/1 เฉียงซ้าย" → "3/1", "OXFORD # (ใส่ลูกเบี้ยว 2/2)" → "OXFORD")
// แล้วเทียบกับ whitelist แบบไม่สนตัวพิมพ์ — ไม่ตรงคืน ""
// ดูเฉพาะคำแรกของค่า เพราะค่า OXFORD มี "2/2" อยู่ในวงเล็บต่อท้าย
export function toPrintableFabricPattern(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.trim().toUpperCase();
  const ratio = /^0*(\d+)\s*\/\s*0*(\d+)/.exec(s);
  const head = ratio ? `${ratio[1]}/${ratio[2]}` : (/^[A-Z]+/.exec(s)?.[0] ?? "");
  return PRINTABLE_FABRIC_PATTERNS.find((p) => p.toUpperCase() === head) ?? "";
}
