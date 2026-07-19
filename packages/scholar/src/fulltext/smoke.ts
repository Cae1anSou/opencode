import { run } from "./run"

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error("usage: smoke <arxiv-id|doi|url>")
    process.exit(1)
  }

  const out = await run({ value: arg })
  console.log(JSON.stringify({
    parsed: out.parsed,
    format: out.format,
    target: out.target,
    note: out.note,
    attempts: out.attempts,
    trace: out.trace,
    preview: out.text.slice(0, 800),
  }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
