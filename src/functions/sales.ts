// ─────────────────────────────────────────────────────────────
// Sales Azure Function  — all sales HTTP endpoints
// Route prefix:  /api/sales
//
// Endpoints:
//   GET    /api/sales/customers
//   POST   /api/sales/customers
//   GET    /api/sales/customers/:id
//   PUT    /api/sales/customers/:id
//
//   GET    /api/sales/orders
//   POST   /api/sales/orders
//   GET    /api/sales/orders/:id
//   PATCH  /api/sales/orders/:id/status
//
//   GET    /api/sales/invoices
//   POST   /api/sales/invoices
//   GET    /api/sales/invoices/:id
//   POST   /api/sales/invoices/:id/payment
//
//   GET    /api/sales/returns
//   POST   /api/sales/returns
//
//   GET    /api/sales/reports/kpi
//   GET    /api/sales/reports/trend
//   GET    /api/sales/reports/top-customers
//   GET    /api/sales/reports/outstanding
// ─────────────────────────────────────────────────────────────

import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  CustomerService,
  OrderService,
  InvoiceService,
  ReturnService,
  SalesReportService,
} from '../services/salesService';
import { verifyJWT }     from '../middleware/auth.middleware';
import { validateRole }  from '../middleware/rbac.middleware';
import { ApiResponse }   from '../types/sales.types';

// ── Utility helpers ───────────────────────────────────────────
function ok<T>(data: T, message?: string): HttpResponseInit {
  const body: ApiResponse<T> = { success: true, data, message };
  return { status: 200, jsonBody: body };
}

function created<T>(data: T): HttpResponseInit {
  return { status: 201, jsonBody: { success: true, data } as ApiResponse<T> };
}

function notFound(msg = 'Not found'): HttpResponseInit {
  return { status: 404, jsonBody: { success: false, message: msg } as ApiResponse };
}

function badRequest(errors: string[]): HttpResponseInit {
  return { status: 400, jsonBody: { success: false, errors } as ApiResponse };
}

function serverError(err: unknown): HttpResponseInit {
  console.error('[SalesFunction]', err);
  return {
    status: 500,
    jsonBody: { success: false, message: 'Internal server error' } as ApiResponse,
  };
}

// ── Auth guard (call at the top of every handler) ─────────────
async function guard(
  req: HttpRequest,
  roles?: string[]
): Promise<{ userId: string; role: string } | HttpResponseInit> {
  const payload = verifyJWT(req.headers.get('authorization') || '');
  if (!payload) return { status: 401, jsonBody: { success: false, message: 'Unauthorised' } };
  if (roles && !validateRole(payload.role, roles)) {
    return { status: 403, jsonBody: { success: false, message: 'Forbidden' } };
  }
  return payload;
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════

app.http('sales-customers-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/customers',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;

      const p      = req.query;
      const page   = parseInt(p.get('page')   || '1');
      const limit  = parseInt(p.get('limit')  || '20');
      const search = p.get('search') || undefined;

      const result = await CustomerService.list(page, limit, search);
      return ok(result);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-customers-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sales/customers',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req, ['admin', 'manager', 'sales_rep']);
      if ('status' in auth) return auth;

      const body = await req.json() as Record<string, unknown>;
      const errors: string[] = [];
      if (!body.name)    errors.push('name is required');
      if (!body.phone)   errors.push('phone is required');
      if (!body.address) errors.push('address is required');
      if (errors.length) return badRequest(errors);

      const customer = await CustomerService.create({
        name:         String(body.name),
        phone:        String(body.phone),
        email:        body.email ? String(body.email) : undefined,
        address:      String(body.address),
        gst_number:   body.gst_number ? String(body.gst_number) : undefined,
        credit_limit: Number(body.credit_limit ?? 0),
        credit_days:  Number(body.credit_days  ?? 30),
      });
      return created(customer);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-customer-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/customers/{id}',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const id = ctx.extraInputs.get('id') as string ?? req.params.id;
      const customer = await CustomerService.getById(id);
      return customer ? ok(customer) : notFound('Customer not found');
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-customer-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'sales/customers/{id}',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req, ['admin', 'manager']);
      if ('status' in auth) return auth;
      const id   = ctx.extraInputs.get('id') as string ?? req.params.id;
      const body = await req.json() as Record<string, unknown>;
      await CustomerService.update(id, {
        name:         String(body.name),
        phone:        String(body.phone),
        email:        body.email ? String(body.email) : undefined,
        address:      String(body.address),
        gst_number:   body.gst_number ? String(body.gst_number) : undefined,
        credit_limit: Number(body.credit_limit ?? 0),
        credit_days:  Number(body.credit_days  ?? 30),
      });
      return ok(null, 'Customer updated');
    } catch (e) { return serverError(e); }
  },
});

// ═══════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════

