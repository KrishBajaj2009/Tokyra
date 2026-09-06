from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
import threading
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch
from agent.main import LocalHandler, AppState
from agent.vault import build_index


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        index = build_index([{"id": "one:a", "source_id": "one", "path": "fixture/Note.md", "relative_path": "Note.md", "content": "# Example\nPrivate note text", "format": "md"}])
        cls.state = AppState(index, {"mode": "fictional demo", "stage": 5, "roots": ["data/demo"], "warnings": [], "skipped": {}})
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(LocalHandler, state=cls.state))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def call(self, method, path, body=None, headers=None):
        conn = HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        request_headers = dict(headers or {})
        if body is not None:
            body = json.dumps(body); request_headers.setdefault("Content-Type", "application/json")
        conn.request(method, path, body=body, headers=request_headers)
        response = conn.getresponse(); output = response.read(); code = response.status; response_headers = dict(response.getheaders()); conn.close()
        return code, response_headers, output

    def test_graph_metadata_and_note_contents_separate(self):
        code, headers, raw = self.call("GET", "/api/index")
        self.assertEqual(code, 200); self.assertNotIn(b"Private note text", raw)
        self.assertEqual(headers["Cache-Control"], "no-store")
        code, _, raw = self.call("GET", "/api/note?id=one%3Aa")
        self.assertEqual(code, 200); self.assertIn(b"Private note text", raw)

    def test_rebinding_cross_origin_and_csrf_blocked(self):
        self.assertEqual(self.call("GET", "/api/index", headers={"Host": "attacker.example"})[0], 403)
        self.assertEqual(self.call("GET", "/api/index", headers={"Origin": "https://attacker.example"})[0], 403)
        self.assertEqual(self.call("POST", "/api/tool", {"name": "brief_me"})[0], 403)

    def test_allowlisted_static_files_only(self):
        for path in ("/.env", "/../.env", "/agent/data.py", "/api/note?id=../../.env"):
            self.assertEqual(self.call("GET", path)[0], 404)
        self.assertEqual(self.call("GET", "/")[0], 200)
        self.assertEqual(self.call("GET", "/voice-client.js")[0], 200)

    def test_public_status_never_contains_keys(self):
        def setting(name, default=""):
            return {"GROQ_API_KEY": "super-private-key", "ELEVENLABS_API_KEY": "another-private-key", "JARVIS_ALLOW_API": "1"}.get(name, default)
        with patch("agent.main.setting", setting):
            code, _, raw = self.call("GET", "/api/status")
        self.assertEqual(code, 200); self.assertNotIn(b"private-key", raw)
        self.assertTrue(json.loads(raw)["voice_ready"])

    def test_unknown_tool_cannot_run_commands(self):
        code, _, raw = self.call("POST", "/api/tool", {"name": "run_shell", "command": "touch /tmp/no"}, {"X-Jarvis-Token": self.state.csrf})
        self.assertEqual(code, 400); self.assertIn(b"Unknown local tool", raw)

    def test_import_requires_review_token_and_specific_scope(self):
        headers = {"X-Jarvis-Token": self.state.csrf}
        self.assertEqual(self.call("POST", "/api/projects/import", {"token": "invented"}, headers)[0], 400)
        self.assertEqual(self.call("POST", "/api/projects/preview", {"path": "/"}, headers)[0], 400)

    def test_project_import_roundtrip_is_read_only_and_redacts_credentials(self):
        original_index, original_metadata = self.state.index, self.state.metadata
        self.addCleanup(setattr, self.state, "index", original_index)
        self.addCleanup(setattr, self.state, "metadata", original_metadata)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); project = root / "project"; project.mkdir()
            config = root / "config"; config.mkdir()
            (project / "README.md").write_text("# Example project\n[[Design]]", encoding="utf-8")
            (project / "Design.md").write_text("# Design\nA project note", encoding="utf-8")
            (project / "app.js").write_text('const key = "gsk_' + 'x' * 40 + '";', encoding="utf-8")
            (project / ".env").write_text("DO_NOT_READ=private", encoding="utf-8")
            before = {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in project.iterdir()}
            headers = {"X-Jarvis-Token": self.state.csrf}
            with patch("agent.data.PROJECT_ROOT", config), patch.dict(os.environ, {}, clear=True):
                code, _, raw = self.call("POST", "/api/projects/preview", {"path": str(project)}, headers)
                preview = json.loads(raw); self.assertEqual(code, 200); self.assertEqual(preview["count"], 3)
                self.assertIs(self.state.index, original_index)
                code, _, raw = self.call("POST", "/api/projects/import", {"token": preview["token"]}, headers)
                self.assertEqual(code, 200); self.assertEqual(json.loads(raw)["mode"], "real read-only")
                self.assertNotIn('gsk_' + 'x' * 40, str(self.state.index))
                self.assertIn("[REDACTED CREDENTIAL]", str(self.state.index))
                self.assertEqual((config / ".env").stat().st_mode & 0o777, 0o600)
            after = {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in project.iterdir()}
            self.assertEqual(before, after)


if __name__ == "__main__": unittest.main()
