/**
 * Visual config panel for lin-answer-now.
 *
 * Rendered inside the Plugin Manager page, on this bundle's row, through the
 * host's `plugins.row.config` slot (keyed by `<package>#<row id>`). Plain React
 * styled only with inherited theme values: no iframe, no local server, no
 * hard-coded palette, so it follows light/dark and the host locale.
 */
window.__ModuleLoader__.load({
  id: "lin-answer-now",
  factory(require) {
    const React = require("react");
    const h = React.createElement;

    const ROUTE = "/api/lin-answer-now/config";

    /** Hairline that works on light and dark backgrounds without knowing the palette. */
    const HAIRLINE = "color-mix(in srgb, currentColor 18%, transparent)";
    const SOFT = "color-mix(in srgb, currentColor 6%, transparent)";
    const SOFTER = "color-mix(in srgb, currentColor 3%, transparent)";

    const SECTIONS = [
      {
        title: "提醒",
        desc: "工具调用数超过阈值时，逐级提醒模型收尾。",
        fields: [
          { key: "thresholds", label: "提醒阈值", kind: "thresholds", hint: "依次在第 N 次调用后提醒" },
          { key: "cooldownSteps", label: "提醒间隔", kind: "number", min: 0, max: 10, unit: "次调用", hint: "两次提醒之间至少相隔的调用数" },
          { key: "showStartNotice", label: "开场状态条", kind: "bool", hint: "会话第一步先说明本插件已启用" },
        ],
      },
      {
        title: "工具范围",
        desc: "只统计哪些工具、以及哪些工具不该触发提醒。",
        fields: [
          { key: "include", label: "只统计", kind: "list", rows: 3, hint: "每行一个，支持 * 通配；留空表示全部" },
          { key: "exclude", label: "排除", kind: "list", rows: 3, hint: "每行一个，支持 * 通配" },
          { key: "quietTools", label: "安静工具", kind: "list", rows: 3, hint: "首个阈值之前不触发提醒的工具" },
        ],
      },
      {
        title: "重复调用",
        desc: "同一个工具带同样的参数反复调用时，额外提醒一次。",
        fields: [
          { key: "repeatReminderEnabled", label: "检测重复调用", kind: "bool" },
          { key: "repeatMax", label: "重复次数", kind: "number", min: 1, max: 10, unit: "次", hint: "超过该次数后提醒" },
        ],
      },
      {
        title: "会话行为",
        desc: "计数在什么范围内生效。",
        fields: [
          { key: "resetOnUserMessage", label: "用户发言后重置", kind: "bool", hint: "关闭则整个会话累计" },
          { key: "skipSubagents", label: "跳过子代理", kind: "bool", hint: "子代理会产生大量工具调用，建议保持开启" },
          { key: "reminderSummary", label: "提醒标签", kind: "text", hint: "出现在提醒文本的方括号里" },
        ],
      },
      {
        title: "独立审查",
        desc: "每轮结束时用另一个模型给最终答案打分，低于阈值就打回重做。",
        fields: [
          { key: "reviewEnabled", label: "启用审查", kind: "bool" },
          { key: "reviewThreshold", label: "分数阈值", kind: "number", min: 1, max: 100, unit: "分", hint: "低于该分数触发重做" },
          { key: "maxChallenges", label: "最多重试", kind: "number", min: 1, max: 8, unit: "次", hint: "超过则放行本轮" },
          { key: "reviewProvider", label: "审查模型 Provider", kind: "text", hint: "留空则复用当前模型" },
          { key: "reviewModel", label: "审查模型 Model", kind: "text", hint: "与 Provider 需同时填写" },
          { key: "maxReviewTokens", label: "审查输出上限", kind: "number", min: 1, max: 4096, unit: "tokens" },
          { key: "reviewTimeoutMs", label: "审查超时", kind: "number", min: 1000, max: 600000, unit: "ms" },
        ],
      },
    ];

    const styles = {
      root: { display: "flex", flexDirection: "column", font: "inherit", color: "inherit" },
      head: { display: "flex", flexDirection: "column", gap: 2, padding: "2px 0 10px" },
      headTitle: { fontSize: 14, fontWeight: 600, lineHeight: 1.4 },
      muted: { fontSize: 12, opacity: 0.6, lineHeight: 1.5 },
      section: {
        border: `1px solid ${SOFT}`,
        borderRadius: 10,
        padding: "12px 14px 6px",
        marginBottom: 10,
        background: SOFTER,
      },
      sectionHead: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10, flexWrap: "wrap" },
      sectionTitle: { fontSize: 13, fontWeight: 600 },
      grid: { display: "grid", gridTemplateColumns: "minmax(96px, 168px) minmax(0, 1fr)", columnGap: 14, rowGap: 10, alignItems: "start" },
      label: { fontSize: 13, lineHeight: "28px", opacity: 0.9 },
      labelMuted: { fontSize: 13, lineHeight: "28px", opacity: 0.9, cursor: "pointer" },
      cell: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
      hint: { fontSize: 11.5, opacity: 0.55, lineHeight: 1.5 },
      input: {
        font: "inherit",
        fontSize: 13,
        color: "inherit",
        background: "transparent",
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 7,
        padding: "4px 9px",
        height: 28,
        boxSizing: "border-box",
        minWidth: 0,
      },
      number: { width: 96, textAlign: "right", fontVariantNumeric: "tabular-nums" },
      textarea: {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 12.5,
        lineHeight: 1.55,
        color: "inherit",
        background: "transparent",
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 7,
        padding: "6px 9px",
        resize: "vertical",
        boxSizing: "border-box",
        width: "100%",
      },
      inline: { display: "flex", alignItems: "center", gap: 8, minHeight: 28 },
      withUnit: { display: "flex", alignItems: "center", gap: 8 },
      unit: { fontSize: 12, opacity: 0.55 },
      checkbox: { width: 15, height: 15, margin: 0, accentColor: "currentColor", cursor: "pointer" },
      thresholds: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minHeight: 28 },
      arrow: { fontSize: 12, opacity: 0.4 },
      footer: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        paddingTop: 10,
        borderTop: `1px solid ${SOFT}`,
        marginTop: 4,
        paddingBottom: 2,
      },
      button: {
        font: "inherit",
        fontSize: 13,
        color: "inherit",
        background: "color-mix(in srgb, currentColor 8%, transparent)",
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 7,
        padding: "0 16px",
        height: 30,
        cursor: "pointer",
      },
      buttonPrimary: {
        font: "inherit",
        fontSize: 13,
        color: "inherit",
        background: "color-mix(in srgb, currentColor 16%, transparent)",
        border: `1px solid color-mix(in srgb, currentColor 34%, transparent)`,
        borderRadius: 7,
        padding: "0 18px",
        height: 30,
        fontWeight: 600,
        cursor: "pointer",
      },
      buttonDisabled: { opacity: 0.45, cursor: "default" },
      status: { fontSize: 12, opacity: 0.7, minHeight: 18 },
      dots: { display: "flex", gap: 4, alignItems: "center" },
      dot: { width: 6, height: 6, borderRadius: 999, background: "currentColor", opacity: 0.35 },
      dotOn: { width: 16, height: 6, borderRadius: 999, background: "currentColor", opacity: 0.75 },
      loaded: { padding: "18px 0", fontSize: 13, opacity: 0.6 },
    };

    function sameValue(a, b) {
      if (Array.isArray(a) || Array.isArray(b)) {
        const left = Array.isArray(a) ? a : [];
        const right = Array.isArray(b) ? b : [];
        return left.length === right.length && left.every((item, index) => String(item) === String(right[index]));
      }
      return String(a ?? "") === String(b ?? "");
    }

    function toLines(value) {
      return Array.isArray(value) ? value.join("\n") : "";
    }

    function ConfigPanel() {
      const [saved, setSaved] = React.useState(null);
      const [draft, setDraft] = React.useState({});
      const [status, setStatus] = React.useState("loading");
      const [message, setMessage] = React.useState("");
      const [tone, setTone] = React.useState("idle");

      React.useEffect(() => {
        let alive = true;
        fetch(ROUTE, { headers: { accept: "application/json" } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then((payload) => {
            if (!alive) return;
            const config = payload.config ?? {};
            setSaved(config);
            setDraft(config);
            setStatus("ready");
          })
          .catch((error) => {
            if (!alive) return;
            setStatus("error");
            setTone("error");
            setMessage(`读取配置失败：${String(error)}`);
          });
        return () => {
          alive = false;
        };
      }, []);

      const setField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

      const dirty = saved !== null && Object.keys(draft).some((key) => !sameValue(draft[key], saved[key]));

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
          const config = payload.config ?? draft;
          setSaved(config);
          setDraft(config);
          setStatus("ready");
          setTone("ok");
          setMessage(`已保存，下一轮生效 · ${new Date().toLocaleTimeString()}`);
        } catch (error) {
          setStatus("ready");
          setTone("error");
          setMessage(`保存失败：${String(error)}`);
        }
      };

      const reset = () => {
        if (saved === null) return;
        setDraft(saved);
        setTone("idle");
        setMessage("已恢复为当前生效值");
      };

      if (status === "loading") {
        return h("div", { style: styles.loaded }, "读取配置中…");
      }

      const thresholdValues = Array.isArray(draft.thresholds) && draft.thresholds.length
        ? draft.thresholds.map((n) => Number(n) || 0)
        : [3, 5, 8];

      const setThreshold = (index, raw) => {
        const next = thresholdValues.slice();
        next[index] = raw === "" ? 0 : Number(raw);
        setField("thresholds", next);
      };

      const controlFor = (field) => {
        const value = draft[field.key];

        if (field.kind === "bool") {
          return h(
            "div",
            { style: styles.inline },
            h("input", {
              id: `lan-${field.key}`,
              type: "checkbox",
              role: "switch",
              checked: value === true,
              onChange: (event) => setField(field.key, event.target.checked),
              style: styles.checkbox,
            }),
            h("span", { style: { fontSize: 13, opacity: 0.8 } }, value === true ? "已开启" : "已关闭"),
          );
        }

        if (field.kind === "thresholds") {
          return h(
            "div",
            { style: styles.thresholds },
            thresholdValues.map((number, index) =>
              h(React.Fragment, { key: index },
                index > 0 ? h("span", { style: styles.arrow }, "→") : null,
                h("input", {
                  type: "number",
                  min: 1,
                  max: 99,
                  value: number === 0 ? "" : String(number),
                  onChange: (event) => setThreshold(index, event.target.value),
                  "aria-label": `第 ${index + 1} 级阈值`,
                  style: { ...styles.input, ...styles.number },
                }),
              ),
            ),
            h("span", { style: styles.unit }, "次调用"),
          );
        }

        if (field.kind === "number") {
          return h(
            "div",
            { style: styles.withUnit },
            h("input", {
              type: "number",
              min: field.min,
              max: field.max,
              value: value === undefined || value === null || value === "" ? "" : String(value),
              onChange: (event) => setField(field.key, event.target.value === "" ? "" : Number(event.target.value)),
              "aria-label": field.label,
              style: { ...styles.input, ...styles.number },
            }),
            field.unit ? h("span", { style: styles.unit }, field.unit) : null,
          );
        }

        if (field.kind === "list") {
          return h("textarea", {
            rows: field.rows ?? 3,
            spellCheck: false,
            value: toLines(value),
            placeholder: "每行一个",
            onChange: (event) =>
              setField(field.key, event.target.value.split("\n").map((line) => line.trim()).filter(Boolean)),
            "aria-label": field.label,
            style: styles.textarea,
          });
        }

        return h("input", {
          type: "text",
          value: value === undefined || value === null ? "" : String(value),
          onChange: (event) => setField(field.key, event.target.value),
          "aria-label": field.label,
          style: { ...styles.input, width: "100%" },
        });
      };

      const sections = SECTIONS.map((section) => {
        const rows = [];
        for (const field of section.fields) {
          rows.push(h("div", { key: `${field.key}-label`, style: styles.label }, field.label));
          rows.push(
            h(
              "div",
              { key: `${field.key}-cell`, style: styles.cell },
              controlFor(field),
              field.hint ? h("div", { style: styles.hint }, field.hint) : null,
            ),
          );
        }
        return h(
          "section",
          { key: section.title, style: styles.section },
          h(
            "div",
            { style: styles.sectionHead },
            h("span", { style: styles.sectionTitle }, section.title),
            h("span", { style: styles.muted }, section.desc),
          ),
          h("div", { style: styles.grid }, rows),
        );
      });

      const levels = thresholdValues.filter((n) => n > 0);
      const summary = levels.length
        ? `第 ${levels.join(" / ")} 次工具调用后逐级提醒`
        : "未设置阈值，只会注入系统提示，不再插入提醒";

      return h(
        "div",
        { style: styles.root },
        h(
          "div",
          { style: styles.head },
          h("div", { style: styles.headTitle }, "answer-now 配置"),
          h("div", { style: styles.muted }, summary),
        ),
        sections,
        h(
          "div",
          { style: styles.footer },
          h("button", {
            type: "button",
            onClick: save,
            disabled: status === "saving" || !dirty,
            style: {
              ...styles.buttonPrimary,
              ...(status === "saving" || !dirty ? styles.buttonDisabled : null),
            },
          }, status === "saving" ? "保存中…" : "保存"),
          h("button", {
            type: "button",
            onClick: reset,
            disabled: !dirty,
            style: { ...styles.button, ...(!dirty ? styles.buttonDisabled : null) },
          }, "重置"),
          h(
            "div",
            { style: styles.dots, "aria-hidden": "true" },
            h("span", { style: dirty ? styles.dotOn : styles.dot }),
            h("span", { style: styles.dot }),
            h("span", { style: styles.dot }),
          ),
          h(
            "span",
            { style: { ...styles.status, ...(tone === "error" ? { opacity: 0.95 } : null) } },
            message || (dirty ? "有未保存的修改" : "写入插件自己的 JSON 配置"),
          ),
        ),
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
