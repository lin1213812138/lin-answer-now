import z from "@deepseek-ai/schemastery";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";

const name = "answer-now";

const SOURCE = { kind: "answer-now" };

const SECTION_NAME = "answer-now";

const SECTION_ORDER = 550;

export const inject = ["systemPrompt", "llm"];

export const Config = z.object({
  thresholds: z.array(z.number()).default([3, 5, 8]),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default(["answer_now"]),
  cooldownSteps: z.number().default(1),
  reminderSummary: z.string().default("answer now"),
  resetOnUserMessage: z.boolean().default(true),
  skipSubagents: z.boolean().default(true),
  quietTools: z.array(z.string()).default(["todo_write", "todo_read", "todo_write_many", "schedule_list"]),
  showStartNotice: z.boolean().default(true),
  simpleTaskFirst: z.boolean().default(true),
  repeatReminderEnabled: z.boolean().default(true),
  repeatMax: z.number().default(3),
  // Review gate: an independent LLM grades each turn's final answer; a score
  // below `reviewThreshold` is fed back so the agent retries the same turn.
  reviewEnabled: z.boolean().default(true),
  reviewThreshold: z.number().default(80),
  maxChallenges: z.number().default(5),
  maxReviewTokens: z.number().default(512),
  reviewTimeoutMs: z.number().default(60_000),
  reviewProvider: z.string(),
  reviewModel: z.string(),
});

