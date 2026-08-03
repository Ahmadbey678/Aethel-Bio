import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";
import { corsHeaders, handleCors } from "./cors.ts";
import { responseFormat } from "./schema.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Only accept POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse request body
    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: text (string)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Truncate to 15,000 characters max
    const truncatedText = text.slice(0, 15_000);

    // Get API key with fallback
    const apiKey = Deno.env.get("openai_api_key") || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Initialize OpenAI client with AI/ML API base URL
    const client = new OpenAI({
      baseURL: "https://api.aimlapi.com/v1",
      apiKey,
    });

    // Call GPT-4o-mini with structured output
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract patient parameters from the following medical report:\n\n${truncatedText}` },
      ],
      response_format: responseFormat as any,
      temperature: 0,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({ success: false, error: "No content in AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse the structured JSON response
    const parsed = JSON.parse(content);

    const result = {
      biomarker: parsed.mutation,
      condition: parsed.disease,
      extractedParams: parsed,
    };

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Extraction error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});