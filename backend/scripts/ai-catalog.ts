/**
 * Refresh the vendored model catalogue for My AI (PERSONAL_AI_PROVIDERS_PLAN.md §7.4)
 * from models.dev, the open model database (https://models.dev, repo sst/models.dev).
 *
 *   npx ts-node scripts/ai-catalog.ts              # fetch https://models.dev/api.json
 *   npx ts-node scripts/ai-catalog.ts <api.json>   # or read a downloaded copy
 *
 * Writes src/services/ai/personal/modelCatalog.json. Never fetched at runtime: the pickers
 * must work offline and a third-party outage must not change what users can choose.
 */
import fs from "fs";
import path from "path";

// Our provider id -> models.dev provider id.
const SOURCES: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  groq: "groq",
  deepseek: "deepseek",
  openrouter: "openrouter",
  mistral: "mistral",
  glm: "zai",
  cerebras: "cerebras",
};

async function load(): Promise<any> {
  const file = process.argv[2];
  if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
  const res = await fetch("https://models.dev/api.json");
  if (!res.ok) throw new Error(`models.dev: HTTP ${res.status}`);
  return res.json();
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function main() {
  const src = await load();
  const out: Record<string, any[]> = {};
  for (const [ours, theirs] of Object.entries(SOURCES)) {
    const models = src?.[theirs]?.models ?? {};
    out[ours] = Object.values<any>(models)
      .filter((m) => typeof m?.id === "string" && (m.modalities?.output ?? ["text"]).includes("text"))
      .map((m) => {
        const costIn = num(m.cost?.input);
        const costOut = num(m.cost?.output);
        return {
          id: m.id,
          name: String(m.name || m.id).slice(0, 80),
          json: m.structured_output === true,
          tools: m.tool_call === true,
          vision: Array.isArray(m.modalities?.input) && m.modalities.input.includes("image"),
          reasoning: m.reasoning === true,
          context: num(m.limit?.context),
          output: num(m.limit?.output),
          cost_in: costIn,
          cost_out: costOut,
          free: m.id.endsWith(":free") || (costIn === 0 && costOut === 0),
          released: typeof m.release_date === "string" ? m.release_date : null,
        };
      })
      .sort((a, b) => String(b.released ?? "").localeCompare(String(a.released ?? "")) || a.id.localeCompare(b.id));
  }
  const dest = path.join(__dirname, "../src/services/ai/personal/modelCatalog.json");
  fs.writeFileSync(dest, JSON.stringify({ source: "https://models.dev/api.json", fetched_at: new Date().toISOString().slice(0, 10), providers: out }) + "\n");
  console.log(`Wrote ${dest}: ${Object.entries(out).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
