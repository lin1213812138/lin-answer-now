# answer-now（查到结果立即返回）

一个 DeepSeek Harness 插件：让 AI **一拿到可用结果就立即输出答案**，不再反复做多余查询浪费时间，并在调用次数超标时随时提醒它"该返回结果了"。

## 功能

1. **注入系统提示指令** —— 拿到可用结果立即停止查询；禁止重复查询；一次决定性查询优于多次窄查询；不做填充性工具调用。
2. **按 agent / 按回合统计工具调用次数** —— 达到阈值就往 agent 的 inbox 里插入逐级升级的提醒（"可以开始回答了" → "立即停止调用工具，输出最终答案"）。
3. **你发新消息时计数清零**，每一轮都重新开始。

只提醒、不拦截：不会否决或阻止任何工具调用，因此不会破坏正常工作流。

## 安装

```sh
dsh plugin --profile desktop add lin-answer-now
```

或从 GitHub 源码安装：

```sh
dsh plugin --profile desktop add https://github.com/lin1213812138/lin-answer-now
```

之后重启 `dsh web`（或刷新页面）即可生效。

## 配置

以下均为可选项，默认值即可用。

```yaml
- id: answer-now
  name: lin-answer-now
  config:
    thresholds: [4, 7, 10]        # 第几次调用开始提醒，之后逐级升级
    include: []                   # 只统计这些工具（留空 = 全部）
    exclude: ["answer_now"]       # 这些工具不计入
    quietTools: ["todo_write", "todo_read", "todo_write_many", "schedule_list"]
    cooldownSteps: 1              # 两次提醒之间跳过几次调用
    reminderSummary: "answer now" # 提醒消息的摘要文字
    resetOnUserMessage: true      # 你发送新消息时清零计数
```

## 环境要求

DSH ≥ 0.2.0。

## License

MIT
