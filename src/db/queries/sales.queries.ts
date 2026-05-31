// ─────────────────────────────────────────────────────────────
// Sales SQL Queries  (parameterised — safe from SQL injection)
// ─────────────────────────────────────────────────────────────

export const SalesQueries = {

  // ── Customers ─────────────────────────────────────────────

  GET_ALL_CUSTOMERS: `
    SELECT
      c.id, c.name, c.phone, c.email, c.address, c.gst_number,
      c.credit_limit, c.credit_days, c.is_active, c.created_at,
      ISNULL(SUM(si.outstanding_amount), 0) AS total_outstanding
    FROM customers c
    LEFT JOIN sales_invoices si
      ON si.customer_id = c.id AND si.payment_status != 'paid'
    WHERE (@search IS NULL OR c.name LIKE '%' + @search + '%'
        OR c.phone LIKE '%' + @search + '%')
    GROUP BY c.id, c.name, c.phone, c.email, c.address,
             c.gst_number, c.credit_limit, c.credit_days, c.is_active, c.created_at
    ORDER BY c.name
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,

  COUNT_CUSTOMERS: `
    SELECT COUNT(*) AS total FROM customers
    WHERE (@search IS NULL OR name LIKE '%' + @search + '%'
        OR phone LIKE '%' + @search + '%')`,

  GET_CUSTOMER_BY_ID: `
    SELECT c.*,
      ISNULL(SUM(CASE WHEN si.payment_status != 'paid'
        THEN si.outstanding_amount ELSE 0 END), 0) AS total_outstanding,
      COUNT(DISTINCT si.id) AS total_invoices
    FROM customers c
    LEFT JOIN sales_invoices si ON si.customer_id = c.id
    WHERE c.id = @id
    GROUP BY c.id, c.name, c.phone, c.email, c.address,
             c.gst_number, c.credit_limit, c.credit_days,
             c.is_active, c.created_at, c.updated_at`,

  INSERT_CUSTOMER: `
    INSERT INTO customers
      (id, name, phone, email, address, gst_number,
       credit_limit, credit_days, is_active, created_at, updated_at)
    OUTPUT INSERTED.*
    VALUES (NEWID(), @name, @phone, @email, @address, @gst_number,
       @credit_limit, @credit_days, 1, GETDATE(), GETDATE())`,

  UPDATE_CUSTOMER: `
    UPDATE customers SET
      name = @name, phone = @phone, email = @email,
      address = @address, gst_number = @gst_number,
      credit_limit = @credit_limit, credit_days = @credit_days,
      updated_at = GETDATE()
    WHERE id = @id`,

  // ── Sales Orders ──────────────────────────────────────────

  GET_ALL_ORDERS: `
    SELECT so.id, so.order_number, so.order_date, so.status,
      so.total_amount, so.notes,
      c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone
    FROM sales_orders so
    INNER JOIN customers c ON c.id = so.customer_id
    WHERE (@customer_id IS NULL OR so.customer_id = @customer_id)
      AND (@status    IS NULL OR so.status = @status)
      AND (@from_date IS NULL OR so.order_date >= @from_date)
      AND (@to_date   IS NULL OR so.order_date <= @to_date)
    ORDER BY so.order_date DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,

  GET_ORDER_BY_ID: `
    SELECT so.*, c.name AS customer_name, c.phone AS customer_phone,
      c.address AS customer_address, c.gst_number AS customer_gst
    FROM sales_orders so
    INNER JOIN customers c ON c.id = so.customer_id
    WHERE so.id = @id`,

  GET_ORDER_ITEMS: `
    SELECT soi.id, soi.quantity, soi.unit_price, soi.discount_pct,
      soi.cgst_pct, soi.sgst_pct, soi.igst_pct, soi.line_total,
      p.id AS product_id, p.name AS product_name, p.sku, p.unit_of_measure
    FROM sales_order_items soi
    INNER JOIN products p ON p.id = soi.product_id
    WHERE soi.order_id = @order_id`,

  INSERT_ORDER: `
    INSERT INTO sales_orders
      (id, order_number, customer_id, order_date, status,
       subtotal, discount_amount, cgst_amount, sgst_amount,
       igst_amount, total_amount, notes, created_by, created_at)
    OUTPUT INSERTED.id, INSERTED.order_number
    VALUES (NEWID(), @order_number, @customer_id, @order_date, 'pending',
       @subtotal, @discount_amount, @cgst_amount, @sgst_amount,
       @igst_amount, @total_amount, @notes, @created_by, GETDATE())`,

  INSERT_ORDER_ITEM: `
    INSERT INTO sales_order_items
      (id, order_id, product_id, quantity, unit_price,
       discount_pct, cgst_pct, sgst_pct, igst_pct, line_total)
    VALUES (NEWID(), @order_id, @product_id, @quantity, @unit_price,
       @discount_pct, @cgst_pct, @sgst_pct, @igst_pct, @line_total)`,

  UPDATE_ORDER_STATUS: `
    UPDATE sales_orders
    SET status = @status, updated_at = GETDATE()
    WHERE id = @id`,

  // ── Invoices ──────────────────────────────────────────────

  GET_ALL_INVOICES: `
    SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
      si.payment_status, si.total_amount, si.outstanding_amount,
      c.name AS customer_name, c.phone AS customer_phone,
      so.order_number
    FROM sales_invoices si
    INNER JOIN customers c      ON c.id  = si.customer_id
    LEFT  JOIN sales_orders so  ON so.id = si.order_id
    WHERE (@customer_id    IS NULL OR si.customer_id = @customer_id)
      AND (@payment_status IS NULL OR si.payment_status = @payment_status)
      AND (@from_date      IS NULL OR si.invoice_date >= @from_date)
      AND (@to_date        IS NULL OR si.invoice_date <= @to_date)
    ORDER BY si.invoice_date DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,

  GET_INVOICE_BY_ID: `
    SELECT si.*, c.name AS customer_name, c.phone AS customer_phone,
      c.address AS customer_address, c.gst_number AS customer_gst,
      so.order_number
    FROM sales_invoices si
    INNER JOIN customers c      ON c.id  = si.customer_id
    LEFT  JOIN sales_orders so  ON so.id = si.order_id
    WHERE si.id = @id`,

  INSERT_INVOICE: `
    INSERT INTO sales_invoices
      (id, invoice_number, order_id, customer_id, invoice_date,
       due_date, payment_status, subtotal, discount_amount,
       cgst_amount, sgst_amount, igst_amount, total_amount,
       outstanding_amount, notes, created_by, created_at)
    OUTPUT INSERTED.id, INSERTED.invoice_number
    VALUES (NEWID(), @invoice_number, @order_id, @customer_id, @invoice_date,
       @due_date, 'unpaid', @subtotal, @discount_amount,
       @cgst_amount, @sgst_amount, @igst_amount, @total_amount,
       @total_amount, @notes, @created_by, GETDATE())`,

  RECORD_PAYMENT: `
    UPDATE sales_invoices SET
      outstanding_amount = outstanding_amount - @amount,
      payment_status = CASE
        WHEN outstanding_amount - @amount <= 0 THEN 'paid'
        ELSE 'partial'
      END,
      updated_at = GETDATE()
    WHERE id = @invoice_id`,

  // ── Sales Returns ─────────────────────────────────────────

  GET_ALL_RETURNS: `
    SELECT sr.id, sr.return_number, sr.return_date, sr.reason,
      sr.total_amount, sr.status,
      c.name AS customer_name, si.invoice_number
    FROM sales_returns sr
    INNER JOIN customers c       ON c.id  = sr.customer_id
    LEFT  JOIN sales_invoices si ON si.id = sr.invoice_id
    WHERE (@customer_id IS NULL OR sr.customer_id = @customer_id)
      AND (@from_date   IS NULL OR sr.return_date >= @from_date)
      AND (@to_date     IS NULL OR sr.return_date <= @to_date)
    ORDER BY sr.return_date DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,

  INSERT_RETURN: `
    INSERT INTO sales_returns
      (id, return_number, invoice_id, customer_id, return_date,
       reason, total_amount, status, created_by, created_at)
    OUTPUT INSERTED.id, INSERTED.return_number
    VALUES (NEWID(), @return_number, @invoice_id, @customer_id, @return_date,
       @reason, @total_amount, 'pending', @created_by, GETDATE())`,

  // ── KPIs & Reports ────────────────────────────────────────

  GET_SALES_KPI: `
    SELECT
      ISNULL(SUM(CASE WHEN CAST(invoice_date AS DATE) = CAST(GETDATE() AS DATE)
        THEN total_amount ELSE 0 END), 0)  AS today_sales,
      ISNULL(SUM(CASE WHEN MONTH(invoice_date) = MONTH(GETDATE())
        AND YEAR(invoice_date) = YEAR(GETDATE())
        THEN total_amount ELSE 0 END), 0)  AS month_sales,
      ISNULL(SUM(outstanding_amount), 0)   AS total_outstanding,
      COUNT(CASE WHEN payment_status != 'paid'
        AND due_date < GETDATE() THEN 1 END) AS overdue_count
    FROM sales_invoices`,

  GET_MONTHLY_TREND: `
    SELECT FORMAT(invoice_date, 'MMM yyyy') AS month_label,
      MONTH(invoice_date) AS month_num,
      YEAR(invoice_date)  AS year_num,
      SUM(total_amount)   AS total_sales,
      COUNT(*)            AS invoice_count
    FROM sales_invoices
    WHERE invoice_date >= DATEADD(MONTH, -5, GETDATE())
    GROUP BY FORMAT(invoice_date, 'MMM yyyy'),
             MONTH(invoice_date), YEAR(invoice_date)
    ORDER BY year_num, month_num`,

  GET_TOP_CUSTOMERS: `
    SELECT TOP 10 c.id, c.name, c.phone,
      SUM(si.total_amount)       AS total_purchases,
      COUNT(si.id)               AS invoice_count,
      SUM(si.outstanding_amount) AS outstanding
    FROM customers c
    INNER JOIN sales_invoices si ON si.customer_id = c.id
    WHERE si.invoice_date >= DATEADD(MONTH, -3, GETDATE())
    GROUP BY c.id, c.name, c.phone
    ORDER BY total_purchases DESC`,

  GET_OUTSTANDING_DUES: `
    SELECT c.id AS customer_id, c.name AS customer_name, c.phone,
      si.invoice_number, si.invoice_date, si.due_date,
      si.total_amount, si.outstanding_amount,
      DATEDIFF(DAY, si.due_date, GETDATE()) AS days_overdue
    FROM sales_invoices si
    INNER JOIN customers c ON c.id = si.customer_id
    WHERE si.payment_status != 'paid' AND si.outstanding_amount > 0
    ORDER BY days_overdue DESC, si.outstanding_amount DESC`,

  // ── Sequence generators ───────────────────────────────────

  NEXT_ORDER_NUMBER: `
    SELECT 'SO-' + FORMAT(GETDATE(),'yyyyMMdd') + '-'
      + RIGHT('000' + CAST(
          ISNULL((SELECT COUNT(*) FROM sales_orders
            WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)), 0) + 1
        AS VARCHAR), 3) AS order_number`,

  NEXT_INVOICE_NUMBER: `
    SELECT 'INV-' + FORMAT(GETDATE(),'yyyyMMdd') + '-'
      + RIGHT('000' + CAST(
          ISNULL((SELECT COUNT(*) FROM sales_invoices
            WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)), 0) + 1
        AS VARCHAR), 3) AS invoice_number`,

  NEXT_RETURN_NUMBER: `
    SELECT 'SR-' + FORMAT(GETDATE(),'yyyyMMdd') + '-'
      + RIGHT('000' + CAST(
          ISNULL((SELECT COUNT(*) FROM sales_returns
            WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)), 0) + 1
        AS VARCHAR), 3) AS return_number`,
};
