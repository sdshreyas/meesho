// Meesho FinHub reference data: partner banks / NBFCs / insurers / rails, Valmo crew,
// lending & insurance products. Partner names are illustrative for the case study —
// no real partnership is implied. Rates are indicative.

export const PARTNER_TYPES = {
  bank: 'Bank',
  nbfc: 'NBFC (MSME & retail lender)',
  insurer: 'Insurer',
  rail: 'Regulated rails & infrastructure',
}

export const PARTNERS = [
  // ---- banks: lowest cost of funds, best for high scores & bigger tickets
  { id: 'sbi', name: 'State Bank of India', short: 'SBI', type: 'bank', color: '#1a5ea8', spread: -0.75, fee: 1, lspFee: 2.5, minScore: 780, products: ['seller_wc'], blurb: 'Largest PSU bank — cheapest working capital for top sellers', rbi: 'Scheduled Commercial Bank' },
  { id: 'axis', name: 'Axis Bank', short: 'Axis', type: 'bank', color: '#97144d', spread: -0.25, fee: 1.25, lspFee: 2.5, minScore: 700, products: ['seller_wc', 'buyer_paylater', 'captain_wc'], blurb: 'Working capital + Pay Later as a pre-sanctioned credit line on UPI', rbi: 'Scheduled Commercial Bank' },
  { id: 'idfc', name: 'IDFC First Bank', short: 'IDFC', type: 'bank', color: '#9c1d26', spread: 0, fee: 1.5, lspFee: 2.75, minScore: 680, products: ['seller_wc', 'reseller_micro', 'buyer_paylater', 'crew_ev'], blurb: 'Digital-first MSME & consumer lending', rbi: 'Scheduled Commercial Bank' },
  { id: 'kotak', name: 'Kotak Mahindra Bank', short: 'Kotak', type: 'bank', color: '#ed1c24', spread: 0.25, fee: 1.5, lspFee: 2.5, minScore: 700, products: ['seller_wc', 'buyer_paylater', 'truck_topup'], blurb: 'Business loans and vehicle top-ups', rbi: 'Scheduled Commercial Bank' },
  // ---- NBFCs: thin-file, cash-flow underwriting for tier-2/3
  { id: 'neogrowth', name: 'NeoGrowth', short: 'NeoGrowth', type: 'nbfc', color: '#f26522', spread: 2, fee: 2, lspFee: 3, minScore: 620, products: ['seller_wc', 'captain_wc'], blurb: 'Retail MSME loans repaid from daily sales', rbi: 'NBFC-ICC' },
  { id: 'indifi', name: 'Indifi', short: 'Indifi', type: 'nbfc', color: '#2bb673', spread: 2.5, fee: 2, lspFee: 3, minScore: 600, products: ['seller_wc', 'captain_wc'], blurb: 'Revenue-based financing for online sellers', rbi: 'NBFC (via partner)' },
  { id: 'lendingkart', name: 'Lendingkart', short: 'Lendingkart', type: 'nbfc', color: '#0b4f9c', spread: 3, fee: 2, lspFee: 3, minScore: 600, products: ['seller_wc', 'reseller_micro', 'crew_advance'], blurb: 'Fast, small-ticket business credit', rbi: 'NBFC-ICC' },
  { id: 'northernarc', name: 'Northern Arc', short: 'N. Arc', type: 'nbfc', color: '#00687a', spread: 1.5, fee: 1.5, lspFee: 3, minScore: 580, products: ['reseller_micro', 'crew_ev', 'crew_advance'], blurb: 'Micro-credit for women entrepreneurs & gig workers', rbi: 'NBFC-ICC' },
  { id: 'poonawalla', name: 'Poonawalla Fincorp', short: 'Poonawalla', type: 'nbfc', color: '#5c2d91', spread: 1.75, fee: 1.75, lspFee: 2.75, minScore: 640, products: ['crew_ev', 'truck_topup'], blurb: 'EV two-wheeler and commercial-vehicle loans', rbi: 'NBFC-ICC' },
  // ---- insurers (Meesho acts as Corporate Agent)
  { id: 'acko', name: 'Acko General Insurance', short: 'Acko', type: 'insurer', color: '#5420c2', commission: 18, blurb: 'API-first micro policies — issues the ₹2/parcel Valmo Transit Shield in milliseconds', irdai: 'General insurer' },
  { id: 'digit', name: 'Go Digit General Insurance', short: 'Digit', type: 'insurer', color: '#ffd200', commission: 17, blurb: 'Group personal-accident cover for Valmo crew', irdai: 'General insurer' },
  { id: 'icici_lombard', name: 'ICICI Lombard', short: 'ICICI Lombard', type: 'insurer', color: '#b02a30', commission: 20, blurb: 'Godown fire & burglary, cargo cover', irdai: 'General insurer' },
  { id: 'care', name: 'Care Health Insurance', short: 'Care Health', type: 'insurer', color: '#00a19a', commission: 22, blurb: 'Hospital cash for solo sellers and resellers', irdai: 'Standalone health insurer' },
  // ---- rails
  { id: 'finvu', name: 'Finvu (Account Aggregator)', short: 'Finvu AA', type: 'rail', color: '#1f6feb', blurb: 'Consent-based bank-statement sharing for loans above ₹2 lakh', role: 'RBI NBFC-AA' },
  { id: 'npci', name: 'NPCI — e-NACH & UPI credit line', short: 'NPCI', type: 'rail', color: '#e8730c', blurb: 'Back-up auto-debit mandates and credit lines on UPI', role: 'Payment system operator' },
  { id: 'castler', name: 'Castler escrow (trustee bank)', short: 'Castler', type: 'rail', color: '#0e7c66', blurb: 'Tripartite escrow: splits each seller payout into lender repayment + seller share', role: 'Escrow platform with trustee bank' },
  { id: 'perfios', name: 'Perfios', short: 'Perfios', type: 'rail', color: '#444', blurb: 'GST & bank-statement analytics for larger tickets', role: 'Data analytics' },
]
export const partnerById = Object.fromEntries(PARTNERS.map((p) => [p.id, p]))

