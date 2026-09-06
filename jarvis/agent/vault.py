"""Pure, standard-library indexing and search for documents supplied by data.py.

This module never opens files. Document text, including instructions found in
that text, is indexed as data and cannot trigger actions.
"""

from collections import Counter, defaultdict
import math
import posixpath
import re


_EXTENSIONS = {".md", ".markdown", ".txt", ".pdf"}
_STOPWORDS = frozenset(
    "a an and are as at be been being but by can could did do does for from "
    "had has have how i if in into is it its me my of on or our please show "
    "some tell than that the their them then there these they this those to "
    "us was we were what when where which who why will with would you your".split()
)
_FOLDER_TYPES = {
    "client": "client", "clients": "client", "customer": "client",
    "customers": "client", "project": "project", "projects": "project",
    "invoice": "invoice", "invoices": "invoice", "meeting": "meeting",
    "meetings": "meeting", "person": "person", "people": "person",
    "contact": "person", "contacts": "person", "task": "task",
    "tasks": "task", "service": "service", "services": "service",
    "product": "product", "products": "product", "idea": "idea",
    "ideas": "idea", "research": "research", "finance": "finance",
    "finances": "finance", "proposal": "proposal", "proposals": "proposal",
    "process": "process", "processes": "process", "resource": "resource",
    "resources": "resource", "note": "note", "notes": "note",
}


def _scalar(value):
    """Read a plain or quoted single-line frontmatter scalar, not YAML code."""
    value = value.strip()
    if not value or value[0] in "[{&*!|>":
        return ""
    if value[0] in "\"'":
        quote = value[0]
        match = re.match(r"^(['\"])(.*?)\1\s*(?:#.*)?$", value)
        if not match:
            return ""
        value = match.group(2)
        if quote == "'":
            value = value.replace("''", "'")
    else:
        value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
    return value


def _frontmatter(content):
    """Return the supported metadata and text after a closed frontmatter block."""
    lines = content.lstrip("\ufeff").splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, content
    closing = next(
        (i for i, line in enumerate(lines[1:], 1)
         if line.strip() in {"---", "..."}), None
    )
    if closing is None:
        return {}, content
    metadata = {}
    for line in lines[1:closing]:
        match = re.match(r"^(title|type)\s*:\s*(.*?)\s*$", line, re.IGNORECASE)
        if match:
            value = _scalar(match.group(2))
            if value:
                metadata[match.group(1).lower()] = value
    return metadata, "\n".join(lines[closing + 1:])


def _plain_body(content):
    """Remove fenced/inline code before interpreting headings and wiki links."""
    result = []
    fence = None
    for line in content.splitlines():
        match = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if fence:
            if match and match.group(1)[0] == fence[0] and len(match.group(1)) >= len(fence):
                fence = None
            continue
        if match:
            fence = match.group(1)
            continue
        result.append(re.sub(r"(`+).*?\1", "", line))
    return "\n".join(result)


def _without_extension(path):
    stem, extension = posixpath.splitext(path)
    return stem if extension.lower() in _EXTENSIONS else path


def _path_key(path, with_extension=False):
    path = posixpath.normpath(path)
    return (path if with_extension else _without_extension(path)).casefold()


def _node_sort(node):
    return (node["title"].casefold(), node["relative_path"].casefold(),
            node["source_id"], node["id"])


def _make_node(document):
    content = str(document.get("content", ""))
    relative_path = str(document["relative_path"])
    metadata, body = _frontmatter(content)
    heading = re.search(r"^\s{0,3}#\s+(.+?)\s*#*\s*$", _plain_body(body), re.MULTILINE)
    title = metadata.get("title") or (heading.group(1) if heading else "")
    title = title or _without_extension(posixpath.basename(relative_path))
    note_type = metadata.get("type", "").strip().casefold()
    if not note_type:
        # Prefer the nearest recognized folder; organizational wrappers add no type.
        for folder in reversed(relative_path.split("/")[:-1]):
            folder = re.sub(r"^\d+[\s._-]*", "", folder.casefold())
            if folder in _FOLDER_TYPES:
                note_type = _FOLDER_TYPES[folder]
                break
    return {
        "id": str(document["id"]),
        "title": title,
        "path": str(document["path"]),
        "relative_path": relative_path,
        "source_id": str(document["source_id"]),
        "content": content,
        "type": note_type or "note",
        "degree": 0,
    }


