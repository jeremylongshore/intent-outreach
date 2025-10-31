/**
 * NewsFeed Demo: Selection Rationale Generator
 * Pure function that explains why an article was selected
 */

export interface NewsStory {
  id: string;
  title: string;
  summary: string;
  body: string;
  source: {
    name: string;
    url: string;
  };
  scoring: {
    impact: number;
    relevance: number;
    specificity: number;
    total: number;
    selectionReason: string;
  };
}

export interface SelectionRationale {
  metricsLine: string;
  category: string;
  reason: string;
  fullRationale: string;
}

/**
 * Generate selection rationale for a news story
 * @param story - News story object
 * @returns Rationale explaining why this article was selected
 */
export function generateRationale(story: NewsStory): SelectionRationale {
  const { impact, relevance, specificity, total, selectionReason } = story.scoring;

  // Metrics line: compact summary
  const metricsLine = `Impact: ${impact}/10 | Relevance: ${relevance}/10 | Specificity: ${specificity}/10 | Total: ${total}/30`;

  // Category based on total score
  let category: string;
  if (total >= 25) {
    category = "HIGH PRIORITY";
  } else if (total >= 20) {
    category = "MEDIUM PRIORITY";
  } else if (total >= 15) {
    category = "LOW PRIORITY";
  } else {
    category = "ARCHIVED";
  }

  // Full rationale combining metrics and reason
  const fullRationale = `
**${category}**

${metricsLine}

**Why This Article Matters:**
${selectionReason}

**Source:** ${story.source.name}
**URL:** ${story.source.url}
`.trim();

  return {
    metricsLine,
    category,
    reason: selectionReason,
    fullRationale
  };
}

export default generateRationale;
