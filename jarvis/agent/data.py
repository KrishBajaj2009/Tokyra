"""The only boundary that reads real source files or selects demo/real mode.

Indexing is read-only. Symlinks, special files, oversized documents and excluded
directories are never opened as source documents. Configuration is local only.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import stat
import tempfile

from .pdf_text import extract_pdf_text

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MAX_FILE_BYTES = 2 * 1024 * 1024
EXCLUDED_DIRS = frozenset({"node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build", "coverage"})
EXTENSIONS = frozenset({".md", ".markdown", ".txt", ".pdf"})


class ConfigurationError(ValueError):
    """Invalid local settings; fail closed instead of selecting personal data."""


@dataclass
class DataSnapshot:
    demo: bool
    roots: list[str]
    documents: list[dict] = field(default_factory=list)
    skipped: Counter = field(default_factory=Counter)
    warnings: list[str] = field(default_factory=list)


def _local_values() -> dict[str, str]:
    values: dict[str, str] = {}
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            name, value = stripped.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[name.strip()] = value
    return values


def setting(name: str, default: str = "") -> str:
    return os.environ.get(name, _local_values().get(name, default))


def save_source_settings(roots, demo=False):
    """Persist an explicit importer choice to app configuration, never source folders."""
    values = _local_values()
    values["JARVIS_DEMO"] = "1" if demo else "0"
    values["JARVIS_FOLDERS"] = json.dumps(roots)
    values["JARVIS_INCLUDE_CODE"] = "1"
    destination = PROJECT_ROOT / ".env"
    if destination.is_symlink():
        raise ConfigurationError("Configuration must not be a symlink.")
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=PROJECT_ROOT, delete=False) as file:
        temporary = Path(file.name)
        os.chmod(temporary, 0o600)
        for key, value in values.items(): file.write(f"{key}={value}\n")
    try:
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _settings() -> tuple[bool, list[Path]]:
    values = _local_values()
    # Read the demo switch here, and nowhere else in the application.
    mode = os.environ.get("JARVIS_DEMO", values.get("JARVIS_DEMO", "1"))
    if mode not in {"0", "1"}:
        raise ConfigurationError("JARVIS_DEMO must be exactly 1 (demo) or 0 (real).")
    if mode == "1":
        return True, [PROJECT_ROOT / "data" / "demo"]
    try:
        folders = json.loads(os.environ.get("JARVIS_FOLDERS", values.get("JARVIS_FOLDERS", "[]")))
    except json.JSONDecodeError as exc:
        raise ConfigurationError("JARVIS_FOLDERS must be a JSON array of absolute folder paths.") from exc
    if not isinstance(folders, list) or not folders or not all(isinstance(p, str) and p for p in folders):
        raise ConfigurationError("Real mode requires at least one explicit folder in JARVIS_FOLDERS.")
    paths = [Path(folder).expanduser() for folder in folders]
    if any(not path.is_absolute() for path in paths):
        raise ConfigurationError("Every source folder must be an absolute path.")
    return False, paths


def _read_document(path: Path, root: Path) -> bytes:
    """Open through verified directories, then check the opened file's type/size."""
    if not path.resolve().is_relative_to(root):
        raise ValueError("File resolves outside the configured source folder.")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    if os.open in os.supports_dir_fd and hasattr(os, "O_NOFOLLOW"):
        # Verify every ancestor at open time; a concurrent symlink swap must not
        # redirect the read into some other folder. No path component is followed.
        directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        directory_fd = os.open(path.anchor, directory_flags)
        try:
            for component in path.parts[1:-1]:
                next_fd = os.open(component, directory_flags, dir_fd=directory_fd)
                os.close(directory_fd)
                directory_fd = next_fd
            descriptor = os.open(path.name, flags, dir_fd=directory_fd)
        finally:
            os.close(directory_fd)
    else:
        # Platforms without no-follow directory opens are deliberately refused
        # instead of weakening the read boundary around personal documents.
        raise ValueError("This platform lacks secure no-follow folder reads.")
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("Not a regular file.")
        if info.st_size > MAX_FILE_BYTES:
            raise OverflowError("Document exceeds the 2 MB limit.")
        with os.fdopen(descriptor, "rb") as stream:
            descriptor = -1
            raw = stream.read(MAX_FILE_BYTES + 1)
        if len(raw) > MAX_FILE_BYTES:
            raise OverflowError("Document grew beyond the 2 MB limit while being read.")
        return raw
    finally:
        if descriptor != -1:
            os.close(descriptor)


