# Meesho — AOV Algorithm Prototype

Case-competition prototype (Case 9: Meesho). It shows how persona-aware
recommendations, bundles and checkout nudges can lift **average order value**
above today's ₹260–274, plus BNPL for buyers and a seller hub with stock
planning, credit, insurance and return-rate warnings.

Live: https://sdshreyas.github.io/meesho/

## What's inside

| Area | Where |
| --- | --- |
| Recommendation engine (explainable "Why this?" scores, diversity re-rank) | `src/engine/recommend.js` |
| Nudge rules: free-delivery bar, multi-item discount, bundles, reseller packs, COD fee waiver | `src/engine/pricing.js`, `src/engine/config.js` |
| BNPL plans + credit limit from platform data | `src/engine/pricing.js` (`creditLimit`, `bnplOffer`) |
| Valmo shipment simulator (live map) | `src/engine/logistics.js` |
| Seller analytics: forecast, reorder qty, returns, credit, insurance | `src/engine/seller.js` |
| Fake REST API (Mock Service Worker) | `src/mocks/handlers.js` |
| Fake database: 100 products, personas, sellers | `src/data/` |
| 23 languages via free translation APIs + offline fallback | `src/i18n/` |

## API (served in-browser by MSW)

```
GET  /api/profiles
GET  /api/products?persona=U1&category=&q=&nudges=1
GET  /api/products/:id?persona=U1
GET  /api/bundles?persona=U1
POST /api/cart/quote        { lines, personaId, payment, nudges }
POST /api/orders            { lines, personaId, payment, plan }
GET  /api/orders?persona=U1
GET  /api/orders/:id/tracking
GET  /api/sellers/:id/dashboard
POST /api/sellers/:id/insurance   { plan, enrolled }
POST /api/sellers/:id/loans       { loan }
```

## Demo script

1. **Viewing as → Priya (Lucknow)**: the page switches to Hindi, and the feed shows budget women's fashion with "Why this?" reasons.
2. Toggle **AI Nudges OFF/ON** to compare the plain popularity feed with the personalised one.
3. Open a kurti, then **Add bundle** ("Complete the look", 12% off).
4. **Cart**: free-delivery progress bar, "add 1 more for 5% off", and gap-filler suggestions.
5. Pay with **Buy Now, Pay Later**: the limit and plans come from the persona's credit data.
6. **Place order**, then watch the live Valmo tracking map (1 minute ≈ 1 day).
7. Switch to **Sunita (Surat, reseller)**: Gujarati, pack-of-3/5 wholesale pricing and margin hints.
8. Switch to **Kavya Fashions (seller)**: Diwali forecast, stock to add per SKU, return-rate warnings and fees, credit line, insurance.

## Run locally

```bash
npm install
npm run dev     # http://localhost:5173/meesho/
```

Regenerate data: `node scripts/build-catalog.mjs` (products and images),
`node scripts/pretranslate.mjs` (offline translations).

## Deploy

Push to `main` on `github.com/sdshreyas/meesho`. In the repo settings, set
**Settings → Pages → Source** to **GitHub Actions**. The workflow in
`.github/workflows/deploy.yml` builds and publishes the site.

Product photos come from the free dummyjson.com API. All data is fictional.
