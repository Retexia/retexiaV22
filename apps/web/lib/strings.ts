/**
 * UI text from the site_strings table. `t(key, fallback)` returns the value
 * from Supabase, or the fallback written in code when the key is missing.
 * `{name}` placeholders are filled from `vars`.
 *
 * Keep calls on the form t("some.key", "Fallback text") with literal strings:
 * scripts/extract-strings.mjs reads them to build the site_strings seed.
 */
export { makeT, type Translate } from "@retexia/forms";
