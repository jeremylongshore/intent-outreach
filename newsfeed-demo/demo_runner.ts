/**
 * NewsFeed Demo Runner
 * Loads a sample article, generates rationale and exports, prints results
 */

import { generateRationale, type NewsStory } from "./why_picked.js";
import { generateAllExports } from "./exports.js";
import * as fs from "fs";
import * as path from "path";

// Sample news story for demo
const sampleStory: NewsStory = {
  id: "demo_001",
  title: "AI Startup Raises $50M Series B to Automate SDR Workflows",
  summary: "PipelineAI announced a $50M Series B led by Sequoia to build AI agents that fully automate outbound sales development workflows, targeting mid-market B2B SaaS companies.",
  body: `PipelineAI, a San Francisco-based startup, today announced it has raised $50 million in Series B funding led by Sequoia Capital, with participation from existing investors Index Ventures and Y Combinator.

The company builds AI agents that automate sales development representative (SDR) workflows, targeting mid-market B2B SaaS companies that struggle with expensive and inconsistent human SDR teams.

"Traditional SDR teams are costly, hard to scale, and often produce inconsistent results," said Sarah Chen, CEO and co-founder of PipelineAI. "Our AI agents handle everything from research to personalization to multi-touch sequences, delivering 10x ROI compared to human teams."

PipelineAI's platform uses a combination of large language models (LLMs) and deterministic workflows to research target accounts, craft personalized outreach, and manage follow-up sequences. The system integrates with popular CRMs like Salesforce and HubSpot.

The funding will be used to expand the engineering team and build out integrations with more data providers like ZoomInfo and Apollo. The company currently serves 150 customers and generates $10M in ARR.

Industry analysts note that AI-powered SDR automation is a rapidly growing category, with companies like Outreach, SalesLoft, and Apollo all adding AI features. However, PipelineAI's agent-first approach differentiates it from traditional sales engagement platforms.

"We're not just adding AI features to existing tools," Chen explained. "We're building autonomous agents that can replace entire SDR teams, not just augment them."

The company plans to use the funding to achieve $100M ARR within 18 months.`,
  source: {
    name: "TechCrunch",
    url: "https://techcrunch.com/2025/10/31/pipelineai-raises-50m-series-b"
  },
  scoring: {
    impact: 9,
    relevance: 10,
    specificity: 9,
    total: 28,
    selectionReason: "Highly relevant to PipelinePilot's mission. Validates market demand for AI-powered SDR automation. Competitive intelligence on funding, features, and GTM strategy. Specific metrics (150 customers, $10M ARR) provide actionable benchmarks."
  }
};

/**
 * Run the demo
 */
export async function runDemo() {
  console.log("🚀 PipelinePilot NewsFeed Demo\n");
  console.log("═".repeat(60));

  // Generate rationale
  console.log("\n📊 Generating selection rationale...");
  const rationale = generateRationale(sampleStory);
  console.log(`\n${rationale.fullRationale}\n`);
  console.log("═".repeat(60));

  // Generate exports
  console.log("\n📝 Generating exports...\n");
  const exports = generateAllExports(sampleStory, rationale);

  // Save exports
  const outputDir = path.join(process.cwd(), "newsfeed-demo", "output");
  fs.mkdirSync(outputDir, { recursive: true });

  const markdownPath = path.join(outputDir, `${sampleStory.id}.md`);
  const htmlPath = path.join(outputDir, `${sampleStory.id}.html`);

  fs.writeFileSync(markdownPath, exports.markdown, "utf-8");
  fs.writeFileSync(htmlPath, exports.html, "utf-8");

  console.log(`✅ Markdown export: ${markdownPath}`);
  console.log(`✅ HTML export: ${htmlPath}`);
  console.log(`ℹ️  PDF export: ${exports.pdf}\n`);

  console.log("═".repeat(60));
  console.log("\n✅ Demo complete!\n");
  console.log("Next steps:");
  console.log("  1. Open HTML export in browser");
  console.log("  2. Review rationale logic in why_picked.ts");
  console.log("  3. Deploy agents to Vertex AI: ./scripts/deploy_agents.sh");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export default runDemo;
