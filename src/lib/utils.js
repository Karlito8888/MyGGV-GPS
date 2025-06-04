import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

/**
 * Combine clsx et twMerge pour des classes Tailwind optimisées
 * @param {import("clsx").ClassValue[]} inputs
 * @returns {string}
 */

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