def build_index(documents):
    """Build a deterministic graph from an iterable of document dictionaries.

    Edges are unique, undirected ``{source, target}`` pairs of node IDs. Wiki
    links resolve only within the same source. Bare names must be unique across
    that source; ambiguous names are reported instead of guessed. Explicit
    ``./`` and ``../`` links resolve relative to their containing note.
    """
    nodes = sorted((_make_node(document) for document in documents), key=_node_sort)
    by_id = {node["id"]: node for node in nodes}
    if len(by_id) != len(nodes):
        raise ValueError("Document IDs must be unique within an index.")

    paths = defaultdict(set)
    exact_paths = defaultdict(set)
    names = defaultdict(set)
    filenames = defaultdict(set)
    for node in nodes:
        scope = node["source_id"]
        paths[(scope, _path_key(node["relative_path"]))].add(node["id"])
        exact_paths[(scope, _path_key(node["relative_path"], with_extension=True))].add(node["id"])
        names[(scope, node["title"].casefold())].add(node["id"])
        filename = posixpath.basename(node["relative_path"])
        filenames[(scope, filename.casefold())].add(node["id"])
        basename = _without_extension(filename)
        names[(scope, basename.casefold())].add(node["id"])

    def path_candidates(scope, path):
        has_extension = posixpath.splitext(path)[1].lower() in _EXTENSIONS
        lookup = exact_paths if has_extension else paths
        return lookup.get((scope, _path_key(path, with_extension=has_extension)), ())

    edge_pairs = set()
    unresolved = []
    seen_unresolved = set()
    for node in nodes:
        _, body = _frontmatter(node["content"])
        for match in re.finditer(r"(?<!\\)\[\[([^\]\n]+)\]\]", _plain_body(body)):
            raw_target = match.group(1).split("|", 1)[0].strip()
            target = raw_target.split("#", 1)[0].strip()
            if not target:  # [[#section]] points to the current note.
                continue
            scope = node["source_id"]
            parent = posixpath.dirname(node["relative_path"])
            if target.startswith(("./", "../")):
                candidates = set(path_candidates(scope, posixpath.join(parent, target)))
            elif target.startswith("/"):
                candidates = set(path_candidates(scope, target.lstrip("/")))
            elif "/" in target:
                candidates = set(path_candidates(scope, target))
                candidates.update(path_candidates(scope, posixpath.join(parent, target)))
            else:
                lookup = filenames if posixpath.splitext(target)[1].lower() in _EXTENSIONS else names
                candidates = set(lookup.get((scope, target.casefold()), ()))
            if len(candidates) == 1:
                other_id = next(iter(candidates))
                if other_id != node["id"]:
                    edge_pairs.add(tuple(sorted((node["id"], other_id))))
            else:
                reason = "ambiguous" if candidates else "not_found"
                key = (node["id"], raw_target, reason)
                if key not in seen_unresolved:
                    seen_unresolved.add(key)
                    unresolved.append({
                        "source_id": node["id"],
                        "path": node["path"],
                        "target": raw_target,
                        "reason": reason,
                        "candidates": sorted(candidates),
                    })

    edges = [{"source": source, "target": target} for source, target in sorted(edge_pairs)]
    for edge in edges:
        by_id[edge["source"]]["degree"] += 1
        by_id[edge["target"]]["degree"] += 1
    counts = Counter(node["type"] for node in nodes)
    return {
        "nodes": nodes,
        "edges": edges,
        "counts_by_type": dict(sorted(counts.items())),
        "top_hubs": sorted(nodes, key=lambda node: (-node["degree"], _node_sort(node)))[:10],
        "unresolved_links": sorted(
            unresolved, key=lambda link: (link["source_id"], link["target"].casefold(), link["target"])
        ),
    }


def _tokens(text):
    return re.findall(r"[^\W_]+(?:['’\-][^\W_]+)*", text.casefold(), re.UNICODE)


def _snippets(content, query_tokens, limit=2):
    _, body = _frontmatter(content)
    paragraphs = [re.sub(r"\s+", " ", part).strip()
                  for part in re.split(r"\n\s*\n", body)]
    ranked = []
    for position, paragraph in enumerate(paragraphs):
        if not paragraph:
            continue
        words = Counter(_tokens(paragraph))
        score = sum(min(words[token], 3) for token in query_tokens)
        coverage = sum(token in words for token in query_tokens)
        ranked.append((coverage, score, -position, paragraph))
    matches = [item for item in ranked if item[0] > 0]
    chosen = sorted(matches or ranked, reverse=True)[:limit]
    snippets = []
    for _, _, _, paragraph in chosen:
        if len(paragraph) <= 260:
            snippets.append(paragraph)
            continue
        occurrences = [match.start() for match in re.finditer(r"[^\W_]+(?:['’\-][^\W_]+)*", paragraph)
                       if match.group(0).casefold() in query_tokens]
        start = max(0, (occurrences[0] if occurrences else 0) - 75)
        if start:
            boundary = paragraph.find(" ", start)
            start = boundary + 1 if boundary >= 0 else start
        end = min(len(paragraph), start + 250)
        if end < len(paragraph):
            boundary = paragraph.rfind(" ", start, end)
            end = boundary if boundary > start else end
        snippets.append(("…" if start else "") + paragraph[start:end].strip() +
                        ("…" if end < len(paragraph) else ""))
    return snippets


def search(index, query, limit=5):
    """Return lexical matches with transparent scores and source-text snippets.

    Matching uses document-frequency weighting, stronger title matches, and a
    preference for covering the full question. Scores are relevance signals,
    not confidence probabilities or claims of model understanding.
    """
    if not isinstance(query, str) or not isinstance(limit, int) or limit <= 0:
        return []
    query_tokens = set(_tokens(query)) - _STOPWORDS
    if not query_tokens:
        return []
    nodes = index.get("nodes", [])
    prepared = []
    frequencies = Counter()
    for node in nodes:
        title = Counter(_tokens(node["title"]))
        path = Counter(_tokens(node["relative_path"].replace("/", " ")))
        body = Counter(_tokens(_frontmatter(node["content"])[1]))
        found = query_tokens.intersection(title.keys() | path.keys() | body.keys())
        frequencies.update(found)
        prepared.append((node, title, path, body, found))
    results = []
    total = len(nodes)
    phrase = " ".join(_tokens(query))
    for node, title, path, body, found in prepared:
        if not found:
            continue
        score = 0.0
        for token in found:
            weight = math.log(1 + (total - frequencies[token] + 0.5) / (frequencies[token] + 0.5))
            score += weight * (5 * min(title[token], 2) + 1.5 * min(path[token], 2) +
                               (1 + math.log(body[token]) if body[token] else 0))
        score *= 0.5 + 0.5 * len(found) / len(query_tokens)
        if phrase and phrase in " ".join(_tokens(node["title"])):
            score += 2.0
        results.append({**node, "score": round(score, 4),
                        "snippets": _snippets(node["content"], query_tokens)})
    return sorted(results, key=lambda result: (-result["score"], _node_sort(result)))[:limit]
