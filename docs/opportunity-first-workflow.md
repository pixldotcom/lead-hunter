# Opportunity-first Lead Hunter: implementation plan

## Product behavior

Lead Hunter prioritizes businesses with strong existing reputation and clear digital service opportunities. Outdated websites and businesses for which no official website was found receive the strongest initial website-opportunity signal. A healthy website does not disqualify a business: SEO, local SEO, performance, and marketing are assessed independently.

## Pipeline

1. Discover businesses from supported public sources, search-assisted workflows, and CSV/manual imports.
2. Normalize business identity and deduplicate conservatively.
3. Enrich available reputation and contact details with source and retrieval date.
4. Determine website status: no website found, outdated, needs improvement, healthy, or unknown.
5. Run local website analysis when an official website URL is available.
6. Convert analyzer observations into evidence records with source URL, observation date, and confidence.
7. Detect opportunities independently for website, SEO, local SEO, performance, and marketing.
8. Score and rank opportunities with an explainable breakdown.
9. Generate a portable ChatGPT research brief from collected business and evidence context.
10. Present results for human review; do not contact businesses automatically.

## Data design

- Business identity is separate from website identity. Website URL is optional.
- Business reputation, contact details, discovery provenance, and profile links belong to the business record.
- Website audits and other observations are evidence records.
- Each service opportunity references its evidence and includes priority, score, and rationale.
- Unknown is a first-class state. Missing evidence must never be described as a detected problem.
- "No website found" is deliberately not named "no website": absence from a discovery source is not proof of nonexistence.

## Automation policy

- Maximum automation applies to discovery processing, website analysis, opportunity detection, scoring, and prompt preparation.
- User review remains required before qualification, outreach, or any external communication.
- Batch processing must be cancellable, resumable, bounded, and deduplicated.
- No paid APIs or paid AI services. Do not scrape Google result pages. Use permitted discovery/import paths and local analysis.
- Do not claim keyword positions, traffic, revenue, conversion rates, or marketing activity without direct evidence.

## Phased delivery

### Foundation (current branch)
- Add website-optional business and evidence models.
- Add independent service opportunity detection and transparent scoring.
- Add portable ChatGPT prompt generation.
- Add unit tests for priority and evidence behavior.

### Integration
- Add a migration adapter for existing discovery candidates.
- Connect discovery/import sources to the new business model.
- Extend the existing analyzer output into typed evidence.
- Persist opportunity analyses in the existing cloud workspace without breaking current records or exceeding storage limits.

### Product UI
- Replace the manual-register-first discovery experience with a guided Discover workspace.
- Add batch progress, cancellation, retry, and review queues.
- Add opportunity cards and business detail views.
- Add copy prompt, copy evidence bundle, and export actions.
- Keep existing Leads, Pipeline, Follow-ups, Outreach, and PWA capabilities.

## Initial scoring principles

Scoring is a ranking aid, not a claim of purchase intent. Website need, reputation, service-specific evidence, and evidence confidence contribute independently. Unknown values receive no positive evidence points. Weights must be calibrated against real reviewed prospects before being treated as predictive.
