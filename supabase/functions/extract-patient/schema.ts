export const extractionSchema = {
  type: "object",
  properties: {
    mutation: {
      type: "string",
      description: "Primary mutation/biomarker found in the report",
    },
    disease: {
      type: "string",
      description: "Primary disease or condition",
    },
    egfr: {
      type: ["number", "null"],
      description: "eGFR in mL/min",
    },
    platelets: {
      type: ["number", "null"],
      description: "Platelet count in K/µL",
    },
    noBrainMets: {
      type: "boolean",
      description: "True if no active brain metastases detected",
    },
    age: {
      type: ["number", "null"],
      description: "Patient age",
    },
    sex: {
      type: ["string", "null"],
      enum: ["male", "female", null],
      description: "Patient sex",
    },
    wbc: {
      type: ["number", "null"],
      description: "White blood cell count",
    },
    hemoglobin: {
      type: ["number", "null"],
      description: "Hemoglobin in g/dL",
    },
    creatinine: {
      type: ["number", "null"],
      description: "Serum creatinine in mg/dL",
    },
    alt: {
      type: ["number", "null"],
      description: "ALT in U/L",
    },
    ast: {
      type: ["number", "null"],
      description: "AST in U/L",
    },
    additionalMutations: {
      type: "array",
      items: { type: "string" },
      description: "Other mutations or biomarkers found in the report",
    },
    reportSummary: {
      type: "string",
      description: "1-2 sentence summary of key findings",
    },
  },
  required: [
    "mutation",
    "disease",
    "egfr",
    "platelets",
    "noBrainMets",
    "age",
    "sex",
    "wbc",
    "hemoglobin",
    "creatinine",
    "alt",
    "ast",
    "additionalMutations",
    "reportSummary",
  ],
  additionalProperties: false,
};

export const responseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "patient_extraction",
    schema: extractionSchema,
  },
};