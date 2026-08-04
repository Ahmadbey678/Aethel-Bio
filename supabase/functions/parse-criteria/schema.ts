export const criteriaSchema = {
  type: "object",
  properties: {
    inclusion: {
      type: "array",
      items: { type: "string" },
      description: "Array of individual inclusion criteria as bullet points",
    },
    exclusion: {
      type: "array",
      items: { type: "string" },
      description: "Array of individual exclusion criteria as bullet points",
    },
  },
  required: ["inclusion", "exclusion"],
  additionalProperties: false,
};

export const responseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "criteria_parse",
    schema: criteriaSchema,
  },
};