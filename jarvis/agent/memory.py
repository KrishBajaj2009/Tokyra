"""Explicit, dated fact storage confined to the app's memory directory."""
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import uuid

MEMORY_ROOT = Path(__file__).resolve().parents[1] / "memory"


def remember(fact):
    if not isinstance(fact, str) or not 1 <= len(fact.strip()) <= 1500:
        raise ValueError("A memory must be one fact of 1–1,500 characters.")
    fact = fact.strip()
    if re.search(r"\b(?:gsk_|sk[-_]|ghp_)[A-Za-z0-9_-]{15,}", fact):
        raise ValueError("Keep API keys in .env, not in memory.")
    if MEMORY_ROOT.is_symlink() or any(parent.is_symlink() for parent in MEMORY_ROOT.parents):
        raise ValueError("Memory storage must not point through a symlink.")
    MEMORY_ROOT.mkdir(exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc)
    name = f"{stamp:%Y-%m-%d_%H%M%S}-{uuid.uuid4().hex[:8]}.md"
    fd = os.open(MEMORY_ROOT / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as file:
        file.write(f"# Remembered fact\n\nRecorded: {stamp.isoformat()}\n\n{fact}\n")
    return {"fact": fact, "file": f"memory/{name}", "recorded": stamp.isoformat()}


def facts():
    if not MEMORY_ROOT.exists() or MEMORY_ROOT.is_symlink():
        return []
    result = []
    for path in sorted(MEMORY_ROOT.glob("*.md"), reverse=True)[:40]:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 4000:
            continue
        result.append({"file": f"memory/{path.name}", "text": path.read_text(encoding="utf-8")})
    return result
