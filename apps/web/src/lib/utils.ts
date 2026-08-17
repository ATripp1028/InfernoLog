import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 *
 * `clsx` flattens the conditional/array/object forms; `twMerge` then resolves
 * conflicts within the same Tailwind property group, which is what makes a
 * `className` prop able to override a component's own defaults.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isEmptyOrNullObject(obj: Record<string, unknown> | undefined): boolean {
  return obj == null || Object.keys(obj).length === 0
}
