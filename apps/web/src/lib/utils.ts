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

export function isEmptyOrNullObject(
  obj: Record<string, unknown> | undefined
): boolean {
  return obj == null || Object.keys(obj).length === 0
}

/**
 * Returns true if the value is null or undefined, false otherwise. This is preferable over 
 * checking for falsy values, as it doesn't consider other falsy values like 0 or 
 * empty strings as null or undefined.
 *
 * @param value - The value to check.
 * @returns True if the value is null or undefined, false otherwise.
 */
export function isNullOrUndefined(value: unknown): boolean {
  return value === null || value === undefined
}