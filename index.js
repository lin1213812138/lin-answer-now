import z from "@deepseek-ai/schemastery";

const name = "answer-now";

const SOURCE = { kind: "answer-now" };

const SECTION_NAME = "answer-now";

const SECTION_ORDER = 550;

export const inject = ["systemPrompt"];

export const Config = z.object({
  thresholds: z.array(z.number()).default([3, 5, 8]),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default(["answer_now"]),
  cooldownSteps: z.number().default(1),
  reminderSummary: z.string().default("answer now"),
  resetOnUserMessage: z.boolean().default(true),
  quietTools: z.array(z.string()).default(["todo_write", "todo_read", "todo_write_many", "schedule_list"]),
  showStartNotice: z.boolean().default(true),
  simpleTaskFirst: z.boolean().default(true),
  repeatReminderEnabled: z.boolean().default(true),
  repeatMax: z.number().default(3),
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

function apply(ctx, config) {
  const thresholds = [...normalizeThresholds(config.thresholds)];
  const included = matcher(config.include);
  const excluded = matcher(config.exclude);
  const quiet = matcher(config.quietTools);
  const maxLevel = thresholds.length - 1;

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
