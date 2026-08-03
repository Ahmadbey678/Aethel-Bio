import * as pdfjs from "pdfjs-dist";
import mammoth from "mammoth";

// Set the PDF.js worker source to the bundled worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/** Extract text from a PDF file using pdfjs-dist */
async function extractPDFText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // content.items is an array of TextItem objects with a `str` property
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(text);
  }

  return pages.join("\n\n");
}

/** Extract plain text from a .docx file using mammoth */
async function extractDOCXText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/** Read a .txt file as plain text */
function readTXTFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read text file"));
    reader.readAsText(file);
  });
}

/**
 * Extract text from an uploaded file based on its type.
 * Supports PDF, DOCX, and TXT files.
 */
export async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    return extractPDFText(file);
  }
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    return extractDOCXText(file);
  }
  if (name.endsWith(".txt")) {
    return readTXTFile(file);
  }

  throw new Error("Unsupported file format. Please upload a PDF, DOCX, or TXT file.");
}