const PROMPT = `## Deliver as soon as you have an answer

You have a budget of tool calls, and every extra call costs the user time. Follow these rules strictly:

1. **Stop querying the moment you can answer.** Once you hold enough information to produce a useful, accurate answer, stop calling tools and write the final answer in the same turn. Do not run "just one more check" to satisfy curiosity.
2. **Never repeat a query.** Do not re-run the same tool with the same arguments, and do not re-read a file you already read. Each call must add information you do not already have.
3. **Prefer one decisive query over several narrow ones.** Batch lookups, pick the most specific search, and use the results you already have before reaching for another tool.
4. **Answer with what you have.** If the information is sufficient for a correct answer, deliver it now. Partial answers delivered promptly beat exhaustive answers delivered late.
5. **No filler work.** Do not call tools to demonstrate effort, to "confirm" something you already know, or to double-check a fact you are confident about.

When this session injects a reminder telling you that you have used many tool calls, treat it as an instruction to wrap up: stop querying and answer with what you already know.

SIMPLE TASKS FIRST. Most requests are small — a one-line fix, a typo, a quick lookup, a short answer. For these, do the minimum: read only the file(s) involved, make the single change, and reply. Do NOT broaden the scope, do not refactor surrounding code, do not run exploratory searches, do not open extra files "to be safe". A simple bug fix should be a read, an edit, and a short explanation — not a tour of the codebase.

At the very start of every new session (first answer after the user's opening message), render a small status panel confirming this plugin is active and how it works, so the user can see it is doing its job. The panel should state: the "answer-now" plugin is enabled; its job is to make you deliver results as soon as you have them and to nudge you when a turn uses too many tool calls; the call thresholds (e.g. THRESHOLDS); and that reminders appear inline as "[answer-now] …" messages. Keep it brief. If showStartNotice is disabled, skip this.`;

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`)
    .replaceAll("*", ".*");
  return new RegExp(`^(?:${escaped})$`);
}

function matcher(patterns) {
  if (patterns.length === 0) return () => true;
  const regexps = patterns.map(wildcardToRegExp);
  return (value) => regexps.some((regexp) => regexp.test(value));
}

// Subagent and workflow sessions run their own tool loops; nudging them to
// "stop querying" would interfere with legitimate delegated work.
function isSubagentSession(agent) {
  const origin = agent?.session?.header?.origin;
  return origin === "subagent" || origin === "workflow";
}

function reminderText(count, threshold, last) {
  if (last) {
    return `[answer-now] You have made ${count} tool calls in this turn without delivering an answer. Stop calling tools now and produce your final answer from the information you already have. Do not start any new query.`;
  }
  return `[answer-now] ${count} tool calls so far in this turn. If you already have what you need to answer, answer now instead of querying further. Next reminder at call ${threshold}.`;
}

function* normalizeThresholds(raw) {
  const seen = new Set();
  for (const value of raw) {
    if (!Number.isInteger(value) || value < 1) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    yield value;
  }
}

// ---------------------------------------------------------------------------
// Review gate. A separate model grades the turn's final answer; a score below
// `reviewThreshold` is fed back through agent.steer() so the agent runs
// another step in the same turn, capped by `maxChallenges`.
// ---------------------------------------------------------------------------

const MIN_SCORE = 1;
const MAX_SCORE = 100;
const MAX_CHALLENGES_HARD_CAP = 8;
const DEFAULT_REVIEW_THRESHOLD = 80;

function clampPositiveInt(value, fallback, hi) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return fallback;
  const rounded = Math.floor(value);
  return rounded > hi ? hi : rounded;
}

function clampScore(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < MIN_SCORE || rounded > MAX_SCORE) return fallback;
  return rounded;
}

function concatTextBlocks(blocks) {
  const parts = [];
  for (const block of blocks) {
    if (block && block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
      parts.push(block.text);
    }
  }
  return parts.join("\n\n");
}

function extractUserPrompts(events) {
  if (!Array.isArray(events)) return null;
  const parts = [];
  for (const event of events) {
    if (!event || event.type !== "user/message") continue;
    const data = event.data;
    if (!data || !data.source || data.source.kind === "plugin") continue;
    const message = data.message;
    if (!message || !Array.isArray(message.content)) continue;
    const text = concatTextBlocks(message.content);
    if (text.length > 0) parts.push(text);
  }
  if (parts.length === 0) return null;
  return parts.join("\n\n---\n\n");
}

function extractAssistantText(events, turn) {
  if (!Array.isArray(events) || typeof turn !== "number") return null;
  const parts = [];
  for (const event of events) {
    if (!event || event.type !== "assistant/message") continue;
    const data = event.data;
    if (!data || data.turn !== turn) continue;
    if (data.interrupted === true) continue;
    const message = data.message;
    if (!message || !Array.isArray(message.content)) continue;
    parts.push(concatTextBlocks(message.content));
  }
  const text = parts.join("\n\n");
  if (text.length === 0) return null;
  return text;
}

function buildReviewPrompt({ userPrompts, assistantText, threshold }) {
  if (typeof assistantText !== "string" || assistantText.length === 0) {
    throw new Error("buildReviewPrompt: assistantText is required");
  }
  const safeThreshold = clampScore(threshold, DEFAULT_REVIEW_THRESHOLD);
  const system = [
    "You are a strict independent judge. Score the FINAL assistant reply on a 1-100 integer scale.",
    "",
    "Scoring axes (weighted roughly equal, you decide the breakdown):",
    "  * correctness — no factual, technical, or logical errors;",
    "  * completeness — every prompt the user issued in this conversation is addressed;",
    "  * relevance — answers the actual ask, not adjacent topics;",
    "  * clarity — well-structured, idiomatic, no broken markdown or linter noise;",
    "  * safety — no destructive shell, no fabricated paths/signatures, no leaked secrets;",
    "  * constraint-compliance — respects any explicit length / language / format requests.",
    "",
    "CRITICAL — user constraints trump completeness:",
    "  If the user EXPLICITLY asked for a short answer, a specific format, or a specific",
    "  length limit, then satisfying that request IS the requirement. A reply that is",
    "  deliberately brief BECAUSE the user asked for briefness is NOT incomplete — do",
    "  not penalise it for lacking detail or substance. Score such a reply on whether",
    "  it followed the constraint exactly, not on how much prose it added.",
    "  Examples: \"只回复OK两个字\" means only reply \"OK\"; that is a 100, not a 40.",
    "  A one-word answer to a one-word request is a perfect score.",
    "",
    "Quality bands:",
    "  95-100  exceptional, ship as-is (including a perfect, constraint-exact short reply).",
    "  80-94   solid, satisfies all important user requirements.",
    "  60-79   usable but missing real detail or has visible defects.",
    "  40-59   substantially incomplete or wrong.",
    "  1-39    fails outright.",
    `Threshold for "good enough" in this host is ${safeThreshold}.`,
    "",
    "Reply with exactly ONE JSON object, no markdown fences, no surrounding prose:",
    '{"score": <integer 1-100>, "reason": "<<=240 chars, names the ONE most important improvement if score < threshold; empty string if score >= threshold>"}',
    "",
    "Rules:",
    "  * score must be an integer in [1, 100];",
    `  * reason is required when score < ${safeThreshold}, otherwise empty string;`,
    `  * when score < ${safeThreshold}, the reason names a single SPECIFIC, observable defect the agent can act on (cite text or omission);`,
    "  * do NOT invent missing context — score only what the reply actually delivers.",
  ].join("\n");
  const sectionUser = userPrompts && userPrompts.length > 0
    ? `<all_user_prompts>\n${userPrompts}\n</all_user_prompts>`
    : "<all_user_prompts>(none extracted — score the reply only)</all_user_prompts>";
  const userText = `${sectionUser}\n\n<reply>\n${assistantText}\n</reply>\n\nScore now and return your JSON object.`;
  const messages = [
    createUserMessage({
      content: [{ type: "text", text: userText }],
      source: { kind: "plugin", plugin: name, note: "review-request" },
    }),
  ];
  return Object.freeze({ system, messages });
}

function parseScore(raw, threshold) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = raw.slice(start, end + 1);
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const score = clampScore(parsed.score, NaN);
  if (!Number.isFinite(score) || score < MIN_SCORE || score > MAX_SCORE) return null;
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  const atOrAboveGate = typeof threshold === "number" && Number.isFinite(threshold) && score >= threshold;
  if (reason.length === 0 && !atOrAboveGate) return null;
  let trimmed = reason;
  if (trimmed.length > 240) trimmed = `${trimmed.slice(0, 237)}...`;
  return Object.freeze({ score, reason: trimmed });
}

function isScoreAcceptable(score, threshold) {
  if (!score || typeof score.score !== "number") return false;
  return score.score >= clampScore(threshold, DEFAULT_REVIEW_THRESHOLD);
}

function buildSteerMessage({ score, reason, attempt, maxAttempts }) {
  const safeScore = clampScore(score, 0);
  const safeAttempt = clampPositiveInt(attempt, 1, MAX_CHALLENGES_HARD_CAP);
  const safeCap = clampPositiveInt(maxAttempts, 1, MAX_CHALLENGES_HARD_CAP);
  const remaining = Math.max(0, safeCap - safeAttempt);
  const trimmedReason = typeof reason === "string" && reason.length > 0
    ? reason
    : "(no specific defect was named)";
  const text = [
    `An independent review model scored your previous reply ${safeScore}/100, which is below the quality gate. Do NOT argue with the review. Fix the issue and reply again.`,
    "",
    "Most important defect named by the reviewer:",
    `  ${trimmedReason}`,
    "",
    `This is retry ${safeAttempt} of ${safeCap} for the current turn${remaining > 0 ? ` (${remaining} remaining after this one).` : " (this is the last retry; the next reply will go to the user as-is)."}`,
    "Do not mention this review process to the user. Address the defect, then produce the corrected final answer.",
  ].join("\n");
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "plugin", plugin: name, note: `steer-${safeAttempt}/${safeCap}` },
  });
}

function createChallengeCounter(maxEntries = 4096) {
  const store = new Map();
  function get(sessionId, turn) {
    return store.get(`${sessionId}:${turn}`) ?? 0;
  }
  function bump(sessionId, turn) {
    const key = `${sessionId}:${turn}`;
    const next = (store.get(key) ?? 0) + 1;
    store.set(key, next);
    if (store.size > maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    return next;
  }
  function clear(sessionId, turn) {
    if (turn === undefined) {
      const prefix = `${sessionId}:`;
      for (const k of Array.from(store.keys())) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    } else {
      store.delete(`${sessionId}:${turn}`);
    }
  }
  return Object.freeze({ get, bump, clear, get size() { return store.size; } });
}

function readEvents(session) {
  if (typeof session.snapshotEvents === "function") {
    try {
      const out = session.snapshotEvents();
      if (Array.isArray(out)) return out;
    } catch {
      /* fall through to legacy */
    }
  }
  if (Array.isArray(session.events)) return session.events;
  return null;
}

function makeDeadline(externalSignal, timeoutMs) {
  if (externalSignal && typeof externalSignal.addEventListener === "function") {
    const controller = new AbortController();
    const onAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("review timeout")), timeoutMs);
    return {
      signal: controller.signal,
      cancel() {
        clearTimeout(timer);
        externalSignal.removeEventListener("abort", onAbort);
      },
    };
  }
  return { signal: AbortSignal.timeout(timeoutMs), cancel() { /* nothing to cancel */ } };
}

async function streamToText(ctx, route, sessionId, prompt, maxTokens, abortSignal) {
  const options = {
    provider: route.provider,
    model: route.model,
    messages: prompt.messages,
    system: prompt.system,
    maxTokens,
    sessionId,
    purpose: "answer-review",
    signal: abortSignal,
  };
  if (!ctx.llm || typeof ctx.llm.stream !== "function") {
    throw new Error("ctx.llm.stream is not available");
  }
  const assembler = new BlockAssembler();
  for await (const chunk of ctx.llm.stream(options)) {
    if (abortSignal && abortSignal.aborted) break;
    assembler.push(chunk);
  }
  if (assembler.finish && (assembler.finish.kind === "error" || assembler.finish.kind === "aborted")) {
    throw new Error(assembler.finish.failure?.message ?? "review stream failed");
  }
  const blocks = typeof assembler.blocks === "function" ? assembler.blocks() : [];
  return blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

function resolveReviewRoute(config, agent) {
  if (config.reviewProvider && config.reviewModel) {
    return Object.freeze({ provider: config.reviewProvider, model: config.reviewModel });
  }
  const options = agent && agent.options;
  if (!options || typeof options.provider !== "string" || typeof options.model !== "string") {
    return null;
  }
  return Object.freeze({ provider: options.provider, model: options.model });
}

function resolveReviewConfig(config) {
  const hasProvider = typeof config.reviewProvider === "string" && config.reviewProvider.length > 0;
  const hasModel = typeof config.reviewModel === "string" && config.reviewModel.length > 0;
  return {
    enabled: config.reviewEnabled !== false && hasProvider === hasModel,
    threshold: clampScore(config.reviewThreshold, DEFAULT_REVIEW_THRESHOLD),
    maxChallenges: clampPositiveInt(config.maxChallenges, 5, MAX_CHALLENGES_HARD_CAP),
    maxReviewTokens: clampPositiveInt(config.maxReviewTokens, 512, 4096),
    timeoutMs: clampPositiveInt(config.reviewTimeoutMs, 60_000, 600_000),
  };
}

function apply(ctx, config) {
  const thresholds = [...normalizeThresholds(config.thresholds)];
  const included = matcher(config.include);
  const excluded = matcher(config.exclude);
  const quiet = matcher(config.quietTools);
  const maxLevel = thresholds.length - 1;
  const review = resolveReviewConfig(config);
  const counter = createChallengeCounter();

  ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: PROMPT.replace("THRESHOLDS", thresholds.join(", ")),
  });

  const chains = new WeakMap();

  function stateOf(agent) {
    let state = chains.get(agent);
    if (state === undefined) {
      state = { count: 0, level: 0, cooldown: 0, done: false, last: new Map() };
      chains.set(agent, state);
    }
    return state;
  }

  function observe(exec) {
    if (exec.agent === undefined) return;
    if (config.skipSubagents && isSubagentSession(exec.agent)) return;
    if (!included(exec.name) || excluded(exec.name)) return;
    if (exec.signal?.aborted) return;
    const state = stateOf(exec.agent);
    state.count += 1;
    if (state.done) return;
    if (quiet(exec.name) && state.count <= (thresholds[0] ?? Number.POSITIVE_INFINITY)) return;

    if (config.repeatReminderEnabled) {
      const key = `${exec.name}::${JSON.stringify(exec.arguments ?? null)}`;
      const prev = state.last.get(key) ?? 0;
      if (prev >= config.repeatMax) {
        const text = `[answer-now] You ran ${exec.name} with these arguments ${prev + 1}× this turn. You already have this result — stop re-querying and answer with what you have.`;
        exec.agent.inbox.prepend("next-step", {
          role: "user",
          content: [{ type: "text", text }],
          source: { ...SOURCE, form: "notice", summary: config.reminderSummary },
        });
        state.last.set(key, prev + 1);
        return;
      }
      state.last.set(key, prev + 1);
    }

    while (state.level < maxLevel && state.count >= thresholds[state.level + 1]) state.level += 1;
    if (state.count < thresholds[state.level]) return;
    if (state.cooldown > 0) {
      state.cooldown -= 1;
      return;
    }
    state.cooldown = config.cooldownSteps;
    if (state.level === maxLevel) state.done = true;
    const text = reminderText(state.count, thresholds[state.level + 1] ?? state.count, state.level === maxLevel);
    exec.agent.inbox.prepend("next-step", {
      role: "user",
      content: [{ type: "text", text }],
      source: { ...SOURCE, form: "notice", summary: config.reminderSummary }
    });
  }

  ctx.on("tools/result", (exec, result) => {
    if (result.isError) return;
    observe(exec);
  });

  // Review gate: a separate model grades the turn's final answer and, when the
  // score is below `review.threshold`, steers the agent to retry the same turn.
  async function reviewTurn(payload) {
    if (!payload) return;
    const { agent, turn, signal } = payload;
    if (!agent || !agent.session) return;
    if (signal && signal.aborted) return;

    const header = agent.session.header;
    if (header && header.origin === "subagent") return;

    const session = agent.session;
    const sessionId = session.id ?? "unknown-session";
    const events = readEvents(session);
    if (!events) return;
    const assistantText = extractAssistantText(events, turn);
    if (!assistantText) return;
    const userPrompts = extractUserPrompts(events) ?? "";

    const route = resolveReviewRoute(config, agent);
    if (!route) return;

    const prompt = buildReviewPrompt({ userPrompts, assistantText, threshold: review.threshold });
    const deadline = makeDeadline(signal, review.timeoutMs);
    let rawReply;
    try {
      rawReply = await streamToText(ctx, route, sessionId, prompt, review.maxReviewTokens, deadline.signal);
    } catch (error) {
      ctx.logger?.warn?.(`answer-now: review call failed, allowing turn to close: ${String(error)}`);
      return;
    } finally {
      deadline.cancel();
    }
    if (deadline.signal.aborted) return;

    const score = parseScore(rawReply, review.threshold);
    if (!score) return;
    if (isScoreAcceptable(score, review.threshold)) return;

    const used = counter.get(sessionId, turn);
    if (used >= review.maxChallenges) return;

    const attempt = counter.bump(sessionId, turn);
    const message = buildSteerMessage({
      score: score.score,
      reason: score.reason,
      attempt,
      maxAttempts: review.maxChallenges,
    });
    try {
      agent.steer(message);
      ctx.logger?.info?.(
        `answer-now: steered session=${sessionId} turn=${turn} score=${score.score}/${review.threshold} (retry ${attempt}/${review.maxChallenges})`,
      );
    } catch (error) {
      ctx.logger?.warn?.(`answer-now: steer failed: ${String(error)}`);
    }
  }

  if (review.enabled) {
    ctx.on("agent/turn-stopping", async (payload) => {
      await reviewTurn(payload).catch((error) => {
        ctx.logger?.warn?.(`answer-now: review crashed, allowing turn to close: ${String(error)}`);
      });
    });
  }

  ctx.on("agent/pre-step", ({ agent, messages }, next) => {
    if (config.resetOnUserMessage && messages.some((message) => message.source?.kind === "user")) {
      chains.delete(agent);
    }
    return next();
  });

  if (config.showStartNotice) {
    const notice = `[answer-now] Plugin enabled. It pushes me to do simple tasks simply (read the one file, make the one change, answer) and to deliver as soon as I have an answer, and will remind me inline (as "[answer-now] …" messages) once a turn uses too many tool calls. Active thresholds: ${thresholds.join(", ")}.`;
    ctx.on("agent/created", ({ agent }) => {
      const dispose = agent.ctx.on("agent/pre-step", ({ agent: current, step }, next) => {
        if (step === 1) {
          current.inbox.prepend("next-step", {
            role: "user",
            content: [{ type: "text", text: notice }],
            source: { ...SOURCE, form: "notice", summary: "answer-now active" },
          });
        }
        return next();
      });
      ctx.effect(() => dispose, "answer-now.startNotice");
    });
  }
}

export { apply, name };
