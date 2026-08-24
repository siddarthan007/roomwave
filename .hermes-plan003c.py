# Plan 003c: PredictionStage truth-drop scale(0) at :425 — fix + gate.
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

# Gate needs the hook inside PredictionStage. Find its function body.
import re
m = re.search(r'export function PredictionStage\(\{[^}]*aggregate,\s*\}: \{[^}]*\}\) \{\n', text)
assert m, "PredictionStage signature not found"
insert_at = m.end()
# Only add if not already present within next 400 chars.
window = text[insert_at:insert_at+400]
if "useReducedMotion" not in window:
    text = text[:insert_at] + "  const reduceMotion = useReducedMotion();\n" + text[insert_at:]

open(path, "w", encoding="utf-8", newline="").write(text)
print("ok")
