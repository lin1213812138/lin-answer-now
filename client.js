/**
 * Visual config panel for lin-answer-now.
 *
 * Rendered inside the Plugin Manager page, on the bundle's row, through the
 * host's own `main.plugins.row.config` slot (keyed by `<package>#<row id>`).
 * It is a plain React component styled with inherited theme values, so it
 * follows light/dark and the host locale without an iframe or a local server.
 */
window.__ModuleLoader__.load({
  id: "lin-answer-now",
  factory(require) {
    const React = require("react");
    const h = React.createElement;

    const ROUTE = "/api/lin-answer-now/config";

    const FIELDS = [
      { key: "reviewEnabled", label: "审查开关（独立模型给每轮打分）", kind: "bool" },
      { key: "reviewThreshold", label: "分数阈值（低于它就打回重做）", kind: "number", min: 1, max: 100 },
      { key: "maxChallenges", label: "单轮最多重试次数", kind: "number", min: 1, max: 8 },
      { key: "thresholds", label: "提醒阈值（逗号分隔，如 3,5,8）", kind: "numbers" },
      { key: "include", label: "只统计这些工具（留空=全部，支持 * 通配）", kind: "list" },
      { key: "exclude", label: "排除这些工具", kind: "list" },
      { key: "quietTools", label: "安静工具（低阈值前不触发提醒）", kind: "list" },
      { key: "cooldownSteps", label: "两次提醒之间最少间隔的调用数", kind: "number", min: 0, max: 10 },
      { key: "repeatReminderEnabled", label: "检测重复调用并提醒", kind: "bool" },
      { key: "repeatMax", label: "同一调用重复几次后提醒", kind: "number", min: 1, max: 10 },
      { key: "skipSubagents", label: "跳过子代理会话", kind: "bool" },
      { key: "resetOnUserMessage", label: "用户发言后重置计数", kind: "bool" },
      { key: "showStartNotice", label: "会话开始时显示状态条", kind: "bool" },
      { key: "reminderSummary", label: "提醒的来源标签", kind: "text" },
      { key: "reviewProvider", label: "审查模型 Provider（与 Model 同时设置）", kind: "text" },
      { key: "reviewModel", label: "审查模型 Model", kind: "text" },
      { key: "maxReviewTokens", label: "审查输出上限（tokens）", kind: "number", min: 1, max: 4096 },
      { key: "reviewTimeoutMs", label: "审查超时（毫秒）", kind: "number", min: 1000, max: 600000 },
    ];

    const styles = {
      wrap: { display: "flex", flexDirection: "column", gap: 12, padding: "4px 0 8px", font: "inherit", color: "inherit" },
      row: { display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(160px, 1fr)", gap: 12, alignItems: "center" },
      label: { fontSize: 13, opacity: 0.85, lineHeight: 1.4 },
      control: {
        font: "inherit",
        color: "inherit",
        background: "transparent",
        border: "1px solid color-mix(in srgb, currentColor 25%, transparent)",
        borderRadius: 6,
        padding: "5px 8px",
        width: "100%",
        boxSizing: "border-box",
      },
      actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
      button: {
        font: "inherit",
        color: "inherit",
        background: "color-mix(in srgb, currentColor 8%, transparent)",
        border: "1px solid color-mix(in srgb, currentColor 25%, transparent)",
        borderRadius: 6,
        padding: "5px 14px",
        cursor: "pointer",
      },
      hint: { fontSize: 12, opacity: 0.65 },
    };

    function toText(value) {
      if (Array.isArray(value)) return value.join("\n");
      return value === undefined || value === null ? "" : String(value);
    }

    function ConfigPanel() {
      const [config, setConfig] = React.useState(null);
      const [draft, setDraft] = React.useState({});
      const [status, setStatus] = React.useState("loading");
      const [message, setMessage] = React.useState("");

      React.useEffect(() => {
        let alive = true;
        fetch(ROUTE, { headers: { accept: "application/json" } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then((payload) => {
            if (!alive) return;
            setConfig(payload.config ?? {});
            setDraft(payload.config ?? {});
            setStatus("ready");
          })
          .catch((error) => {
            if (!alive) return;
            setStatus("error");
            setMessage(`读取配置失败：${String(error)}`);
          });
        return () => {
          alive = false;
        };
      }, []);

      const setField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

      const save = async () => {
        setStatus("saving");
        setMessage("");
        try {
          const response = await fetch(ROUTE, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(draft),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
          setConfig(payload.config ?? draft);
          setDraft(payload.config ?? draft);
          setStatus("ready");
          setMessage(`已保存（${new Date().toLocaleTimeString()}），下一轮生效`);
        } catch (error) {
          setStatus("ready");
          setMessage(`保存失败：${String(error)}`);
        }
      };

      const reset = async () => {
        if (!config) return;
        setDraft(config);
        setMessage("已恢复为当前生效值");
      };

      if (status === "loading") {
        return h("div", { style: styles.wrap }, h("div", { style: styles.hint }, "读取配置中…"));
      }

      const rows = FIELDS.map((field) => {
        const value = draft[field.key];
        let control;
        if (field.kind === "bool") {
          control = h("input", {
            type: "checkbox",
            checked: value === true,
            onChange: (event) => setField(field.key, event.target.checked),
            "aria-label": field.label,
          });
        } else if (field.kind === "number") {
          control = h("input", {
            type: "number",
            min: field.min,
            max: field.max,
            value: value === undefined || value === null ? "" : String(value),
            onChange: (event) => {
              const raw = event.target.value;
              setField(field.key, raw === "" ? "" : Number(raw));
            },
            "aria-label": field.label,
            style: styles.control,
          });
        } else if (field.kind === "numbers" || field.kind === "list") {
          control = h("textarea", {
            rows: field.kind === "list" ? 3 : 2,
            value: toText(value),
            onChange: (event) => {
              const lines = event.target.value.split("\n").map((line) => line.trim());
              if (field.kind === "numbers") {
                const numbers = lines[0] === "" || lines[0] === undefined
                  ? []
                  : lines[0].split(",").map((part) => Number(part.trim())).filter((n) => Number.isFinite(n));
                setField(field.key, numbers);
              } else {
                setField(field.key, lines.filter((line) => line.length > 0));
              }
            },
            "aria-label": field.label,
            style: { ...styles.control, resize: "vertical" },
          });
        } else {
          control = h("input", {
            type: "text",
            value: toText(value),
            onChange: (event) => setField(field.key, event.target.value),
            "aria-label": field.label,
            style: styles.control,
          });
        }
        return h(
          "div",
          { key: field.key, style: styles.row },
          h("div", { style: styles.label }, field.label),
          control,
        );
      });

      return h(
        "div",
        { style: styles.wrap },
        rows,
        h(
          "div",
          { style: styles.actions },
          h("button", { type: "button", style: styles.button, onClick: save, disabled: status === "saving" },
            status === "saving" ? "保存中…" : "保存"),
          h("button", { type: "button", style: styles.button, onClick: reset }, "重置"),
          message ? h("span", { style: styles.hint }, message) : null,
        ),
        h("div", { style: styles.hint }, "保存后写入插件自己的 JSON 配置，下一轮生效，无需重启。"),
      );
    }

    const PACKAGE_NAME = "lin-answer-now";
    const ROW_IDS = ["answer-now", PACKAGE_NAME, "mkt-answer-now"];

    // Keyed slots take `priority` (not `order`), and the slot id is the bare one —
    // the "main." seen in a slot tree dump is only the parent path, not part of the id.
    function registerPanel(ctx, slotName, key) {
      try {
        return ctx.slots.inject(slotName, () =>
          ctx.slots.register({ name: slotName, key, priority: 30 }, ConfigPanel),
        );
      } catch (error) {
        console.error(`[lin-answer-now] config panel failed to register on ${slotName} "${key}":`, error);
        return undefined;
      }
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        // The Plugins page keys `plugins.bundle.config` by the inventory's package
        // name and `plugins.row.config` by `<package>#<row id>`. A renamed install
        // row would otherwise render nothing and report nothing, so register every
        // plausible spelling.
        registerPanel(ctx, "plugins.bundle.config", PACKAGE_NAME);
        for (const rowId of ROW_IDS) {
          registerPanel(ctx, "plugins.row.config", `${PACKAGE_NAME}#${rowId}`);
        }
      },
    };
  },
});
