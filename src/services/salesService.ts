// ─────────────────────────────────────────────────────────────
// Sales Service — business logic (pure, no HTTP concerns)
// ─────────────────────────────────────────────────────────────

import { query, withTransaction } from '../db/connection';
import { SalesQueries as Q }      from '../db/queries/sales.queries';
import type {
  Customer, CustomerFormData, PaginatedResponse,
  SalesOrder, CreateOrderPayload, OrderItem,
  SalesInvoice, CreateInvoicePayload, RecordPaymentPayload,
  SalesReturn, CreateReturnPayload,
  SalesKPI, MonthlySalesTrend, TopCustomer, OutstandingDue,
} from '../types/sales.types';

// ── Tax helpers ───────────────────────────────────────────────
function calcLineTotal(
  qty: number,
  price: number,
  discountPct: number,
  cgstPct: number,
  sgstPct: number,
  igstPct: number
): number {
  const base       = qty * price;
  const afterDisc  = base - (base * discountPct) / 100;
  const tax        = afterDisc * (cgstPct + sgstPct + igstPct) / 100;
  return parseFloat((afterDisc + tax).toFixed(2));
}

function calcOrderTotals(items: OrderItem[]) {
  let subtotal = 0, discountAmount = 0;
  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;

  for (const item of items) {
    const base      = item.quantity * item.unit_price;
    const disc      = (base * item.discount_pct) / 100;
    const afterDisc = base - disc;
    subtotal        += base;
    discountAmount  += disc;
    cgstAmount      += (afterDisc * item.cgst_pct) / 100;
    sgstAmount      += (afterDisc * item.sgst_pct) / 100;
    igstAmount      += (afterDisc * item.igst_pct) / 100;
  }

  const totalAmount = parseFloat(
    (subtotal - discountAmount + cgstAmount + sgstAmount + igstAmount).toFixed(2)
  );

  return {
    subtotal:        parseFloat(subtotal.toFixed(2)),
    discount_amount: parseFloat(discountAmount.toFixed(2)),
    cgst_amount:     parseFloat(cgstAmount.toFixed(2)),
    sgst_amount:     parseFloat(sgstAmount.toFixed(2)),
    igst_amount:     parseFloat(igstAmount.toFixed(2)),
    total_amount:    totalAmount,
  };
}

