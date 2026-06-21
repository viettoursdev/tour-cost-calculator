// tests/etl/fixtures/expected.mjs — counts/checksums derived from the sample dump.
export const EXPECTED = {
  profiles: 3,
  customers: 1, customer_contacts: 1, customer_interactions: 1,
  suppliers: 1, supplier_contacts: 0, ncc_products: 1, ncc_product_prices: 1,
  contracts: 1, contract_payments: 1, contract_cancels: 1,
  rate_card_hotels: 1, rate_card_other: 1, rate_card_visa: 1, rate_card_meta: 1,
  fx_rates: 2, restaurants: 1, restaurant_menus: 1,
  visa_products: 1, visa_product_fees: 1, visa_products_meta: 1,
  pois: 1,
  quotes: 2,                 // 1 regular + 1 dmc
  quote_line_items: 1, quote_groups: 0, quote_payments: 1, quote_passengers: 1,
  quote_workflow_steps: 1, quote_workflow_logs: 1, quote_versions: 1,
  itineraries: 1, itinerary_days: 1, itinerary_flights: 1,
  menus: 1, menu_days: 1,
  visa_procedures: 1, visa_projects: 1,
  tour_payments: 1, payment_records: 1, custom_cost_items: 1,
  payment_approvals: 1, payment_approval_stages: 1,
  notifications: 1, notification_threads: 1, notification_thread_members: 2, notification_comments: 1,
  chats: 1, chat_members: 2, chat_messages: 1,
  // checksums
  sum_total_cost: 12200,     // 5000 + 7200
  sum_fx_rate_to_vnd: 52000, // 25000 + 27000
  // identity
  unmapped_usernames: ['ghost'],
};
