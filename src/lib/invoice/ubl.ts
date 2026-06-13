/**
 * Générateur UBL 2.1 — profil PEPPOL BIS Billing 3.0.
 *
 * Spec : https://docs.peppol.eu/poacc/billing/3.0/
 * Standard EN 16931 (e-facturation européenne).
 *
 * Utilisé pour envoyer les factures B2B au comptable via WinAuditor
 * (boîte UBL dédiée) ou via le réseau PEPPOL (PeppolGO).
 *
 * Hypothèses :
 *   - Vendeur SBURGS SRL (Belgique). EndpointID schemeID="0208" = KBO/BCE.
 *   - Acheteur = entité belge dotée d'un n° TVA / KBO.
 *   - Prix FritOS stockés TTC → reverse-calc HT pour les LineExtensionAmount.
 *   - Si la facture a été requalifiée (vat_12 > 0 && vat_6 === 0 → sur place,
 *     ou inverse), le taux uniforme override le vat_rate par ligne.
 *   - Cas mixte (6 % et 12 % dans la même facture) → on respecte le vat_rate
 *     par ligne tel que stocké en DB.
 */

export type UBLOrderItem = {
  product_name: string
  quantity: number
  unit_price: number  // TTC, tel que stocké
  options_total: number
  line_total: number  // TTC
  vat_rate: number    // pourcentage (6, 12, 21)
}

export type UBLOrder = {
  order_number: string
  order_type: string
  created_at: string
  order_items: UBLOrderItem[]
}

export type UBLEstablishment = {
  name: string
  address: string | null
  phone: string | null
  vat_number: string | null  // ex: "BE 1009.237.290"
  legal_name?: string         // ex: "SBURGS SRL"
}

export type UBLInvoiceInput = {
  invoice_number: string
  customer_name: string
  customer_vat: string | null      // ex: "BE 0207.286.129"
  customer_address: string | null
  customer_email: string | null
  total_ht: number
  vat_6: number
  vat_12: number
  total_ttc: number
  notes: string | null
  created_at: string
  payment_method: string
}

