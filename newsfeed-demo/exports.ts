import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Story = {
  id: string;
  title: string;
  summary: string;
  body: string;
  source: { name: string; url: string };
  scoring: { impact: number; relevance: number; specificity: number; total: number; selectionReason: string };
};

function ensureOut(dir = path.join(__dirname, "out")) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function exportMarkdown(story: Story) {
  const outDir = ensureOut();
  const p = path.join(outDir, `${story.id}.md`);
  const md =
`# ${story.title}
_Source: [${story.source.name}](${story.source.url})_

**Summary:** ${story.summary}

**Why this:** ${story.scoring.selectionReason}

---

${story.body}
`;
  fs.writeFileSync(p, md, "utf8");
  return { format: "md", path: p };
}

export async function exportHtml(story: Story) {
  const outDir = ensureOut();
  const p = path.join(outDir, `${story.id}.html`);
  const html =
`<!doctype html><meta charset="utf-8">
<title>${story.title}</title>
<article>
<h1>${story.title}</h1>
<p><em>Source: <a href="${story.source.url}">${story.source.name}</a></em></p>
<p><strong>Summary:</strong> ${story.summary}</p>
<p><strong>Why this:</strong> ${story.scoring.selectionReason}</p>
<hr/>
<pre>${story.body.replace(/</g,"&lt;")}</pre>
</article>`;
  fs.writeFileSync(p, html, "utf8");
  return { format: "html", path: p };
}

export async function exportPdf(_story: Story) {
  return { format: "pdf", path: null, disabled: true, note: "PDF export disabled in demo" };
}
