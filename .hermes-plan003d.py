# Plan 003c: PredictionStage truth-drop — CRLF signature lines.
path = "apps/web/src/components/stage-modes.tsx"
text = open(path, encoding="utf-8", newline="").read()

old = "            initial={{ scale: 0, y: -60, opacity: 0 }}\n"
assert text.count(old) == 1
new = (
    "            initial={\n"
    "              reduceMotion ? false : { scale: 0.94, y: -24, opacity: 0 }\n"
    "            }\n"
)
text = text.replace(old, new)

sig = 'export function PredictionStage({\r\n  activity,\r\n  aggregate,\r\n}: {\r\n  activity: Activity;\r\n  aggregate: Extract<ActivityAggregate, { type: "prediction" }> | null;\r\n}) {\r\n'
assert text.count(sig) == 1, f"sig {text.count(sig)}"
text = text.replace(
    sig,
    sig + "  const reduceMotion = useReducedMotion();\r\n",
)

open(path, "w", encoding="utf-8", newline="").write(text)
print("ok")
