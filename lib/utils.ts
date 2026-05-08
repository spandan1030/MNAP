import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatWeight(grams: number): string {
  return `${grams.toFixed(3)}g`
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(iso))
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso))
}

export const PURITY_OPTIONS: Record<string, string[]> = {
  gold: ['18K', '22K', '24K', 'Diamond'],
  silver: ['75', '925'],
  other: [],
}

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  phonepe: 'PhonePe',
  cheque: 'Cheque',
  bank_transfer: 'Bank Transfer',
  customer_credit: 'Customer Credit',
  advance_adjustment: 'Advance Adjustment',
  sip_adjustment: 'SIP Adjustment',
}

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  edited: 'bg-blue-100 text-blue-800',
}
