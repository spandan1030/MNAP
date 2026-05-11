export type UserRole = 'admin' | 'staff'
export type MetalType = 'gold' | 'silver' | 'other'
export type EntryStatus = 'pending' | 'approved' | 'rejected' | 'edited'
export type PaymentMode = 'cash' | 'card' | 'upi' | 'phonepe' | 'cheque' | 'customer_credit' | 'advance_adjustment' | 'sip_adjustment'
export type ReceiptType = 'advance' | 'sip' | 'customer_credit' | 'repair'
export type ExpensePaymentType = 'cash' | 'bank_transfer'
export type DayStatus = 'open' | 'closed'

export interface Profile {
  id: string
  role: UserRole
  name: string
  created_at: string
}

export interface ItemMaster {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface DaySession {
  id: string
  date: string
  status: DayStatus
  register_a_opening: number
  register_b_opening: number
  register_a_closing: number | null
  register_b_closing: number | null
  opened_by: string
  closed_by: string | null
  opened_at: string
  closed_at: string | null
}

export interface SalesBill {
  id: string
  day_session_id: string
  bill_number: string
  customer_name: string
  customer_phone: string
  metal_type: MetalType
  purity: string | null
  party: string
  total_amount: number
  old_gold_weight: number | null
  old_gold_amount: number | null
  old_silver_weight: number | null
  old_silver_amount: number | null
  status: EntryStatus
  submitted_by: string
  submitted_at: string
  rejection_reason: string | null
  created_at: string
  line_items?: SalesLineItem[]
  payments?: SalesPayment[]
  submitter?: Profile
}

export interface SalesLineItem {
  id: string
  bill_id: string
  item_name: string
  weight: number | null
  amount: number
  metal_type: MetalType
  purity: string | null
  party: string
  order_in: boolean
}

export interface SalesPayment {
  id: string
  bill_id: string
  payment_mode: PaymentMode
  amount: number
  cheque_number: string | null
  reference_serial: string | null
}

export interface MoneyReceipt {
  id: string
  day_session_id: string
  receipt_type: ReceiptType
  serial_number: string | null
  customer_name: string
  repair_type: string | null
  weight: number | null
  amount: number
  old_gold_weight: number | null
  old_gold_amount: number | null
  old_silver_weight: number | null
  old_silver_amount: number | null
  payment_mode: 'cash' | 'card' | 'upi' | 'phonepe' | 'cheque' | 'advance_adjustment' | 'sip_adjustment' | null
  cheque_number: string | null
  reference_serial: string | null
  notes: string | null
  status: EntryStatus
  submitted_by: string
  submitted_at: string
  rejection_reason: string | null
  created_at: string
  submitter?: Profile
}

export interface Expense {
  id: string
  day_session_id: string
  description: string
  amount: number
  payment_type: ExpensePaymentType
  notes: string | null
  status: EntryStatus
  submitted_by: string
  submitted_at: string
  rejection_reason: string | null
  created_at: string
  submitter?: Profile
}

export interface OldGoldPurchase {
  id: string
  day_session_id: string
  customer_name: string
  customer_phone: string | null
  metal_type: 'gold' | 'silver'
  purity: string | null
  weight: number
  rate_per_gram: number | null
  total_amount: number
  payment_mode: 'cash' | 'bank_transfer'
  notes: string | null
  status: EntryStatus
  submitted_by: string
  submitted_at: string
  rejection_reason: string | null
  created_at: string
  submitter?: Profile
}

export interface DirectReceipt {
  id: string
  day_session_id: string
  customer_name: string
  customer_number: string | null
  amount: number
  payment_mode: string
  notes: string | null
  status: EntryStatus
  submitted_by: string
  submitted_at: string
  rejection_reason: string | null
  created_at: string
  submitter?: Profile
}

export interface ApprovalSaleItem {
  id: string
  sale_id: string
  item_name: string
  metal_type: MetalType
  purity: string | null
  party: string
  weight: number | null
  notes: string | null
}

export interface ApprovalSale {
  id: string
  day_session_id: string
  party_name: string
  transaction_type: 'sale' | 'approval' | 'approval_return' | 'stock_in'
  status: EntryStatus
  submitted_by: string
  submitted_at: string
  rejection_reason: string | null
  created_at: string
  approval_sale_items?: ApprovalSaleItem[]
  submitter?: Profile
}

export interface PartyPayment {
  id: string
  day_session_id: string
  party_name: string
  amount: number
  payment_mode: 'cash' | 'bank_transfer'
  notes: string | null
  status: EntryStatus
  submitted_by: string
  submitted_at: string
  rejection_reason: string | null
  created_at: string
  submitter?: Profile
}

export interface AuditLog {
  id: string
  table_name: string
  record_id: string
  field_name: string
  original_value: string | null
  edited_value: string | null
  edited_by: string
  edited_at: string
  edit_reason: string | null
  editor?: Profile
}
