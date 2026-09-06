"""Local graph server and read-only index CLI. Python standard library only."""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path
import sys
import secrets
import threading
import time
from urllib.parse import parse_qs, urlsplit

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent.data import ConfigurationError, load_documents, setting, save_source_settings
from agent.vault import build_index, search
from agent.conversation import Conversation
from agent.provider import ProviderError
from agent import voice, tools, memory

UI_ROOT = Path(__file__).resolve().parents[1] / "ui"
STATIC_FILES = {"/": ("index.html", "text/html; charset=utf-8"),
                "/index.html": ("index.html", "text/html; charset=utf-8"),
                "/styles.css": ("styles.css", "text/css; charset=utf-8"),
                "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                "/graph.js": ("graph.js", "text/javascript; charset=utf-8"),
                "/graph-core.js": ("graph-core.js", "text/javascript; charset=utf-8"),
                "/voice-client.js": ("voice-client.js", "text/javascript; charset=utf-8"),
                "/assistant-ui.js": ("assistant-ui.js", "text/javascript; charset=utf-8"),
                "/favicon.svg": ("favicon.svg", "image/svg+xml")}


class AppState:
    def __init__(self, index, metadata):
        self.index, self.metadata = index, metadata
        self.csrf = secrets.token_urlsafe(32)
        self.conversation = Conversation()
        self.lock = threading.RLock()
        self.previews = {}

    def replace(self, snapshot):
        self.index = build_index(snapshot.documents)
        self.metadata = {"stage": 5, "mode": "fictional demo" if snapshot.demo else "real read-only",
                         "roots": snapshot.roots, "skipped": dict(snapshot.skipped), "warnings": snapshot.warnings}
        self.conversation = Conversation()


class LocalHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, state, **kwargs):
        self.state = state
        super().__init__(*args, **kwargs)

    @property
    def index(self): return self.state.index

    @property
    def metadata(self): return self.state.metadata

    def log_message(self, format, *args):
        # Never log source paths, note contents, search text or request headers.
        pass

    def _send(self, status, body, content_type="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; "
                         "style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self'; object-src 'none'; "
                         "base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, value):
        self._send(status, json.dumps(value, ensure_ascii=False).encode("utf-8"))

    def do_HEAD(self):
        self.do_GET()

    def _allowed(self):
        port = self.server.server_port
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        origin = self.headers.get("Origin")
        if (self.headers.get("Host") not in hosts or
                (origin is not None and origin not in {f"http://{host}" for host in hosts}) or
                self.headers.get("Sec-Fetch-Site") == "cross-site"):
            self._json(403, {"error": "Only requests from this local app are allowed."})
            return False
        return True

    def do_GET(self):
        if not self._allowed(): return
        parsed = urlsplit(self.path)
        if parsed.path == "/api/status":
            enabled = setting("JARVIS_ALLOW_API", "0") == "1"
            self._json(200, {"csrf": self.state.csrf, "model_configured": bool(setting("GROQ_API_KEY")),
                             "api_enabled": enabled, "voice_ready": enabled and bool(setting("ELEVENLABS_API_KEY")),
                             "voice_provider": "ElevenLabs", "model": setting("GROQ_MODEL", "openai/gpt-oss-120b")})
        elif parsed.path == "/api/memory":
            self._json(200, {"facts": memory.facts()})
        elif parsed.path == "/api/index":
            clean = lambda node: {key: value for key, value in node.items() if key != "content"}
            self._json(200, {**self.metadata, "nodes": [clean(node) for node in self.index["nodes"]],
                             "edges": self.index["edges"], "counts_by_type": self.index["counts_by_type"],
                             "top_hubs": [clean(node) for node in self.index["top_hubs"]],
                             "unresolved_links": self.index["unresolved_links"]})
        elif parsed.path == "/api/note":
            note_id = parse_qs(parsed.query).get("id", [None])[0]
            note = next((node for node in self.index["nodes"] if node["id"] == note_id), None)
            self._json(200 if note else 404, note or {"error": "Note is not in the current index."})
        elif parsed.path in STATIC_FILES:
            filename, mime = STATIC_FILES[parsed.path]
            try:
                self._send(200, (UI_ROOT / filename).read_bytes(), mime)
            except OSError:
                self._json(503, {"error": "The interface file is unavailable. Check the local installation."})
        else:
            self._json(404, {"error": "Not found."})

    def do_POST(self):
        if not self._allowed(): return
        if not secrets.compare_digest(self.headers.get("X-Jarvis-Token", ""), self.state.csrf):
            self._json(403, {"error": "Refresh the page before trying this action."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 8 * 1024 * 1024:
                raise ValueError("Request is empty or exceeds the 8 MB limit.")
            self.connection.settimeout(30)
            raw = self.rfile.read(length)
            if len(raw) != length: raise ValueError("The request body was incomplete.")
            path = urlsplit(self.path).path
            if path == "/api/listen":
                self._json(200, {"text": voice.listen(raw, self.headers.get("Content-Type", ""))})
                return
            if len(raw) > 32000: raise ValueError("Text request is too large.")
            body = json.loads(raw)
            if not isinstance(body, dict): raise ValueError("Expected a JSON object.")
            if path == "/api/speak":
                self._send(200, voice.speak(body.get("text")), "audio/mpeg")
            elif path == "/api/chat":
                session = body.get("session", "default")
                if not isinstance(session, str) or len(session) > 100: raise ValueError("Invalid conversation session.")
                self._json(200, self.state.conversation.reply(body.get("text"), session, self.index, self.metadata["mode"] == "fictional demo"))
            elif path == "/api/tool":
                name = body.get("name")
                if name not in {"brief_me", "plan_day", "read_inbox", "remember"}: raise ValueError("Unknown local tool.")
                outcome = tools.remember_fact(body.get("fact")) if name == "remember" else tools.execute(name, {}, self.index, self.metadata["mode"] == "fictional demo")
                self._json(200, {"spoken": outcome["spoken"], "cards": [outcome["card"]], "model": "local tool"})
            elif path == "/api/projects/preview":
                folder = body.get("path")
                if not isinstance(folder, str) or len(folder) > 2000: raise ValueError("Enter an absolute project folder path.")
                chosen = Path(folder).expanduser()
                if str(chosen) in {"/", "/Users", "/System", "/Library", "/Applications", str(Path.home())}:
                    raise ValueError("Choose a specific project folder, not the whole computer or home folder.")
                snapshot = load_documents(project_roots=[str(chosen)], include_code=True)
                preview = build_index(snapshot.documents)
                token = secrets.token_urlsafe(24)
                with self.state.lock:
                    self.state.previews = {key: value for key, value in self.state.previews.items() if time.monotonic() - value[0] < 300}
                    if len(self.state.previews) >= 4: self.state.previews.pop(next(iter(self.state.previews)))
                    self.state.previews[token] = (time.monotonic(), str(chosen))
                self._json(200, {"token": token, "path": str(chosen), "count": len(preview["nodes"]),
                                 "counts_by_type": preview["counts_by_type"], "skipped": dict(snapshot.skipped),
                                 "warnings": snapshot.warnings[:20], "samples": [node["relative_path"] for node in preview["nodes"][:8]]})
            elif path == "/api/projects/import":
                with self.state.lock:
                    preview = self.state.previews.pop(body.get("token", ""), None)
                    if not preview or time.monotonic() - preview[0] > 300: raise ValueError("Preview expired. Review the folder again.")
                    roots = [] if self.metadata["mode"] == "fictional demo" else list(self.metadata["roots"])
                    if preview[1] not in roots: roots.append(preview[1])
                    snapshot = load_documents(project_roots=roots, include_code=True)
                    save_source_settings(roots)
                    self.state.replace(snapshot)
                self._json(200, {"mode": "real read-only", "count": len(self.index["nodes"]), "roots": roots})
            elif path == "/api/projects/demo":
                with self.state.lock:
                    save_source_settings([], demo=True)
                    self.state.replace(load_documents())
                self._json(200, {"mode": "fictional demo"})
            else:
                self._json(404, {"error": "Not found."})
        except ProviderError as error:
            self._json(503, {"error": str(error)})
        except (ValueError, TypeError, OSError) as error:
            self._json(400, {"error": str(error)})
        except Exception:
            self._json(500, {"error": "JARVIS could not complete this request. No external write was performed."})


def serve(index, metadata, port):
    handler = partial(LocalHandler, state=AppState(index, metadata))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    except OSError as exc:
        print(f"JARVIS could not start on port {port}: {exc}", file=sys.stderr)
        return 1
    print(f"\nJARVIS is ready at http://127.0.0.1:{server.server_port}", flush=True)
    print("Graph · conversation · project import · ElevenLabs voice · Ctrl+C to stop", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nJARVIS stopped.")
    finally:
        server.server_close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="JARVIS — local knowledge graph")
    parser.add_argument("--index", action="store_true", help="Print the stage 1 index summary and exit")
    parser.add_argument("--port", type=int, default=8765, help="Local HTTP port (default: 8765)")
    parser.add_argument("--json", action="store_true", help="Print the full index as JSON to stdout")
    parser.add_argument("--search", metavar="QUERY", help="Preview local relevance search with source citations")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("Port must be between 0 and 65535.")
    try:
        snapshot = load_documents()
        index = build_index(snapshot.documents)
    except (ConfigurationError, OSError, ValueError) as exc:
        print(f"JARVIS cannot index: {exc}", file=sys.stderr)
        return 1
    metadata = {"stage": 5, "mode": "fictional demo" if snapshot.demo else "real read-only",
                "roots": snapshot.roots, "skipped": dict(sorted(snapshot.skipped.items())),
                "warnings": snapshot.warnings}
    if args.json:
        print(json.dumps({**metadata, **index}, ensure_ascii=False, indent=2))
        return 0
    print("JARVIS · Read-only index")
    print(f"Mode: {metadata['mode'].upper()}")
    if snapshot.demo:
        print("Fictional compression-business examples. All benchmark figures are simulated.")
    print(f"Folders: {', '.join(snapshot.roots)}")
    print(f"Indexed: {len(index['nodes'])} documents · {len(index['edges'])} links")
    print("\nCounts by type")
    for kind, count in index["counts_by_type"].items():
        print(f"  {kind:14} {count:4}")
    print("\nTop 10 hubs (connections)")
    for position, node in enumerate(index["top_hubs"], 1):
        print(f"  {position:2}. {node['title']} — {node['degree']} · {node['path']}")
    if snapshot.skipped:
        print("\nSkipped")
        for reason, count in sorted(snapshot.skipped.items()):
            print(f"  {reason}: {count}")
    if index["unresolved_links"]:
        print(f"\nUnresolved wikilinks: {len(index['unresolved_links'])}")
        for link in index["unresolved_links"][:10]:
            print(f"  {link['path']}: [[{link['target']}]] ({link['reason']})")
    if snapshot.warnings:
        print("\nWarnings")
        for warning in snapshot.warnings:
            print(f"  {warning}")
    if args.search:
        print("\nLocal keyword search preview — no language model")
        results = search(index, args.search)
        if not results:
            print("  No matching files. This preview does not handle conversation.")
        for result in results:
            print(f"  {result['title']} · {result['path']}")
            for snippet in result["snippets"]:
                print(f"    {snippet}")
    if args.index or args.search:
        return 0
    return serve(index, metadata, args.port)


if __name__ == "__main__":
    raise SystemExit(main())