// Lending products. tenure in months (days for Pay Later). repay: how repayment works.
export const LOAN_PRODUCTS = {
  seller_wc: { label: 'Working capital & stock loan', who: 'seller', min: 25000, max: 500000, tenures: [3, 6, 9, 12], repay: 'Auto-deducted from weekly Meesho payouts via escrow (+ e-NACH back-up)' },
  reseller_micro: { label: 'Reseller micro-loan', who: 'reseller', min: 2000, max: 15000, tenures: [3, 6], repay: 'Small weekly auto-debit (e-NACH)' },
  buyer_paylater: { label: 'Meesho Pay Later', who: 'buyer', min: 500, max: 2500, tenures: [15, 30], days: true, repay: 'Pay the full amount by the due date — 0% interest' },
  crew_ev: { label: 'EV two-wheeler loan', who: 'pilot', min: 40000, max: 110000, tenures: [12, 18, 24], repay: 'Auto-deducted from weekly Valmo earnings' },
  crew_advance: { label: 'Fuel & maintenance advance', who: 'pilot', min: 3000, max: 20000, tenures: [1, 2, 3], repay: 'Auto-deducted from weekly Valmo earnings' },
  captain_wc: { label: 'Airhub working capital', who: 'captain', min: 50000, max: 300000, tenures: [6, 12], repay: 'Auto-deducted from Airhub handling payouts' },
  truck_topup: { label: 'Vehicle top-up / tyre loan', who: 'driver', min: 50000, max: 200000, tenures: [6, 12, 18], repay: 'Monthly EMI via e-NACH' },
}

// Insurance products (Meesho as IRDAI Corporate Agent)
export const INSURANCE_PRODUCTS = {
  transit_shield: { label: 'Valmo Transit & RTO Shield', insurer: 'acko', who: 'seller', price: 2, unit: 'per parcel', cover: 'Up to ₹1,000 per parcel against loss, theft, water damage or torn packaging during delivery or return. Claims settle automatically from Valmo hub scans — no documents.', optIn: true },
  godown: { label: 'Godown All-Risk Shield', insurer: 'icici_lombard', who: 'seller', price: 149, unit: 'per month', cover: 'Fire, burglary and flood cover for up to ₹3 lakh of stock at your shop or godown.', optIn: true },
  hospicash: { label: 'Hospital Cash Cover', insurer: 'care', who: 'seller', price: 49, unit: 'per month', cover: '₹1,000 for every day you are in hospital, so your income does not stop.', optIn: true },
  crew_pa: { label: 'Valmo Crew Protect (default)', insurer: 'digit', who: 'crew', price: 38, unit: 'per month · paid by Valmo', cover: '₹5 lakh personal accident + ₹500/day hospital cash + ₹1 lakh accidental medical. Active from day one for every Valmo Pilot, Captain and line-haul driver.', default: true },
  truck_cargo: { label: 'Line-haul Cargo & Driver Cover (default)', insurer: 'icici_lombard', who: 'driver', price: 95, unit: 'per month · paid by fleet', cover: 'Cargo in transit up to ₹10 lakh per trip + ₹10 lakh driver personal accident.', default: true },
}

