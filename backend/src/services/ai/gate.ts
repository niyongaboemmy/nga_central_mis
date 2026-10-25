import { CustomError } from "../../errors/CustomError";
import { decideAny, misAccessMode, requestSnapshot } from "../access/policy";
import { loadPersona } from "../desktop/assistant";
import { loadTutorSettings } from "../desktop/tutor";
import { decideAi, type AiApp, type AiDecision, type AiFeature, type AiPolicy } from "../../vendor/nga-access";
import { AiDisabledError, aiDisabledBody, getAiPolicy } from "./policy";

/**
 * Route guards for MIS AI features (AI_USAGE_CONTROL_PLAN.md §4.5). The MIS has
 * no quizzes or assignments of its own, so a decision here is always policy +
 * role: the master switch, the app switch, then AI_USE.
 *
 * Features: "author" for staff content tools (generators, Lesson Studio, SQL,
 * insights), "assist" for tutors and Ask-AI.
 */

export const AI_USE = "AI_USE";

/**
 * Does the caller hold AI_USE? The legacy permission list decides while the MIS
 * runs in shadow/off mode (AI_USE is legacy-visible); in enforce mode the v2
 * snapshot does.
 */
export async function hasAiUse(req: any): Promise<boolean> {
  const legacy = Array.isArray(req.user?.permissions) && req.user.permissions.includes(AI_USE);
  if (misAccessMode() !== "enforce") return legacy;
  try {
    return decideAny(await requestSnapshot(req), [AI_USE], null, null).allowed;
  } catch {
    return legacy;
  }
}

export interface AiGateOptions {
  /** Which app's switch applies (default "mis"; NGA Desktop routes pass "desktop"). */
  app?: AiApp;
  /**
   * A student-facing AI Tutor surface (course tutor, lesson-note reader): for
   * students the AI Tutor switch in NGA Desktop settings applies as well.
   */
  tutor?: boolean;
}

/** The decision for this request, plus the policy it was made against. */
export async function aiDecisionFor(
  req: any,
  feature: AiFeature,
  app: AiApp = "mis",
): Promise<{ decision: AiDecision; policy: AiPolicy; hasAiUse: boolean }> {
  const [policy, aiUse] = await Promise.all([getAiPolicy(), hasAiUse(req)]);
  return { decision: decideAi(policy, { app, feature, hasAiUse: aiUse }), policy, hasAiUse: aiUse };
}

/** The AI Tutor is switched off in NGA Desktop settings (students only). */
export class TutorOffError extends CustomError {
  readonly code = "TUTOR_OFF";
  constructor() {
    super("Your school has switched the AI Tutor off for now.", 403);
  }
}

/** Throw AiDisabledError (or TutorOffError) unless this request may use AI. */
export async function assertAi(req: any, feature: AiFeature, opts: AiGateOptions = {}): Promise<void> {
  const { decision } = await aiDecisionFor(req, feature, opts.app ?? "mis");
  if (!decision.allowed) throw new AiDisabledError(decision.reason);
  if (opts.tutor) {
    const { persona } = await loadPersona(Number(req.user.userId));
    if (persona === "student" && !(await loadTutorSettings()).enabled) throw new TutorOffError();
  }
}

/**
 * Express guard: 403 `{success:false, code:"AI_DISABLED", reason, message}` when
 * the policy or the caller's role refuses AI. Mount after authenticate.
 */
export const requireAi =
  (feature: AiFeature, opts: AiGateOptions = {}) =>
  async (req: any, res: any, next: any) => {
    try {
      await assertAi(req, feature, opts);
      next();
    } catch (e) {
      if (e instanceof AiDisabledError) return res.status(403).json(aiDisabledBody(e.reason));
      if (e instanceof TutorOffError) return res.status(403).json({ success: false, code: e.code, message: e.message });
      next(e);
    }
  };
