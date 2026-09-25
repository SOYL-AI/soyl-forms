import type { FormSchemaV1 } from "@/types/forms";

/** Tiny form used to preview a brand kit live while editing it. */
export function brandSampleForm(brandName: string): FormSchemaV1 {
  const name = brandName.trim() || "your brand";
  return {
    schemaVersion: 1,
    title: `${name} — sample`,
    blocks: [
      {
        id: "s_welcome",
        type: "welcome",
        title: `A quick word from ${name}`,
        description: "This is how your forms will look. Every colour, font and corner comes from the kit.",
        buttonLabel: "Start",
      },
      {
        id: "s_choice",
        type: "single_choice",
        title: "How did you hear about us?",
        required: true,
        options: [
          { id: "s_c1", label: "A friend" },
          { id: "s_c2", label: "Social media" },
          { id: "s_c3", label: "Search" },
        ],
      },
      {
        id: "s_rating",
        type: "rating",
        title: "How was your experience?",
        required: true,
        max: 5,
        icon: "star",
      },
      {
        id: "s_thanks",
        type: "thank_you",
        title: "Thank you",
        description: `That's the ${name} look.`,
      },
    ],
    logic: [],
  };
}
