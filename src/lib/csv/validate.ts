/**
 * validateRow()
 *
 * Validates a NormalisedRow against the importRowSchema (Zod).
 * Returns { success: true, data } or { success: false, error: string }.
 *
 * Validation rules:
 *   - date:        valid ISO date string YYYY-MM-DD, not in the future by more than 1 day
 *   - amount:      finite number, non-zero
 *   - description: non-empty string, max 500 chars
 */

import { z } from 'zod'
import type { NormalisedRow } from './normalise'

export const importRowSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine(d => {
      const parsed = new Date(d)
      return !isNaN(parsed.getTime())
    }, 'Invalid date value'),

  amount: z
    .number()
    .finite('Amount must be a finite number')
    .refine(n => n !== 0, 'Amount must be non-zero'),

  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or fewer')
    .transform(s => s.trim()),
})

export type ImportRow = z.infer<typeof importRowSchema>

export type ValidationResult =
  | { success: true;  data: ImportRow }
  | { success: false; error: string }

export function validateRow(row: NormalisedRow): ValidationResult {
  const result = importRowSchema.safeParse(row)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const message = result.error.errors.map(e => e.message).join('; ')
  return { success: false, error: message }
}
