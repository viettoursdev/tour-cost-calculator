export type HotelEntry = Record<string, unknown>;
export type OtherRateEntry = Record<string, unknown>;
export type VisaRates = Record<string, unknown>;

export type RateCard = {
  hotels: Record<string, HotelEntry[]>;   // keyed by city (vte_hotels_v2_<city>)
  visaRates: VisaRates;                   // vte_visa_rates
  otherRates: Record<string, OtherRateEntry>; // vte_rate_* keys
};

export type RateCardMeta = {
  version: string;
  type: string;
  pushedAt: string;       // ISO date
  pushedBy: string;
  app: string;
  autoSync: boolean;
};

export type RateCardDoc = RateCard & { _meta?: RateCardMeta };
