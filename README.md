# answer-now

English | [中文](README.zh.md)

A DeepSeek Harness plugin that pushes the agent to **deliver its answer as soon as it has one**, instead of burning your time on extra queries.

## What it does

1. **Injects instructions into the system prompt** — stop querying the moment you can answer, never repeat a query, prefer one decisive query over several narrow ones, no filler tool calls.
2. **Counts tool calls per agent per turn** — and when the count crosses a threshold, injects an escalating reminder into the agent's inbox ("answer now instead of querying further" → "stop calling tools and produce your final answer").
3. **Resets on new user messages**, so each of your turns starts fresh.

It is advisory-only: it never blocks or rejects a tool call, so it can't break a legitimate workflow.

## Install

From npm (prebuilt, no build step):

```sh
dsh plugin --profile desktop add lin-answer-now
```

Or from GitHub source:

```sh
dsh plugin --profile desktop add https://github.com/lin1213812138/lin-answer-now
```

Then restart `dsh web` (or reload the page) and you're done.

## Configuration

All values are optional; the defaults are sensible.

```yaml
- id: answer-now
  name: lin-answer-now
  config:
    thresholds: [4, 7, 10]        # remind at these tool-call counts, escalating each time
    include: []                   # only watch these tools (empty = all)
    exclude: ["answer_now"]       # never count these tools
    quietTools: ["todo_write", "todo_read", "todo_write_many", "schedule_list"]
    cooldownSteps: 1              # tool calls to skip between reminders
    reminderSummary: "answer now" # summary text on the reminder message
    resetOnUserMessage: true      # reset the counter when you send a new message
```

## Requirements

DSH ≥ 0.2.0.

## License

MIT
