/** S5: إعادة ترتيب الشرائح بالسحب — منطق نقي منفصل عن DnD حتى يُختبر بلا DOM */
export function moveTo<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr
  const next = [...arr]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}
