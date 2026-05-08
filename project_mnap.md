---
name: MNAP Project — Jewellery Store Management System
description: Full project context for M N Alankar Palace daily management system built with Next.js + Supabase + Vercel
type: project
originSessionId: d1c8cb31-9aec-41f2-9d2b-5be3beda6c7e
---
# M N Alankar Palace — Daily Management System

**Why:** Replace manual registers with a structured digital system for the jewellery store.
**How to apply:** Use this as the reference for all future feature additions, bug fixes, and deployment questions.

## Identifiers
- Store name: M N Alankar Palace
- Admin email: info@mnalankarpalace.com
- GitHub repo: https://github.com/spandan1030/MNAP.git
- Supabase URL: https://tqnirshwiqpwbqdcrgbr.supabase.co
- Project folder: C:\Users\spand\Desktop\Management Software\mnap
- Node.js version: v24.15.0

## Stack
- Next.js 15 (App Router, TypeScript)
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- Vercel (hosted, auto-deploys from GitHub main branch)
- jsPDF + jsPDF-AutoTable (PDF export)

## Roles
- Admin: full access — open/close day, QC, reports, item master
- Staff: single shared account — submit forms only, cannot edit or view reports
- Both accounts created manually by admin (no self-signup)

## Database (9 tables, all with RLS)
- profiles — extends auth.users, stores role + name
- item_master — dropdown list of jewellery items
- day_sessions — one per day, opening/closing balances
- sales_bills — Module A bills
- sales_line_items — child of sales_bills
- sales_payments — child of sales_bills
- money_receipts — Module B (advance/SIP/credit/repair)
- expenses — Module C
- audit_log — immutable, admin edits only

## Modules
- Module A (/staff/sales): Sales bills — line items, payment split, old metal exchange
- Module B (/staff/receipts): Money receipts — advance, SIP, customer credit, repair
- Module C (/staff/expenses): Expense entry
- Module D (/admin/day): Day open/close, live cash tracking, variance
- Admin QC (/admin/qc): Approve/reject/edit entries with full audit trail
- Reports (/admin/reports): 6-section end-of-day report + PDF export
- Item Master (/admin/items): Admin manages jewellery item dropdown list

## Key Business Rules
- Payment sum must equal bill total — form blocked if mismatch
- Day cannot be closed if pending entries exist
- Rejected entries stay in system (audit), excluded from reports
- Audit log is read-only for everyone
- Register A + B combined during day; split only at open/close

## Migration
- Schema file: mnap/supabase/migrations/001_initial_schema.sql
- Run in Supabase SQL Editor before first use
- Trigger fix applied: handle_new_user() uses SECURITY DEFINER SET search_path = public
