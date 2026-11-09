import { chromium } from "@playwright/test";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documents, type DemoDocument } from "./documents.js";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "files");

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toHtml(doc: DemoDocument): string {
  const sections = doc.sections
    .map((s) => `<h2>${escapeHtml(s.heading)}</h2>${s.clauses.map((c) => `<p>${escapeHtml(c)}</p>`).join("")}`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 11pt/1.5 Georgia, serif; color: #111; margin: 0; }
    h1 { font-size: 18pt; text-align: center; margin: 0 0 4pt; }
    .subtitle { text-align: center; color: #555; margin: 0 0 18pt; }
    h2 { font-size: 12pt; margin: 16pt 0 6pt; }
    p { margin: 0 0 8pt; text-align: justify; }
    .signatures { margin-top: 28pt; }
    .signatures p { margin-top: 26pt; border-top: 1px solid #999; padding-top: 4pt; width: 60%; }
  </style></head><body>
    <h1>${escapeHtml(doc.title)}</h1>
    ${doc.subtitle ? `<p class="subtitle">${escapeHtml(doc.subtitle)}</p>` : ""}
    ${doc.preamble.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
    ${sections}
    <div class="signatures">${doc.signatures.map((s) => `<p>${escapeHtml(s)}</p>`).join("")}</div>
  </body></html>`;
}

function toDocx(doc: DemoDocument): Document {
  const children: Paragraph[] = [new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE })];
  if (doc.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: doc.subtitle, italics: true })] }));
  for (const p of doc.preamble) children.push(new Paragraph({ text: p, spacing: { after: 160 } }));
  for (const s of doc.sections) {
    children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 }));
    for (const c of s.clauses) children.push(new Paragraph({ text: c, spacing: { after: 120 } }));
  }
  for (const s of doc.signatures) children.push(new Paragraph({ text: `\n${s}`, spacing: { before: 480 } }));
  return new Document({ creator: "ACME Corporation", title: doc.title, sections: [{ children }] });
}

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
for (const doc of documents) {
  if (doc.formats.includes("pdf")) {
    await page.setContent(toHtml(doc));
    const out = path.join(OUT_DIR, `${doc.fileName}.pdf`);
    await page.pdf({ path: out, format: "A4", margin: { top: "25mm", bottom: "25mm", left: "22mm", right: "22mm" } });
    console.log(`Wrote ${path.relative(process.cwd(), out)}`);
  }
  if (doc.formats.includes("docx")) {
    const out = path.join(OUT_DIR, `${doc.fileName}.docx`);
    await writeFile(out, await Packer.toBuffer(toDocx(doc)));
    console.log(`Wrote ${path.relative(process.cwd(), out)}`);
  }
}
await browser.close();
