-- Migration 010: Add Approval Return and Stock In transaction types to approval_sales
ALTER TABLE approval_sales DROP CONSTRAINT IF EXISTS approval_sales_transaction_type_check;
ALTER TABLE approval_sales ADD CONSTRAINT approval_sales_transaction_type_check
  CHECK (transaction_type IN ('sale', 'approval', 'approval_return', 'stock_in'));