app.http('sales-orders-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/orders',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const p     = req.query;
      const orders = await OrderService.list(
        parseInt(p.get('page') || '1'),
        parseInt(p.get('limit') || '20'),
        {
          customer_id: p.get('customer_id') || undefined,
          status:      p.get('status')      || undefined,
          from_date:   p.get('from_date')   || undefined,
          to_date:     p.get('to_date')     || undefined,
        }
      );
      return ok(orders);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-orders-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sales/orders',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req, ['admin', 'manager', 'sales_rep']);
      if ('status' in auth) return auth;
      const body   = await req.json() as Record<string, unknown>;
      const errors: string[] = [];
      if (!body.customer_id)                      errors.push('customer_id is required');
      if (!body.order_date)                        errors.push('order_date is required');
      if (!Array.isArray(body.items) || !body.items.length) errors.push('items must be a non-empty array');
      if (errors.length) return badRequest(errors);

      const order = await OrderService.create(body as never, auth.userId);
      return created(order);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-order-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/orders/{id}',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const id    = ctx.extraInputs.get('id') as string ?? req.params.id;
      const order = await OrderService.getById(id);
      return order ? ok(order) : notFound('Order not found');
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-order-status', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'sales/orders/{id}/status',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req, ['admin', 'manager']);
      if ('status' in auth) return auth;
      const id   = ctx.extraInputs.get('id') as string ?? req.params.id;
      const body = await req.json() as { status: string };
      if (!body.status) return badRequest(['status is required']);
      await OrderService.updateStatus(id, body.status);
      return ok(null, 'Order status updated');
    } catch (e) { return serverError(e); }
  },
});

// ═══════════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════════

app.http('sales-invoices-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/invoices',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const p       = req.query;
      const invoices = await InvoiceService.list(
        parseInt(p.get('page') || '1'),
        parseInt(p.get('limit') || '20'),
        {
          customer_id:    p.get('customer_id')    || undefined,
          payment_status: p.get('payment_status') || undefined,
          from_date:      p.get('from_date')      || undefined,
          to_date:        p.get('to_date')        || undefined,
        }
      );
      return ok(invoices);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-invoices-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sales/invoices',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req, ['admin', 'manager', 'sales_rep']);
      if ('status' in auth) return auth;
      const body = await req.json() as Record<string, unknown>;
      const errors: string[] = [];
      if (!body.customer_id)  errors.push('customer_id is required');
      if (!body.invoice_date) errors.push('invoice_date is required');
      if (!body.due_date)     errors.push('due_date is required');
      if (errors.length) return badRequest(errors);
      const invoice = await InvoiceService.create(body as never, auth.userId);
      return created(invoice);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-invoice-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/invoices/{id}',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const id      = ctx.extraInputs.get('id') as string ?? req.params.id;
      const invoice = await InvoiceService.getById(id);
      return invoice ? ok(invoice) : notFound('Invoice not found');
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-invoice-payment', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sales/invoices/{id}/payment',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req, ['admin', 'manager']);
      if ('status' in auth) return auth;
      const id   = ctx.extraInputs.get('id') as string ?? req.params.id;
      const body = await req.json() as Record<string, unknown>;
      if (!body.amount || Number(body.amount) <= 0) return badRequest(['Valid amount is required']);
      await InvoiceService.recordPayment({
        invoice_id:   id,
        amount:       Number(body.amount),
        payment_mode: (body.payment_mode as never) || 'cash',
        payment_date: String(body.payment_date || new Date().toISOString()),
        reference_no: body.reference_no ? String(body.reference_no) : undefined,
        notes:        body.notes        ? String(body.notes)        : undefined,
      });
      return ok(null, 'Payment recorded');
    } catch (e) { return serverError(e); }
  },
});

// ═══════════════════════════════════════════════════════════════
// RETURNS
// ═══════════════════════════════════════════════════════════════

app.http('sales-returns-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/returns',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const p       = req.query;
      const returns = await ReturnService.list(
        parseInt(p.get('page') || '1'),
        parseInt(p.get('limit') || '20'),
        {
          customer_id: p.get('customer_id') || undefined,
          from_date:   p.get('from_date')   || undefined,
          to_date:     p.get('to_date')     || undefined,
        }
      );
      return ok(returns);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-returns-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sales/returns',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req, ['admin', 'manager']);
      if ('status' in auth) return auth;
      const body = await req.json() as Record<string, unknown>;
      const errors: string[] = [];
      if (!body.customer_id) errors.push('customer_id is required');
      if (!body.return_date) errors.push('return_date is required');
      if (!body.reason)      errors.push('reason is required');
      if (errors.length) return badRequest(errors);
      const ret = await ReturnService.create(body as never, auth.userId);
      return created(ret);
    } catch (e) { return serverError(e); }
  },
});

// ═══════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════

app.http('sales-report-kpi', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/reports/kpi',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const kpi = await SalesReportService.getKPI();
      return ok(kpi);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-report-trend', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/reports/trend',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const trend = await SalesReportService.getMonthlyTrend();
      return ok(trend);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-report-top-customers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/reports/top-customers',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const top = await SalesReportService.getTopCustomers();
      return ok(top);
    } catch (e) { return serverError(e); }
  },
});

app.http('sales-report-outstanding', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sales/reports/outstanding',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const auth = await guard(req);
      if ('status' in auth) return auth;
      const dues = await SalesReportService.getOutstandingDues();
      return ok(dues);
    } catch (e) { return serverError(e); }
  },
});
