import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Simple utility for combining Tailwind CSS classes
// The 'cn' name is a common convention in the React community for className utilities
// This merges clsx (for conditional classes) with tailwind-merge (for conflicting class resolution)
export function cn(...classInputs: ClassValue[]) {
  return twMerge(clsx(classInputs))
}
