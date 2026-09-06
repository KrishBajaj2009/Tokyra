"""Generate a reproducible, explicitly fictional knowledge vault. No dependencies."""

from __future__ import annotations

import json
import os
from pathlib import Path
import random
import tempfile

DEMO_ROOT = Path(__file__).absolute().parent / "demo"
SEED = 7319
DEMO_DATE = "2026-09-01"


def fixtures() -> dict[str, str]:
    """Return identical fixtures independently of wall-clock time and location."""
    rng = random.Random(SEED)
    scenarios = ["Coding Prompt", "Long Instructions", "Support Context",
                 "Marketing Brief", "Research Context", "Repeated Context"]
    files: dict[str, str] = {}

    def note(folder: str, title: str, kind: str, body: str) -> None:
        files[f"{folder}/{title}.md"] = (
            f"---\ntitle: {title}\ntype: {kind}\n---\n\n# {title}\n\n"
            "FICTIONAL DEMO — invented names, dates and amounts. Not user data.\n\n"
            + body.rstrip() + "\n"
        )

    note("notes", "Demo Venture", "note", "This is a fictional early-stage AI prompt-compression "
         "business. The aim is to make AI prompts more efficient. There are no clients and "
         "pricing is undecided.\n\nReference: [[Compression Product]], [[Pricing Exploration]], "
         "[[Customer Discovery]], [[Working Preferences]], [[Weekly Review]].")
    note("notes", "Working Preferences", "note", "Example preferences only: brief, direct answers; "
         "cite source files, qualify estimates and take initiative. See [[Demo Venture]].")
    note("products", "Compression Product", "product", "AI prompt compression is the product concept. "
         "All benchmarks in this vault are synthetic examples, not product performance claims. "
         "Potential uses need evaluation in [[Customer Discovery]]. Pricing: [[Pricing Exploration]].\n\n" +
         "\n".join(f"- Explore [[{scenario} Experiment]]." for scenario in scenarios))
    note("decisions", "Pricing Exploration", "decision", "No price has been decided. There is no "
         "known revenue, margin or willingness-to-pay data. Research hypotheses before setting prices. "
         "See [[Customer Discovery]] and [[Compression Product]].")
    note("projects", "Customer Discovery", "project", "No clients are recorded. This fictional plan "
         "proposes learning which prompt-compression problems potential users would pay to solve. "
         "No interviews have occurred and no outreach has been sent. Link findings to "
         "[[Pricing Exploration]] and [[Compression Product]].")
    note("notes", "Weekly Review", "note", f"Fixed demo snapshot: {DEMO_DATE}; "
         "the dates do not move with the real calendar.\n\n" +
         "\n".join(f"- Review [[{scenario} Experiment]] and [[{scenario} Metrics]]." for scenario in scenarios))

    for scenario in scenarios:
        before = rng.choice([1000, 2000, 3000, 4000])
        reduction = rng.choice([20, 30, 40, 50])
        after = before * (100 - reduction) // 100
        note("research", f"{scenario} Research", "research", f"Hypothesis: compression may help "
             f"this scenario. It is untested. No live web research has been performed. "
             f"See [[{scenario} Experiment]] and [[Customer Discovery]].")
        note("experiments", f"{scenario} Experiment", "experiment", f"Product: [[Compression Product]]. "
             f"Context: [[{scenario} Research]]. No real experiment has run. Synthetic example: "
             f"[[{scenario} Metrics]]. Next: [[{scenario} Quality Check]], [[{scenario} User Feedback]].")
        note("metrics", f"{scenario} Metrics", "metric", f"SIMULATED, not measured: input {before:,} "
             f"tokens, output {after:,} tokens. The synthetic reduction is {reduction}% of input tokens. "
             "This does not establish monetary savings, latency improvement or retained answer quality. "
             f"Real model/tokenizer/pricing data is not configured. See [[{scenario} Experiment]] "
             f"and [[{scenario} Quality Check]].")
        note("tasks", f"{scenario} Quality Check", "task", f"Planned example task, no deadline set: "
             "compare meaning and downstream answers before and after compression. "
             f"Use [[{scenario} Experiment]] and qualify [[{scenario} Metrics]].")
        note("tasks", f"{scenario} User Feedback", "task", "Planned example task, no deadline set: "
             "prepare questions about whether this use case solves a valuable problem. No messages sent. "
             f"Relates to [[Customer Discovery]], [[{scenario} Decision]], [[Pricing Exploration]].")
        note("decisions", f"{scenario} Decision", "decision", "Decision pending. "
             f"Needs [[{scenario} Quality Check]] and [[{scenario} User Feedback]]. "
             "Do not turn synthetic metrics into claims about the real product.")
    files["notes/Demo Readme.txt"] = (
        "FICTIONAL DEMO. Fixed seed 7319. These files do not describe the owner.\n"
        "Start at [[Demo Venture]]; review [[Weekly Review]].\n"
    )
    return dict(sorted(files.items()))


def generate_demo() -> Path:
    """Write only to the adjacent demo/ folder, refusing symlink destinations."""
    if DEMO_ROOT.is_symlink():
        raise ValueError("Refusing to generate fixtures through a symlink.")
    if any(parent.is_symlink() for parent in DEMO_ROOT.parents):
        raise ValueError("Refusing a symlink in the demo destination's ancestors.")
    contents = fixtures()
    for relative in contents:
        destination = DEMO_ROOT / relative
        if destination.is_symlink() or destination.parent.is_symlink():
            raise ValueError("Refusing a symlink inside the demo fixture directory.")
        if destination.exists() and not destination.is_file():
            raise ValueError("A demo fixture destination is not a regular file.")
    for relative, content in contents.items():
        destination = DEMO_ROOT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        # Replacing the directory entry leaves any pre-existing hardlink untouched.
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=destination.parent,
                                             prefix=".jarvis-demo-", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(content)
            os.replace(temporary, destination)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    return DEMO_ROOT


if __name__ == "__main__":
    root = generate_demo()
    print(json.dumps({"mode": "fictional demo", "seed": SEED,
                      "files": len(fixtures()), "directory": str(root)}, indent=2))
