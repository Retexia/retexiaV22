/**
 * Kinds of app notification a person can mute (Account → Notifications in the app). Keys match
 * public.notification_prefs.muted: an exact event, or "<kind>.*" for every event of that kind
 * (see public.queue_push, migration 0044).
 */
export const PUSH_KINDS = [
  { key: "lingo_feeder.call", label: "Call them", hint: "A customer is waiting for your call", product: "feeder" },
  { key: "lingo_feeder.order", label: "New orders", hint: "A customer confirmed an order", product: "feeder" },
  { key: "lingo_feeder.number", label: "WhatsApp number problems", hint: "Lingo can't answer on your number", product: "feeder" },
  { key: "order.*", label: "Your products", hint: "Being set up, ready, free trial started", product: null },
] as const;
export const PUSH_KEYS = PUSH_KINDS.map((k) => k.key) as [string, ...string[]];
