# Plan 002 part 2: consensus + spectrum median + ArrivalCounter digits.
path = "apps/web/src/components/stage-modes.tsx"
text = open(path, encoding="utf-8", newline="").read()

def must_replace(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: found {n}")
    return text.replace(old, new)

# Consensus number.
old_consensus = (
    '          <span className="display text-3xl tabular-nums">\n'
    "            {aggregate.consensus}\n"
    "          </span>\n"
)
new_consensus = (
    '          <AnimatedStat\n'
    "            value={aggregate.consensus}\n"
    '            className="display text-3xl"\n'
    "          />\n"
)
text = must_replace(text, old_consensus, new_consensus, "consensus")

# Spectrum median stat (inside Stat label="room median").
old_median = (
    '        <Stat label="room median">\n'
    '          {values.length > 0 ? String(Math.round(median! / 10)) : "waiting"}\n'
    "        </Stat>\n"
)
new_median = (
    '        <Stat label="room median">\n'
    "          {values.length > 0 ? <AnimatedStat value={Math.round(median! / 10)} /> : \"waiting\"}\n"
    "        </Stat>\n"
)
text = must_replace(text, old_median, new_median, "median")

open(path, "w", encoding="utf-8", newline="").write(text)

# ArrivalCounter in StagePage: NumberFlow digits keep the red kick.
p2 = "apps/web/src/pages/StagePage.tsx"
t2 = open(p2, encoding="utf-8", newline="").read()
old_counter = (
    '      {value}\n'
)
i = t2.find("function ArrivalCounter")
seg_start = t2.find("className=", i)
# Simpler: replace the whole component body block.
old_block = t2[t2.find("export function ArrivalCounter"):]
end = old_block.find("\n}\n") + 3
old_block = old_block[:end]
new_block = '''function ArrivalCounter({ value }: { value: number }) {
  return (
    <motion.p
      key={value}
      initial={shouldReduceMotion ? false : { scale: 1.18, color: "var(--red)" }}
      animate={{ scale: 1, color: "var(--ink)" }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="stage-arrival display mt-3 text-6xl md:text-7xl"
    >
      <NumberFlow value={value} willChange />
    </motion.p>
  );
}
'''
assert "ArrivalCounter" in old_block and old_block.endswith("}\n")
t2 = t2.replace(old_block, new_block)

# import NumberFlow
if 'from "@number-flow/react"' not in t2:
    anchor = 'import QRCode from "qrcode";\n'
    assert t2.count(anchor) == 1
    t2 = t2.replace(anchor, anchor + 'import NumberFlow from "@number-flow/react";\n')

open(p2, "w", encoding="utf-8", newline="").write(t2)
print("ok-part-2")
