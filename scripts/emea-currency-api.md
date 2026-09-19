# Regional pipeline currency contract

`GET /api/regions/emea` returns currency information on every item in both `data.summary` and `data.regions`. The shared Americas endpoint follows the same safe aggregation behavior.

```json
{
  "name": "UK & Ireland",
  "lead_count": 420,
  "pipeline_value": 1200000000,
  "currency": "GBP",
  "pipeline_totals": [{ "currency": "GBP", "pipeline_value": 1200000000, "bid_count": 10 }],
  "reporting_currency": "GBP",
  "reporting_currency_source": "design_reference_pending_confirmation",
  "unknown_currency_bid_count": 0,
  "unknown_value_bid_count": 0,
  "conversion_date": null
}
```

The example is illustrative, not actual lead counts or amounts.

- `currency` is the explicit source currency of `pipeline_value`, never guessed from geography. Both are populated only when all linked bids have known values in one known currency. No linked bids yields `pipeline_value: 0, currency: null`.
- Mixed currencies or any unknown value/currency yield `pipeline_value: null, currency: null`. Render `pipeline_totals` separately instead. Totals include only priced bids in known currencies; the unknown counters disclose omitted bids. Unknown-currency amounts are never added together.
- `pipeline_totals` contains one subtotal per ISO currency. No FX conversion occurs, so `conversion_date` is null. A UK bid recorded in USD remains USD, not GBP.
- `reporting_currency` is the explicit design reference, separate from the actual amount currency. Business confirmation has been requested; it is not yet claimed. Reference mappings: UK & Ireland GBP; DACH / Northern Europe and Southern Europe EUR; Middle East (GCC) and Africa USD; Americas regions (North America, Latin America) USD. Unspecified regions have null. `reporting_currency_source` marks the pending confirmation.
- Only bids linked to included, non-archived leads count. Null-valued bids remain unknown rather than zero. Pagination reads all rows, avoiding a 1,000-row cap. Query failures produce an error rather than a zero pipeline.

## Source currency storage

The live schema check on 2026-09-14 found no `bids.currency`. Apply `scripts/bid-currency-migration.sql` in Supabase SQL Editor. Existing values remain unclassified: no geography-based backfill is performed.

`POST /api/bids` and `PATCH /api/bids/{id}` accept an optional `currency` field (ISO 4217; normalized to uppercase; null means unknown). Omission preserves existing behavior. New records without currency remain unknown. The legacy move-to-pipeline RPC and CSV import do not set currency; assign it afterward using the bid PATCH endpoint from an authoritative source.

Until the column is installed, the regional endpoint still responds, but values cannot be presented as known-currency totals. `data.data_availability.bid_currency` is false. No SQL access is configured in this workspace to apply the migration automatically.

## Country counts and recommended tools: data requested

- `countries` is null when no country field exists. When available, it contains actual counts grouped by the recorded country field. `country_counts_complete` identifies full coverage; `country_unassigned_lead_count` counts leads without a country. Country labels are written by the AI enrichment pipeline, not inferred from region, company names, or IP addresses; NULL means enrichment could not confidently determine a value.
- `recommended_tools` is null, with `recommended_tools_status: "awaiting_approved_source"`. No recommendations are fabricated from `application_tools` (tools already used by a lead).

## AI country/region enrichment (in this backend)

The backend auto-fills `country` (specific, e.g. Saudi Arabia) and `region` (broad, one of `src/config/regions.ts`) via OpenRouter.

- `POST /api/leads` enriches when `country`/`region` are omitted; `PATCH /api/leads/{id}` enriches only a field that is still NULL in storage (never overwrites an admin-set value or one supplied in the request).
- `OPENROUTER_API_KEY` is required; without it enrichment is skipped and the lead keeps NULLs. `OPENROUTER_BASE_URL` defaults to `https://openrouter.ai/api/v1`, `OPENROUTER_MODEL` to `openai/gpt-4o-mini`.
- Failed/timeout AI calls never fail the lead write — country/region stay NULL and are retried on the next create/update.
- To fill the historical backlog: `bun run scripts/enrich-leads.ts` (paginates leads with NULL country/region, enriches, updates).
- Blank strings (`""`) are treated as "unknown" and stored as NULL; they never fail validation.

Requested from the data/product owner:
1. Confirm the reporting-currency mapping above as a business policy.
2. Confirm the AI enrichment pipeline (now built into this backend via OpenRouter) writing `country` (specific country, e.g. Saudi Arabia) and `region` (broader classification, e.g. EMEA or Americas) on each lead, including the active/archived filter, reporting date, and missing-country coverage. The lead create/update/import endpoints accept and store these values as free text; `GET /leads/options` derives its countries list from distinct recorded values.
3. Provide the approved recommended-tools list for each region, including tool names/IDs, order, rationale, owner, and refresh cadence, or identify the rules/data source that produces it.

The frontend must handle null currency/amount/countries/tools. Never format a pipeline amount using `reporting_currency` unless an explicit conversion has actually produced that amount.
