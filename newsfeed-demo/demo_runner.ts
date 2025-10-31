import { whyPicked } from "./why_picked.ts";
import { exportMarkdown, exportHtml, exportPdf } from "./exports.ts";

const sampleStory = {
  id: "demo_001",
  title: "Acme Corp raises $50M Series B to expand AI sales platform",
  summary: "Acme Corp announced a $50M Series B round led by Sequoia Capital. Funds will accelerate product development and international expansion.",
  body: `Acme Corp, a leading AI-powered sales automation platform, today announced
it has raised $50 million in Series B funding led by Sequoia Capital with
participation from existing investors Andreessen Horowitz and FirstMark Capital.

The company plans to use the capital to expand its engineering team, enhance
its AI models for sales prospecting, and enter new international markets
starting with the UK and Germany.

"This funding validates our vision of democratizing sales intelligence," said
Jane Doe, CEO of Acme Corp. "We're helping SDRs close deals faster by surfacing
the right prospects at the right time with hyper-personalized messaging."

Acme Corp currently serves over 500 B2B companies and processes 10 million
prospecting actions per month. The platform integrates with major CRMs and
uses proprietary algorithms to score leads based on intent signals and
firmographic data.`,
  source: { name: "TechCrunch", url: "https://techcrunch.com/acme-series-b" },
  scoring: { impact: 8, relevance: 9, specificity: 7, total: 24, selectionReason: "" }
};

async function runDemo() {
  console.log("=== NewsFeed Demo Runner ===\n");

  // Generate selection rationale
  const rationale = whyPicked(sampleStory.scoring);
  sampleStory.scoring.selectionReason = rationale.reason;

  console.log(`Story: ${sampleStory.title}`);
  console.log(`Metrics: ${rationale.metrics_line}`);
  console.log(`Category: ${rationale.category}`);
  console.log(`Reason: ${rationale.reason}\n`);

  // Run exports in parallel
  const [md, html, pdf] = await Promise.all([
    exportMarkdown(sampleStory),
    exportHtml(sampleStory),
    exportPdf(sampleStory)
  ]);

  console.log("✅ Exports complete:");
  console.log(`  - Markdown: ${md.path}`);
  console.log(`  - HTML: ${html.path}`);
  console.log(`  - PDF: ${pdf.disabled ? "disabled" : pdf.path}`);
}

runDemo().catch(console.error);
