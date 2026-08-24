# Execute plan 003: fix scale(0)/0.25 origins + gate entrances.
path = "apps/web/src/components/signature-stage-modes.tsx"
text = open(path, encoding="utf-8", newline="").read()
old = "initial={reduceMotion ? false : { scale: 0, opacity: 0 }}"
assert text.count(old) == 1
text = text.replace(old, "initial={reduceMotion ? false : { scale: 0.94, opacity: 0 }}")
open(path, "w", encoding="utf-8", newline="").write(text)

p2 = "apps/web/src/components/stage-modes.tsx"
t2 = open(p2, encoding="utf-8", newline="").read()

# WordBloom ink-press entrance, gated.
old_bloom = (
    "              initial={{ scale: 0.25, opacity: 0, rotate: -8 }}\n"
)
new_bloom = (
    "              initial={\n"
    "                reduceMotion ? false : { scale: 0.92, opacity: 0, rotate: -8 }\n"
    "              }\n"
)
assert t2.count(old_bloom) == 1
t2 = t2.replace(old_bloom, new_bloom)

# Add the hook inside WordBloomStage (after its aggregate line).
hook_anchor = "export function WordBloomStage({"
i = t2.find(hook_anchor)
assert i != -1
body = t2.find("const allTerms", i)
assert body != -1 and body - i < 600
insert_at = t2.rfind("\n", 0, body) + 1
hook_line = "  const reduceMotion = useReducedMotion();\n\n"
t2 = t2[:insert_at] + hook_line + t2[insert_at:]

# Ensure useReducedMotion import.
if "useReducedMotion" in t2.split("\n")[3] or 'useReducedMotion }' in t2[:400]:
    pass
else:
    old_import = 'import { AnimatePresence, motion } from "motion/react";'
    if old_import in t2:
        t2 = t2.replace(
            old_import,
            'import { AnimatePresence, motion, useReducedMotion } from "motion/react";',
        )
    else:
        # find any motion/react import and extend it
        idx = t2.find('from "motion/react";')
        assert idx != -1
        seg_start = t2.rfind("import {", 0, idx)
        seg = t2[seg_start:idx]
        if "useReducedMotion" not in seg:
            new_seg = seg.rstrip()
            if new_seg.endswith("}"):
                new_seg = new_seg[:-1].rstrip() + ", useReducedMotion } "
            t2 = t2[:seg_start] + new_seg + t2[idx:]
open(p2, "w", encoding="utf-8", newline="").write(t2)
print("ok")
