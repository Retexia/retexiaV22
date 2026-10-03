import type { Translate } from "./translate";
import type { ValidationMessages } from "./engine";

/** Validation messages from site_strings (same texts on client and server). */
export function validationMessages(t: Translate): ValidationMessages {
  return {
    required: t("form.error.required", "Please fill this in"),
    email: t("form.error.email", "Enter a valid email address"),
    phone: t("form.error.phone", "Enter a valid phone number, like +94 77 123 4567"),
    url: t("form.error.url", "Enter a full link, like https://example.com"),
    number: t("form.error.number", "Enter a number"),
    tooShort: (n) => t("form.error.too_short", "Use at least {n} characters", { n }),
    tooLong: (n) => t("form.error.too_long", "Use at most {n} characters", { n }),
    tooSmall: (n) => t("form.error.too_small", "Enter {n} or more", { n }),
    tooLarge: (n) => t("form.error.too_large", "Enter {n} or less", { n }),
    chooseAtLeast: (n) => t("form.error.choose_at_least", "Choose at least {n}", { n }),
    chooseAtMost: (n) => t("form.error.choose_at_most", "Choose at most {n}", { n }),
    invalidOption: t("form.error.invalid_option", "Choose one of the options"),
  };
}
