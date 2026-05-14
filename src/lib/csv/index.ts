/**
 * CSV Parser — public API
 *
 * Re-exports all public functions and types from the csv module.
 * Import from here rather than individual sub-modules.
 */

export { detectBankFormat }               from './detect'
export { normaliseRow, parseDate }        from './normalise'
export { validateRow, importRowSchema }   from './validate'
export { detectDuplicate }               from './duplicate'
export { detectPaycheque }               from './paycheque'

export type { BankFormat, FormatSpec, AmountStructure } from './formats'
export type { NormalisedRow }                           from './normalise'
export type { ImportRow, ValidationResult }             from './validate'
export type { PaychequeResult, PaychequeMatch }         from './paycheque'