def load_documents(*, project_roots=None, include_code=False) -> DataSnapshot:
    if project_roots is None:
        demo, requested_roots = _settings()
        include_code = include_code or (not demo and setting("JARVIS_INCLUDE_CODE", "0") == "1")
    else:
        if not isinstance(project_roots, list) or not project_roots or not all(isinstance(p, str) and Path(p).expanduser().is_absolute() for p in project_roots):
            raise ConfigurationError("Choose at least one absolute project-folder path.")
        demo, requested_roots = False, [Path(p).expanduser() for p in project_roots]
    code_extensions = {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".html", ".css", ".java", ".swift", ".go", ".rs", ".json", ".yaml", ".yml", ".toml"} if include_code else set()
    if demo:
        from data.generate_demo import generate_demo
        if not requested_roots[0].exists():
            generate_demo()
    result = DataSnapshot(demo=demo, roots=[])
    visited: set[tuple[int, int]] = set()
    accepted_roots: list[Path] = []
    for requested in requested_roots:
        if any(part in EXCLUDED_DIRS for part in requested.parts):
            raise ConfigurationError(f"Source folder is inside an excluded directory: {requested}")
        if requested.is_symlink() or any(p.is_symlink() for p in requested.parents):
            raise ConfigurationError(f"Source folder has a symlink in its path: {requested}")
        if not requested.is_dir():
            raise ConfigurationError(f"Source folder does not exist or is not a directory: {requested}")
        root = requested.resolve()
        if root in accepted_roots:
            continue
        accepted_roots.append(root)
    for root_number, root in enumerate(accepted_roots):
        source_id = f"source-{root_number}"
        result.roots.append("data/demo" if demo else str(root))

        def walk_error(exc: OSError) -> None:
            result.warnings.append(f"Could not scan {exc.filename}: {exc.strerror}")

        for directory, directories, filenames in os.walk(root, topdown=True, followlinks=False, onerror=walk_error):
            parent = Path(directory)
            kept = []
            for name in sorted(directories):
                candidate = parent / name
                if name in EXCLUDED_DIRS or name.startswith("."):
                    result.skipped["excluded_directories"] += 1
                elif candidate.is_symlink():
                    result.skipped["symlinks"] += 1
                else:
                    kept.append(name)
            directories[:] = kept
            for name in sorted(filenames):
                path = parent / name
                if (name.startswith(".") or any(term in name.lower() for term in ("credential", "secret", "private-key", "package-lock", "yarn.lock", "pnpm-lock"))):
                    result.skipped["private_or_generated_files"] += 1
                    continue
                if path.suffix.lower() not in EXTENSIONS | code_extensions:
                    result.skipped["unsupported_extensions"] += 1
                    continue
                relative = path.relative_to(root).as_posix()
                citation = f"data/demo/{relative}" if demo else str(path)
                try:
                    info = path.lstat()
                    if stat.S_ISLNK(info.st_mode):
                        result.skipped["symlinks"] += 1
                        continue
                    if not stat.S_ISREG(info.st_mode):
                        result.skipped["special_files"] += 1
                        continue
                    identity = (info.st_dev, info.st_ino)
                    if identity in visited:
                        result.skipped["duplicate_files"] += 1
                        continue
                    if info.st_size > MAX_FILE_BYTES:
                        result.skipped["over_2mb"] += 1
                        continue
                    raw = _read_document(path, root)
                    if path.suffix.lower() == ".pdf":
                        content, warnings = extract_pdf_text(raw)
                        result.warnings.extend(f"{citation}: {warning}" for warning in warnings)
                        if not content.strip():
                            result.skipped["pdf_without_extractable_text"] += 1
                            continue
                        kind = "pdf"
                    else:
                        try:
                            encoding = "utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
                            content = raw.decode(encoding)
                        except UnicodeError:
                            result.skipped["unsupported_text_encoding"] += 1
                            result.warnings.append(f"{citation}: unsupported text encoding; save as UTF-8.")
                            continue
                        if "\x00" in content:
                            result.skipped["binary_text_file"] += 1
                            result.warnings.append(f"{citation}: binary data in a text file; skipped.")
                            continue
                        kind = "md" if path.suffix.lower() in {".md", ".markdown"} else "txt"
                    # Recognizable credential strings in code or notes never enter
                    # browser responses or model context. This is not a full DLP engine.
                    import re
                    content, redactions = re.subn(r"\b(?:gsk_[A-Za-z0-9]{20,}|sk[-_][A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b", "[REDACTED CREDENTIAL]", content)
                    if redactions:
                        result.warnings.append(f"{citation}: redacted {redactions} recognizable credential strings.")
                    visited.add(identity)
                    result.documents.append({"id": f"{source_id}:{relative}", "source_id": source_id,
                                             "path": citation, "relative_path": relative,
                                             "content": content, "format": kind})
                except OverflowError:
                    result.skipped["over_2mb"] += 1
                except (OSError, ValueError) as exc:
                    result.skipped["unreadable_files"] += 1
                    result.warnings.append(f"{citation}: could not read ({exc}).")
    result.documents.sort(key=lambda document: document["id"])
    return result
