export function isEmptyOrNullObject(
  obj: Record<string, unknown> | undefined
): boolean {
  return obj == null || Object.keys(obj).length === 0
}
