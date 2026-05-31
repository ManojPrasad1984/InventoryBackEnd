// ─────────────────────────────────────────────────────────────
// Shared domain types — Sales module
// ─────────────────────────────────────────────────────────────

// ── Pagination ────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data:       T[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

export interface PaginationQuery {
  page?:   number;
  limit?:  number;
  search?: string;
}

// ── Customer ──────────────────────────────────────────────────
export interface Customer {
  id:                string;
  name:              string;
  phone:             string;
  email?:            string;
  address:           string;
  gst_number?:       string;
  credit_limit:      number;
  credit_days:       number;
  is_active:         boolean;
  created_at:        string;
  total_outstanding: number;
  total_invoices?:   number;
}

export interface CustomerFormData {
  name:         string;
  phone:        string;
  email?:       string;
  address:      string;
  gst_number?:  string;
  credit_limit: number;
  credit_days:  number;
}

// ── Product (for order line items) ───────────────────────────
export interface Product {
  id:              string;
  name:            string;
  sku:             string;
  unit_of_measure: string;
  sale_price:      number;
  cgst_pct:        number;
  sgst_pct:        number;
  igst_pct:        number;
  stock_qty:       number;
}

// ── Order ─────────────────────────────────────────────────────
export type OrderStatus = 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';

export interface OrderItem {
  id?:           string;
  product_id:    string;
  product_name?: string;
  sku?:          string;
  unit_of_measure?: string;
  quantity:      number;
  unit_price:    number;
  discount_pct:  number;  // percentage e.g. 5 = 5%
  cgst_pct:      number;
  sgst_pct:      number;
  igst_pct:      number;
  line_total:    number;
}

export interface SalesOrder {
  id:               string;
  order_number:     string;
  customer_id:      string;
  customer_name?:   string;
  customer_phone?:  string;
  customer_address?: string;
  customer_gst?:    string;
  order_date:       string;
  status:           OrderStatus;
  subtotal:         number;
  discount_amount:  number;
  cgst_amount:      number;
  sgst_amount:      number;
  igst_amount:      number;
  total_amount:     number;
  notes?:           string;
  items?:           OrderItem[];
  created_at?:      string;
}

export interface CreateOrderPayload {
  customer_id:     string;
  order_date:      string;
  notes?:          string;
  items:           Omit<OrderItem, 'id' | 'product_name' | 'sku' | 'unit_of_measure'>[];
}

// ── Invoice ───────────────────────────────────────────────────
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface SalesInvoice {
  id:                  string;
  invoice_number:      string;
  order_id?:           string;
  order_number?:       string;
  customer_id:         string;
  customer_name?:      string;
  customer_phone?:     string;
  customer_address?:   string;
  customer_gst?:       string;
  invoice_date:        string;
  due_date:            string;
  payment_status:      PaymentStatus;
  subtotal:            number;
  discount_amount:     number;
  cgst_amount:         number;
  sgst_amount:         number;
  igst_amount:         number;
  total_amount:        number;
  outstanding_amount:  number;
  notes?:              string;
  items?:              OrderItem[];
}

export interface CreateInvoicePayload {
  order_id?:    string;
  customer_id:  string;
  invoice_date: string;
  due_date:     string;
  notes?:       string;
  items:        Omit<OrderItem, 'id' | 'product_name' | 'sku' | 'unit_of_measure'>[];
}

export interface RecordPaymentPayload {
  invoice_id:     string;
  amount:         number;
  payment_mode:   'cash' | 'upi' | 'bank_transfer' | 'cheque';
  payment_date:   string;
  reference_no?:  string;
  notes?:         string;
}

// ── Sales Return ──────────────────────────────────────────────
export type ReturnStatus = 'pending' | 'approved' | 'rejected';

export interface SalesReturn {
  id:               string;
  return_number:    string;
  invoice_id?:      string;
  invoice_number?:  string;
  customer_id:      string;
  customer_name?:   string;
  return_date:      string;
  reason:           string;
  total_amount:     number;
  status:           ReturnStatus;
  items?:           OrderItem[];
}

export interface CreateReturnPayload {
  invoice_id?:   string;
  customer_id:   string;
  return_date:   string;
  reason:        string;
  items:         Omit<OrderItem, 'id' | 'product_name' | 'sku' | 'unit_of_measure'>[];
}

// ── Dashboard KPIs ────────────────────────────────────────────
export interface SalesKPI {
  today_sales:       number;
  month_sales:       number;
  total_outstanding: number;
  overdue_count:     number;
}

export interface MonthlySalesTrend {
  month_label:   string;
  total_sales:   number;
  invoice_count: number;
}

export interface TopCustomer {
  id:              string;
  name:            string;
  phone:           string;
  total_purchases: number;
  invoice_count:   number;
  outstanding:     number;
}

export interface OutstandingDue {
  customer_id:       string;
  customer_name:     string;
  phone:             string;
  invoice_number:    string;
  invoice_date:      string;
  due_date:          string;
  total_amount:      number;
  outstanding_amount: number;
  days_overdue:      number;
}

// ── API response wrapper ──────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success:  boolean;
  data?:    T;
  message?: string;
  errors?:  string[];
}