export type UBLData = {
  invoice: UBLInvoiceInput
  establishment: UBLEstablishment
  orders: UBLOrder[]
  /** Échéance par défaut +30j à partir de created_at. */
  dueDateDaysFromIssue?: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** "BE 1009.237.290" → "BE1009237290". */
function normalizeVAT(vat: string | null | undefined): string {
  if (!vat) return ''
  return vat.replace(/[\s.\-]/g, '').toUpperCase()
}

/** "BE 1009.237.290" → "1009237290" (numéro KBO, sans préfixe pays). */
function extractKBO(vat: string | null | undefined): string {
  const n = normalizeVAT(vat)
  return n.replace(/^BE/, '')
}

/** Parse une adresse multi-lignes "Rue X 1\n7300 Boussu" → composants. */
function parseAddress(addr: string | null | undefined): {
  street: string
  postalCode: string
  city: string
} {
  if (!addr) return { street: '', postalCode: '', city: '' }
  const lines = addr.split(/[\n,]/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { street: '', postalCode: '', city: '' }
  const street = lines[0]
  // Dernière ligne contient typiquement "CP Ville" ou juste "Ville"
  const last = lines[lines.length - 1]
  const m = last.match(/^(\d{4})\s+(.+)$/)
  if (m) return { street, postalCode: m[1], city: m[2] }
  return { street, postalCode: '', city: last }
}

function ymd(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return ymd(d)
}

/**
 * Détermine le taux TVA effectif d'une ligne, en tenant compte d'une
 * éventuelle requalification de la facture entière (sur place / emporter).
 */
function effectiveLineVatRate(invoice: UBLInvoiceInput, fallback: number): number {
  const has6 = Number(invoice.vat_6) > 0
  const has12 = Number(invoice.vat_12) > 0
  if (has12 && !has6) return 12
  if (has6 && !has12) return fallback === 12 ? 6 : fallback // override eat_in lignes en takeaway
  return fallback
}

// ─── Générateur principal ───────────────────────────────────────────────────

export function generateUBLInvoice(data: UBLData): string {
  const { invoice, establishment, orders } = data
  const issueDate = ymd(invoice.created_at)
  const dueDate = addDaysISO(invoice.created_at, data.dueDateDaysFromIssue ?? 30)

  const sellerVAT = normalizeVAT(establishment.vat_number)
  const sellerKBO = extractKBO(establishment.vat_number)
  const sellerLegalName = establishment.legal_name || 'SBURGS SRL'
  const sellerAddr = parseAddress(establishment.address)

  const buyerVAT = normalizeVAT(invoice.customer_vat)
  const buyerKBO = extractKBO(invoice.customer_vat)
  const buyerAddr = parseAddress(invoice.customer_address)

  // ─── Aplatir les lignes : 1 InvoiceLine par order_item ──────────────────
  type FlatLine = {
    id: string
    productName: string
    quantity: number
    unitPriceHT: number
    lineExtAmount: number   // HT
    vatRate: number
    orderNumber: string
  }
  const flatLines: FlatLine[] = []
  let lineId = 1
  for (const order of orders) {
    for (const item of order.order_items) {
      const rate = effectiveLineVatRate(invoice, Number(item.vat_rate) || 6)
      const lineTotalTTC = Number(item.line_total) || 0
      const lineTotalHT = lineTotalTTC / (1 + rate / 100)
      const qty = Number(item.quantity) || 1
      const unitPriceHT = lineTotalHT / qty
      flatLines.push({
        id: String(lineId++),
        productName: item.product_name,
        quantity: qty,
        unitPriceHT: round2(unitPriceHT),
        lineExtAmount: round2(lineTotalHT),
        vatRate: rate,
        orderNumber: order.order_number,
      })
    }
  }

  // ─── Regroupement TaxSubtotal par taux ──────────────────────────────────
  const taxByRate = new Map<number, { taxable: number; tax: number }>()
  for (const line of flatLines) {
    const cur = taxByRate.get(line.vatRate) ?? { taxable: 0, tax: 0 }
    cur.taxable += line.lineExtAmount
    cur.tax += line.lineExtAmount * line.vatRate / 100
    taxByRate.set(line.vatRate, cur)
  }
  const taxSubtotals = Array.from(taxByRate.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({
      rate,
      taxable: round2(v.taxable),
      tax: round2(v.tax),
    }))

  // ─── Totaux ─────────────────────────────────────────────────────────────
  const totalLineExt = round2(flatLines.reduce((s, l) => s + l.lineExtAmount, 0))
  const totalTaxAmount = round2(taxSubtotals.reduce((s, t) => s + t.tax, 0))
  const totalTaxExclusive = totalLineExt
  const totalTaxInclusive = round2(totalLineExt + totalTaxAmount)
  const payableAmount = totalTaxInclusive

  // PaymentMeansCode : 30 = virement (cas pending), 10 = cash, 48 = card
  const paymentMeansCode =
    invoice.payment_method === 'cash' ? '10'
      : invoice.payment_method === 'card' ? '48'
      : '30' // pending / transfer / default

  // ─── XML build ──────────────────────────────────────────────────────────
  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"`)
  lines.push(`  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"`)
  lines.push(`  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`)
  lines.push(`  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>`)
  lines.push(`  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>`)
  lines.push(`  <cbc:ID>${escapeXml(invoice.invoice_number)}</cbc:ID>`)
  lines.push(`  <cbc:IssueDate>${issueDate}</cbc:IssueDate>`)
  lines.push(`  <cbc:DueDate>${dueDate}</cbc:DueDate>`)
  lines.push(`  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>`)
  if (invoice.notes) {
    lines.push(`  <cbc:Note>${escapeXml(invoice.notes)}</cbc:Note>`)
  }
  lines.push(`  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>`)
  lines.push(`  <cbc:BuyerReference>${escapeXml(invoice.invoice_number)}</cbc:BuyerReference>`)

  // Seller
  lines.push(`  <cac:AccountingSupplierParty>`)
  lines.push(`    <cac:Party>`)
  lines.push(`      <cbc:EndpointID schemeID="0208">${escapeXml(sellerKBO)}</cbc:EndpointID>`)
  lines.push(`      <cac:PartyName><cbc:Name>${escapeXml(establishment.name)}</cbc:Name></cac:PartyName>`)
  lines.push(`      <cac:PostalAddress>`)
  lines.push(`        <cbc:StreetName>${escapeXml(sellerAddr.street)}</cbc:StreetName>`)
  if (sellerAddr.city) lines.push(`        <cbc:CityName>${escapeXml(sellerAddr.city)}</cbc:CityName>`)
  if (sellerAddr.postalCode) lines.push(`        <cbc:PostalZone>${escapeXml(sellerAddr.postalCode)}</cbc:PostalZone>`)
  lines.push(`        <cac:Country><cbc:IdentificationCode>BE</cbc:IdentificationCode></cac:Country>`)
  lines.push(`      </cac:PostalAddress>`)
  lines.push(`      <cac:PartyTaxScheme>`)
  lines.push(`        <cbc:CompanyID>${escapeXml(sellerVAT)}</cbc:CompanyID>`)
  lines.push(`        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`)
  lines.push(`      </cac:PartyTaxScheme>`)
  lines.push(`      <cac:PartyLegalEntity>`)
  lines.push(`        <cbc:RegistrationName>${escapeXml(sellerLegalName)}</cbc:RegistrationName>`)
  lines.push(`        <cbc:CompanyID schemeID="0208">${escapeXml(sellerKBO)}</cbc:CompanyID>`)
  lines.push(`      </cac:PartyLegalEntity>`)
  if (establishment.phone) {
    lines.push(`      <cac:Contact><cbc:Telephone>${escapeXml(establishment.phone)}</cbc:Telephone></cac:Contact>`)
  }
  lines.push(`    </cac:Party>`)
  lines.push(`  </cac:AccountingSupplierParty>`)

  // Buyer
  lines.push(`  <cac:AccountingCustomerParty>`)
  lines.push(`    <cac:Party>`)
  if (buyerKBO) {
    lines.push(`      <cbc:EndpointID schemeID="0208">${escapeXml(buyerKBO)}</cbc:EndpointID>`)
  } else if (invoice.customer_email) {
    lines.push(`      <cbc:EndpointID schemeID="EM">${escapeXml(invoice.customer_email)}</cbc:EndpointID>`)
  }
  lines.push(`      <cac:PartyName><cbc:Name>${escapeXml(invoice.customer_name)}</cbc:Name></cac:PartyName>`)
  lines.push(`      <cac:PostalAddress>`)
  lines.push(`        <cbc:StreetName>${escapeXml(buyerAddr.street)}</cbc:StreetName>`)
  if (buyerAddr.city) lines.push(`        <cbc:CityName>${escapeXml(buyerAddr.city)}</cbc:CityName>`)
  if (buyerAddr.postalCode) lines.push(`        <cbc:PostalZone>${escapeXml(buyerAddr.postalCode)}</cbc:PostalZone>`)
  lines.push(`        <cac:Country><cbc:IdentificationCode>BE</cbc:IdentificationCode></cac:Country>`)
  lines.push(`      </cac:PostalAddress>`)
  if (buyerVAT) {
    lines.push(`      <cac:PartyTaxScheme>`)
    lines.push(`        <cbc:CompanyID>${escapeXml(buyerVAT)}</cbc:CompanyID>`)
    lines.push(`        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`)
    lines.push(`      </cac:PartyTaxScheme>`)
  }
  lines.push(`      <cac:PartyLegalEntity>`)
  lines.push(`        <cbc:RegistrationName>${escapeXml(invoice.customer_name)}</cbc:RegistrationName>`)
  if (buyerKBO) {
    lines.push(`        <cbc:CompanyID schemeID="0208">${escapeXml(buyerKBO)}</cbc:CompanyID>`)
  }
  lines.push(`      </cac:PartyLegalEntity>`)
  lines.push(`    </cac:Party>`)
  lines.push(`  </cac:AccountingCustomerParty>`)

  // PaymentMeans
  lines.push(`  <cac:PaymentMeans>`)
  lines.push(`    <cbc:PaymentMeansCode>${paymentMeansCode}</cbc:PaymentMeansCode>`)
  lines.push(`    <cbc:PaymentID>${escapeXml(invoice.invoice_number)}</cbc:PaymentID>`)
  if (paymentMeansCode === '30') {
    // Virement → IBAN SBURGS (hardcodé pour l'instant, à passer en config)
    lines.push(`    <cac:PayeeFinancialAccount>`)
    lines.push(`      <cbc:ID>BE90751213059732</cbc:ID>`)
    lines.push(`      <cac:FinancialInstitutionBranch><cbc:ID>AXABBE22</cbc:ID></cac:FinancialInstitutionBranch>`)
    lines.push(`    </cac:PayeeFinancialAccount>`)
  }
  lines.push(`  </cac:PaymentMeans>`)

  // PaymentTerms
  lines.push(`  <cac:PaymentTerms>`)
  lines.push(`    <cbc:Note>Paiement à ${data.dueDateDaysFromIssue ?? 30} jours date de facture</cbc:Note>`)
  lines.push(`  </cac:PaymentTerms>`)

  // TaxTotal
  lines.push(`  <cac:TaxTotal>`)
  lines.push(`    <cbc:TaxAmount currencyID="EUR">${totalTaxAmount.toFixed(2)}</cbc:TaxAmount>`)
  for (const sub of taxSubtotals) {
    lines.push(`    <cac:TaxSubtotal>`)
    lines.push(`      <cbc:TaxableAmount currencyID="EUR">${sub.taxable.toFixed(2)}</cbc:TaxableAmount>`)
    lines.push(`      <cbc:TaxAmount currencyID="EUR">${sub.tax.toFixed(2)}</cbc:TaxAmount>`)
    lines.push(`      <cac:TaxCategory>`)
    lines.push(`        <cbc:ID>S</cbc:ID>`)
    lines.push(`        <cbc:Percent>${sub.rate.toFixed(2)}</cbc:Percent>`)
    lines.push(`        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`)
    lines.push(`      </cac:TaxCategory>`)
    lines.push(`    </cac:TaxSubtotal>`)
  }
  lines.push(`  </cac:TaxTotal>`)

  // LegalMonetaryTotal
  lines.push(`  <cac:LegalMonetaryTotal>`)
  lines.push(`    <cbc:LineExtensionAmount currencyID="EUR">${totalLineExt.toFixed(2)}</cbc:LineExtensionAmount>`)
  lines.push(`    <cbc:TaxExclusiveAmount currencyID="EUR">${totalTaxExclusive.toFixed(2)}</cbc:TaxExclusiveAmount>`)
  lines.push(`    <cbc:TaxInclusiveAmount currencyID="EUR">${totalTaxInclusive.toFixed(2)}</cbc:TaxInclusiveAmount>`)
  lines.push(`    <cbc:PayableAmount currencyID="EUR">${payableAmount.toFixed(2)}</cbc:PayableAmount>`)
  lines.push(`  </cac:LegalMonetaryTotal>`)

  // InvoiceLines
  for (const line of flatLines) {
    lines.push(`  <cac:InvoiceLine>`)
    lines.push(`    <cbc:ID>${line.id}</cbc:ID>`)
    lines.push(`    <cbc:Note>Cmd #${escapeXml(line.orderNumber)}</cbc:Note>`)
    lines.push(`    <cbc:InvoicedQuantity unitCode="C62">${line.quantity}</cbc:InvoicedQuantity>`)
    lines.push(`    <cbc:LineExtensionAmount currencyID="EUR">${line.lineExtAmount.toFixed(2)}</cbc:LineExtensionAmount>`)
    lines.push(`    <cac:Item>`)
    lines.push(`      <cbc:Name>${escapeXml(line.productName)}</cbc:Name>`)
    lines.push(`      <cac:ClassifiedTaxCategory>`)
    lines.push(`        <cbc:ID>S</cbc:ID>`)
    lines.push(`        <cbc:Percent>${line.vatRate.toFixed(2)}</cbc:Percent>`)
    lines.push(`        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`)
    lines.push(`      </cac:ClassifiedTaxCategory>`)
    lines.push(`    </cac:Item>`)
    lines.push(`    <cac:Price>`)
    lines.push(`      <cbc:PriceAmount currencyID="EUR">${line.unitPriceHT.toFixed(2)}</cbc:PriceAmount>`)
    lines.push(`    </cac:Price>`)
    lines.push(`  </cac:InvoiceLine>`)
  }

  lines.push(`</Invoice>`)
  return lines.join('\n')
}
