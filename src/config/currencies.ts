import { z } from "zod/v4";

const currencyCodes = new Set(Intl.supportedValuesOf("currency"));
export const currencySchema = z.string().trim().toUpperCase().refine(value => currencyCodes.has(value), "Use a supported ISO 4217 currency code");
export const knownCurrency = (value: unknown): string | null => {
  const result = currencySchema.safeParse(value);
  return result.success ? result.data : null;
};
export const currencySymbol = (value: unknown): string | null => {
  const code = knownCurrency(value);
  if (!code) return null;
  try {
    const symbol = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find(part => part.type === "currency")?.value;
    return symbol?.trim() ? symbol : code;
  } catch {
    return code;
  }
};
export const singleCurrency = (items: ReadonlyArray<{ currency?: unknown }>): string | null => {
  const currencies = new Set<string>();
  for (const item of items) {
    const code = knownCurrency(item.currency);
    if (code) currencies.add(code);
  }
  return currencies.size === 1 ? [...currencies][0]! : null;
};

// Explicit design reference, pending business confirmation. Never classifies bid amounts.
export const EMEA_REFERENCE_REPORTING_CURRENCIES: Readonly<Record<string, string>> = {
  "UK & Ireland": "GBP", "DACH / Northern Europe": "EUR", "Southern Europe": "EUR",
  "Middle East (GCC)": "USD", "Africa": "USD",
};
export const AMERICAS_REFERENCE_REPORTING_CURRENCIES: Readonly<Record<string, string>> = {
  "North America": "USD", "Latin America": "USD",
};
