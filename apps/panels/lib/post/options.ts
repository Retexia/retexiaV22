export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "si", label: "Sinhala" },
  { value: "ta", label: "Tamil" },
];

export const COUNTRIES = [
  { value: "LK", label: "Sri Lanka" },
  { value: "IN", label: "India" },
  { value: "MV", label: "Maldives" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "US", label: "United States" },
];

export const CATEGORIES = [
  "Bakery and cakes",
  "Restaurant or café",
  "Clothing and fashion",
  "Beauty and salon",
  "Electronics and phones",
  "Home and furniture",
  "Education and classes",
  "Travel and hotels",
  "Real estate",
  "Health and wellness",
  "Supplements",
  "Alcohol",
  "Finance and insurance",
  "Services",
  "Other",
].map((c) => ({ value: c, label: c }));

/** Sensitive categories: always manual approval (product spec). */
export const SENSITIVE = ["Health and wellness", "Supplements", "Alcohol", "Finance and insurance"];

export const FORMATS = [
  { value: "photo", label: "Photo" },
  { value: "carousel", label: "Carousel" },
  { value: "reel", label: "Reel" },
  { value: "story_photo", label: "Story (photo)" },
  { value: "story_video", label: "Story (video)" },
];

export const DENY_REASONS = [
  { value: "caption", label: "The caption" },
  { value: "image", label: "The picture" },
  { value: "both", label: "Both" },
  { value: "wrong_product", label: "Wrong product" },
];
