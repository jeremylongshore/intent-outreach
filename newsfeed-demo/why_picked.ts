export type WhyPicked = {
  metrics_line: string;   // e.g., "impact 8 • relevance 7 • specificity 6 • total 21"
  category: "funding" | "partnership" | "product" | "regulatory" | "macro" | "other";
  reason: string;         // 30–300 chars
};

export function whyPicked(input: {
  impact: number; relevance: number; specificity: number; total: number;
  title: string; body?: string;
}): WhyPicked {
  const { impact, relevance, specificity, total, title } = input;
  const metrics_line = `impact ${impact} • relevance ${relevance} • specificity ${specificity} • total ${total}`;
  const category =
    /raises|funding|seed|series|acquire|merger/i.test(title) ? "funding" :
    /partner|integrat|alliance/i.test(title) ? "partnership" :
    /launch|ship|feature|product/i.test(title) ? "product" :
    /rule|law|ban|regulat|compliance/i.test(title) ? "regulatory" :
    /market|macro|economy|rates|inflation/i.test(title) ? "macro" : "other";
  const reason = `Selected for SDR context because it scores ${total}/30 and directly informs targeting or messaging for prospects likely affected by: ${title}`.slice(0, 300);
  return { metrics_line, category, reason };
}
