/**
 * Test the tutor providers from the command line (same as MIS → Desktop tools →
 * AI Tutor → "Test the AI services"). Uses real quota: ~44 calls per provider.
 *   npx ts-node --transpile-only scripts/eval-tutor.ts [provider …]
 */
import "dotenv/config";
import { runEvals } from "../src/services/desktop/tutorEval";

(async () => {
  const only = process.argv.slice(2);
  const results = await runEvals(0, only.length ? only : undefined);
  for (const r of results) console.log(`${r.passed ? "ADMITTED" : "LEFT OUT"}  ${r.provider} (${r.model}): ${r.noLeakPct}% of homework drafts held back the answer; ${r.answered}/${r.prompts} answered`);
  process.exit(0);
})();