// Valmo crew (not login accounts) — scored and insured through FinHub
export const CREW = [
  { id: 'C1', type: 'pilot', role: 'Valmo Pilot · last mile (2-wheeler)', name: 'Ramesh Yadav', city: 'Lucknow', node: 'Valmo Airhub, Lucknow', tenureMonths: 14, deliveries: 2840, successRate: 0.96, attendance: 0.92, rating: 4.7, codDeposit: 0.99, monthlyEarnings: 19500, products: ['crew_ev', 'crew_advance'], insurance: ['crew_pa'] },
  { id: 'C2', type: 'pilot', role: 'Valmo Pilot · first mile (e-3-wheeler)', name: 'Arif Khan', city: 'Surat', node: 'Valmo Airhub, Surat', tenureMonths: 7, deliveries: 1210, successRate: 0.93, attendance: 0.88, rating: 4.4, codDeposit: 0.97, monthlyEarnings: 21500, products: ['crew_ev', 'crew_advance'], insurance: ['crew_pa'] },
  { id: 'C3', type: 'captain', role: 'Valmo Captain · Airhub micro-entrepreneur', name: 'Meena Kumari', city: 'Jhansi', node: 'Valmo Airhub, Jhansi', tenureMonths: 22, deliveries: 18600, successRate: 0.97, attendance: 0.98, rating: 4.8, codDeposit: 1, monthlyEarnings: 85000, products: ['captain_wc'], insurance: ['crew_pa'] },
  { id: 'C4', type: 'driver', role: 'Line-haul driver · 32 ft container (partner fleet)', name: 'Sukhwinder Singh', city: 'Ludhiana', node: 'Valmo Base, Ludhiana', tenureMonths: 36, deliveries: 310, successRate: 0.91, attendance: 0.94, rating: 4.6, codDeposit: 1, monthlyEarnings: 38000, products: ['truck_topup'], insurance: ['crew_pa', 'truck_cargo'] },
]

// DPDP: exactly which fields each product needs (data minimisation)
export const DATA_FIELDS = {
  seller_wc: [
    ['sales', 'Last 12 months sales ledger (monthly totals)'], ['dispatch', 'Valmo on-time dispatch rate'], ['returns', 'Return & RTO rates'],
    ['ads', 'Meesho Ads return on ad spend'], ['tenure', 'Months selling on Meesho'], ['kyc', 'Name, PAN, GSTIN & bank account (for KYC and disbursal)'],
  ],
  reseller_micro: [['resale', 'Reseller orders & WhatsApp/Facebook conversion'], ['margin', 'Margin consistency'], ['returns', 'Return rate'], ['kyc', 'Name, PAN & bank account']],
  buyer_paylater: [['cod', 'Cash-on-Delivery acceptance at the doorstep'], ['orders', 'Order frequency & months on Meesho'], ['repay', 'Past Pay Later repayment record'], ['kyc', 'Name, mobile & PAN (for KYC)']],
  crew_ev: [['earnings', 'Weekly Valmo earnings'], ['success', 'Delivery success rate & attendance'], ['tenure', 'Months with Valmo'], ['kyc', 'Name, PAN, licence & bank account']],
  crew_advance: [['earnings', 'Weekly Valmo earnings'], ['attendance', 'Attendance'], ['kyc', 'Name & bank account']],
  captain_wc: [['handling', 'Airhub parcels handled & payouts'], ['sla', 'Airhub SLA'], ['tenure', 'Months as Captain'], ['kyc', 'Name, PAN, GSTIN & bank account']],
  truck_topup: [['trips', 'Line-haul trips & on-time rate'], ['tenure', 'Months with Valmo'], ['kyc', 'Name, PAN, RC & bank account']],
}

export const DPDP = {
  fiduciary: 'Fashnear Technologies (Meesho) — Data Fiduciary',
  dpo: { name: 'Data Protection Officer, Meesho', email: 'dpo@meesho.example', phone: '080-0000-0000' },
  grievance: { name: 'Grievance Officer, Meesho FinHub', email: 'grievance.finhub@meesho.example' },
  retentionDays: 180,
  consentValidityDays: 365,
}