// ── Customer service ──────────────────────────────────────────
export const CustomerService = {

  async list(
    page = 1,
    limit = 20,
    search?: string
  ): Promise<PaginatedResponse<Customer>> {
    const offset = (page - 1) * limit;
    const params = { search: search || null, offset, limit };
    const [rows, countRows] = await Promise.all([
      query<Customer>(Q.GET_ALL_CUSTOMERS, params),
      query<{ total: number }>(Q.COUNT_CUSTOMERS, { search: search || null }),
    ]);
    const total = countRows[0]?.total ?? 0;
    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async getById(id: string): Promise<Customer | null> {
    const rows = await query<Customer>(Q.GET_CUSTOMER_BY_ID, { id });
    return rows[0] ?? null;
  },

  async create(data: CustomerFormData): Promise<Customer> {
    const rows = await query<Customer>(Q.INSERT_CUSTOMER, data);
    return rows[0];
  },

  async update(id: string, data: CustomerFormData): Promise<void> {
    await query(Q.UPDATE_CUSTOMER, { id, ...data });
  },
};

// ── Order service ─────────────────────────────────────────────
export const OrderService = {

  async list(
    page = 1,
    limit = 20,
    filters: { customer_id?: string; status?: string; from_date?: string; to_date?: string } = {}
  ) {
    const offset = (page - 1) * limit;
    const rows = await query<SalesOrder>(Q.GET_ALL_ORDERS, {
      ...filters,
      customer_id: filters.customer_id || null,
      status:      filters.status      || null,
      from_date:   filters.from_date   || null,
      to_date:     filters.to_date     || null,
      offset,
      limit,
    });
    return rows;
  },

  async getById(id: string): Promise<SalesOrder | null> {
    const [order] = await query<SalesOrder>(Q.GET_ORDER_BY_ID, { id });
    if (!order) return null;
    const items = await query<OrderItem>(Q.GET_ORDER_ITEMS, { order_id: id });
    return { ...order, items };
  },

  async create(payload: CreateOrderPayload, userId: string): Promise<SalesOrder> {
    return withTransaction(async (trx) => {
      // 1. Generate order number
      const [numRow] = await query<{ order_number: string }>(Q.NEXT_ORDER_NUMBER);
      const orderNumber = numRow.order_number;

      // 2. Compute totals
      const itemsWithTotals: OrderItem[] = payload.items.map((item) => ({
        ...item,
        line_total: calcLineTotal(
          item.quantity, item.unit_price, item.discount_pct,
          item.cgst_pct, item.sgst_pct, item.igst_pct
        ),
      }));
      const totals = calcOrderTotals(itemsWithTotals);

      // 3. Insert order header
      const req = trx.request();
      req.input('order_number',   orderNumber);
      req.input('customer_id',    payload.customer_id);
      req.input('order_date',     payload.order_date);
      req.input('notes',          payload.notes || null);
      req.input('created_by',     userId);
      Object.entries(totals).forEach(([k, v]) => req.input(k, v));
      const orderResult = await req.query(Q.INSERT_ORDER);
      const orderId = orderResult.recordset[0].id as string;

      // 4. Insert line items
      for (const item of itemsWithTotals) {
        const ir = trx.request();
        ir.input('order_id',     orderId);
        ir.input('product_id',   item.product_id);
        ir.input('quantity',     item.quantity);
        ir.input('unit_price',   item.unit_price);
        ir.input('discount_pct', item.discount_pct);
        ir.input('cgst_pct',     item.cgst_pct);
        ir.input('sgst_pct',     item.sgst_pct);
        ir.input('igst_pct',     item.igst_pct);
        ir.input('line_total',   item.line_total);
        await ir.query(Q.INSERT_ORDER_ITEM);
      }

      return (await OrderService.getById(orderId))!;
    });
  },

  async updateStatus(id: string, status: string): Promise<void> {
    await query(Q.UPDATE_ORDER_STATUS, { id, status });
  },
};

// ── Invoice service ───────────────────────────────────────────
export const InvoiceService = {

  async list(
    page = 1,
    limit = 20,
    filters: { customer_id?: string; payment_status?: string; from_date?: string; to_date?: string } = {}
  ) {
    const offset = (page - 1) * limit;
    return query<SalesInvoice>(Q.GET_ALL_INVOICES, {
      ...filters,
      customer_id:    filters.customer_id    || null,
      payment_status: filters.payment_status || null,
      from_date:      filters.from_date      || null,
      to_date:        filters.to_date        || null,
      offset,
      limit,
    });
  },

  async getById(id: string): Promise<SalesInvoice | null> {
    const [inv] = await query<SalesInvoice>(Q.GET_INVOICE_BY_ID, { id });
    if (!inv) return null;
    // Re-use order items query via order_id
    if (inv.order_id) {
      inv.items = await query<OrderItem>(Q.GET_ORDER_ITEMS, { order_id: inv.order_id });
    }
    return inv;
  },

  async create(payload: CreateInvoicePayload, userId: string): Promise<SalesInvoice> {
    return withTransaction(async (trx) => {
      const [numRow] = await query<{ invoice_number: string }>(Q.NEXT_INVOICE_NUMBER);
      const invoiceNumber = numRow.invoice_number;

      const itemsWithTotals: OrderItem[] = payload.items.map((item) => ({
        ...item,
        line_total: calcLineTotal(
          item.quantity, item.unit_price, item.discount_pct,
          item.cgst_pct, item.sgst_pct, item.igst_pct
        ),
      }));
      const totals = calcOrderTotals(itemsWithTotals);

      const req = trx.request();
      req.input('invoice_number', invoiceNumber);
      req.input('order_id',       payload.order_id || null);
      req.input('customer_id',    payload.customer_id);
      req.input('invoice_date',   payload.invoice_date);
      req.input('due_date',       payload.due_date);
      req.input('notes',          payload.notes || null);
      req.input('created_by',     userId);
      Object.entries(totals).forEach(([k, v]) => req.input(k, v));
      const result = await req.query(Q.INSERT_INVOICE);
      const invoiceId = result.recordset[0].id as string;

      return (await InvoiceService.getById(invoiceId))!;
    });
  },

  async recordPayment(payload: RecordPaymentPayload): Promise<void> {
    await query(Q.RECORD_PAYMENT, {
      invoice_id: payload.invoice_id,
      amount:     payload.amount,
    });
    // TODO: also insert into bank_transactions table
  },
};

// ── Returns service ───────────────────────────────────────────
export const ReturnService = {

  async list(
    page = 1,
    limit = 20,
    filters: { customer_id?: string; from_date?: string; to_date?: string } = {}
  ) {
    const offset = (page - 1) * limit;
    return query<SalesReturn>(Q.GET_ALL_RETURNS, {
      ...filters,
      customer_id: filters.customer_id || null,
      from_date:   filters.from_date   || null,
      to_date:     filters.to_date     || null,
      offset,
      limit,
    });
  },

  async create(payload: CreateReturnPayload, userId: string): Promise<SalesReturn> {
    const [numRow] = await query<{ return_number: string }>(Q.NEXT_RETURN_NUMBER);
    const returnNumber = numRow.return_number;
    const total = payload.items.reduce((sum, item) => {
      return sum + calcLineTotal(
        item.quantity, item.unit_price, item.discount_pct,
        item.cgst_pct, item.sgst_pct, item.igst_pct
      );
    }, 0);

    const rows = await query<SalesReturn>(Q.INSERT_RETURN, {
      return_number: returnNumber,
      invoice_id:    payload.invoice_id   || null,
      customer_id:   payload.customer_id,
      return_date:   payload.return_date,
      reason:        payload.reason,
      total_amount:  parseFloat(total.toFixed(2)),
      created_by:    userId,
    });
    return rows[0];
  },
};

// ── Reports service ───────────────────────────────────────────
export const SalesReportService = {
  async getKPI():              Promise<SalesKPI>              { return (await query<SalesKPI>(Q.GET_SALES_KPI))[0]; },
  async getMonthlyTrend():     Promise<MonthlySalesTrend[]>   { return query<MonthlySalesTrend>(Q.GET_MONTHLY_TREND); },
  async getTopCustomers():     Promise<TopCustomer[]>         { return query<TopCustomer>(Q.GET_TOP_CUSTOMERS); },
  async getOutstandingDues():  Promise<OutstandingDue[]>      { return query<OutstandingDue>(Q.GET_OUTSTANDING_DUES); },
};
