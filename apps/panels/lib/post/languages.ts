/** Caption and on-picture languages (Sinhala first: most Retexia Post customers write in Sinhala). */
export type CaptionLanguage = "si" | "en" | "ta" | "singlish" | "si_en";
export type DesignLanguage = "si" | "en" | "ta";

export const CAPTION_LANGUAGES: { value: CaptionLanguage; label: string; description: string }[] = [
  { value: "si", label: "සිංහල · Sinhala", description: "Everyday Sri Lankan Sinhala in Sinhala letters." },
  { value: "si_en", label: "Sinhala + English", description: "Sinhala, with a short English line." },
  { value: "singlish", label: "Singlish", description: "Sinhala written in English letters, the way people text." },
  { value: "en", label: "English", description: "Simple, friendly English." },
  { value: "ta", label: "தமிழ் · Tamil", description: "Sri Lankan Tamil in Tamil letters." },
];

export const DESIGN_LANGUAGES: { value: DesignLanguage; label: string; description: string }[] = [
  { value: "si", label: "සිංහල · Sinhala", description: "Headline and text on the picture in Sinhala letters." },
  { value: "en", label: "English", description: "Clearest for prices and short headlines." },
  { value: "ta", label: "தமிழ் · Tamil", description: "Headline and text on the picture in Tamil letters." },
];

export const captionLanguageLabel = (v: string | null | undefined) => CAPTION_LANGUAGES.find((l) => l.value === v)?.label ?? "English";
export const designLanguageLabel = (v: string | null | undefined) => DESIGN_LANGUAGES.find((l) => l.value === v)?.label ?? "English";
export const isCaptionLanguage = (v: unknown): v is CaptionLanguage => CAPTION_LANGUAGES.some((l) => l.value === v);
export const isDesignLanguage = (v: unknown): v is DesignLanguage => DESIGN_LANGUAGES.some((l) => l.value === v);

/** A sensible start for a new business from the languages it posts in. */
export function defaultLanguages(languages: string[]): { caption: CaptionLanguage; design: DesignLanguage } {
  if (languages.includes("si")) return { caption: languages.includes("en") ? "si_en" : "si", design: "si" };
  if (languages.includes("ta")) return { caption: "ta", design: "ta" };
  return { caption: "en", design: "en" };
}
