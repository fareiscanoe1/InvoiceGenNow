# InvoiceGenNow

A dark, split-pane invoice + contract generator with live preview and backend-powered client e-sign links.

- `Products` tab with dynamic line items and tax/discount/shipping calculations
- `Customer` tab with identifier, address, zip, phone, and email fields
- `Invoice` tab with invoice-number generator, terms, custom fields, and end message
- `Payment` tab with add/remove cards for bank, PayPal, crypto, and custom payment methods
- `Company` tab with company details plus logo/signature image uploads (max 2MB)
  - Uploads are replace-only (click image area to replace)
- Live right-side invoice preview synced with all form changes
- PDF export via `jsPDF` + `jspdf-autotable`
- Local draft saving in browser storage
- Contract generator section on the same page:
  - Contract details form (all Canadian provinces/territories, parties, service, fee, due days, revisions)
  - Live contract preview
  - Provider + client digital signing (draw or type)
  - Remote-ready workflow: export a client-ready PDF copy
  - Signed-copy notifications: when client signs, both client and owner receive a signed-copy link (email/SMS if configured)
  - Re-sign support: each client re-sign updates saved signature + signed timestamp
  - Contract PDF download
- Backend API (`Express` + `SQLite`) for durable signature request storage and audit events

## Run (Recommended: backend + frontend together)

1. Install dependencies:

   ```bash
   cd InvoiceGenNow
   npm install
   ```

2. Start server:

   ```bash
   npm start
   ```

3. Open [http://localhost:8787](http://localhost:8787)
4. In **Contract Generator**:
   - sign as provider first
   - use **Export Client PDF** to send a client-ready copy

## Delivery Provider Setup (Email/SMS)

Set one or both providers before running:

```bash
# Email (SMTP)
export SMTP_HOST="smtp.yourprovider.com"
export SMTP_PORT="587"
export SMTP_USER="smtp-user"
export SMTP_PASS="smtp-pass"
export SMTP_FROM="InvoiceGenNow <no-reply@invoicegennow.ca>"
export SMTP_SECURE="false"

# SMS (Twilio)
export TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export TWILIO_AUTH_TOKEN="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export TWILIO_FROM_NUMBER="+14165550100"
```

If providers are not configured, sign-link creation still works, but send will return a clear setup error.
