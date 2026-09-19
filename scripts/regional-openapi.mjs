export const applyRegionalOpenapi = spec => {
  const ref = name => ({ $ref: `#/components/schemas/${name}` });
  const currency = { type: "string", nullable: true, pattern: "^[A-Z]{3}$", description: "Explicit source ISO currency; null when unknown. Never inferred from geography." };
  const symbol = { type: "string", nullable: true, description: "Rendered currency symbol for display (e.g. £, $, ₦); null when the currency is unknown." };
  for (const name of ["Bid", "CreateBidInput", "UpdateBidInput"]) {
    if (spec.components.schemas[name]?.properties) spec.components.schemas[name].properties.currency = currency;
  }
  spec.components.schemas.RegionalPipeline = { type: "object", required: ["pipeline_value", "currency", "pipeline_totals"], properties: {
    pipeline_value: { type: "number", nullable: true, description: "A total only when all bids have known values in one source currency; null for mixed/unknown/incomplete totals. Zero for no bids." },
    currency,
    currency_symbol: symbol,
    pipeline_totals: { type: "array", description: "Separate subtotals for known values in each source currency. Never combine these without conversion.", items: { type: "object", properties: { currency: { type: "string", pattern: "^[A-Z]{3}$" }, currency_symbol: symbol, pipeline_value: { type: "number" }, bid_count: { type: "integer" } } } },
    reporting_currency: { type: "string", nullable: true, description: "Design reference only: UK & Ireland GBP; DACH/Northern Europe and Southern Europe EUR; Middle East (GCC) and Africa USD; Americas regions USD. Business confirmation pending; never use to relabel amounts." },
    reporting_currency_symbol: symbol,
    reporting_currency_source: { type: "string", nullable: true, enum: ["design_reference_pending_confirmation", null] },
    unknown_currency_bid_count: { type: "integer" }, unknown_value_bid_count: { type: "integer" },
    conversion_date: { type: "string", format: "date", nullable: true, description: "Always null: no FX conversion is performed." },
  } };
  spec.components.schemas.RegionalSummary = { allOf: [ref("RegionalPipeline"), { type: "object", properties: { name: { type: "string" }, lead_count: { type: "integer" } } }] };
  spec.components.schemas.RegionalPanel = { allOf: [ref("RegionalSummary"), { type: "object", properties: {
    bids_count: { type: "integer" }, inflight_count: { type: "integer" },
    countries: { type: "array", nullable: true, description: "Actual counts from recorded country values; null when the source field is unavailable.", items: { type: "object", properties: { name: { type: "string" }, lead_count: { type: "integer" } } } },
    country_counts_complete: { type: "boolean" }, country_unassigned_lead_count: { type: "integer" },
    recommended_tools: { type: "array", nullable: true, items: { type: "string" }, description: "Currently null pending an approved recommendation source." },
    recommended_tools_status: { type: "string", enum: ["awaiting_approved_source"] }, strategy: { type: "string" },
  } }] };
  const dashboard = { type: "object", properties: {
    summary: { type: "array", items: ref("RegionalSummary") }, regions: { type: "array", items: ref("RegionalPanel") }, workflow: { type: "array", items: { type: "object" } },
    data_availability: { type: "object", properties: { bid_currency: { type: "boolean" }, lead_country: { type: "boolean" }, recommended_tools: { type: "boolean" } } },
  } };
  for (const scope of ["emea", "americas"]) spec.paths[`/api/regions/${scope}`] = { get: {
    tags: ["Regions"], summary: `Get ${scope.toUpperCase()} regional dashboard`, security: [{ bearerAuth: [] }],
    description: "Source-currency-safe pipeline totals. Single source currencies can be formatted using currency. Mixed currencies have null scalar totals and separate pipeline_totals. No geographic inference or FX conversion. Recommended tools data is explicitly unavailable.",
    responses: {
      200: { description: "Regional dashboard", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: dashboard } } } } },
      401: { description: "Authentication required" }, 500: { description: "Failed to load source data" },
    },
  } };
};
