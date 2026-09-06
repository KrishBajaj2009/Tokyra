"""Check the read boundary with temporary sources, never the owner's folders."""

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from agent import data
from data import generate_demo
from data.generate_demo import fixtures


class DataBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.project = self.base / "project"
        self.project.mkdir()
        self.source = self.base / "source"
        self.source.mkdir()
        self.enterContext(patch.object(data, "PROJECT_ROOT", self.project))
        self.enterContext(patch.dict(os.environ, {}, clear=True))

    def real_mode(self, *roots):
        os.environ["JARVIS_DEMO"] = "0"
        os.environ["JARVIS_FOLDERS"] = json.dumps([str(root) for root in roots or (self.source,)])

    def test_demo_is_default_and_ignores_personal_folder_configuration(self):
        demo = self.project / "data" / "demo"
        demo.mkdir(parents=True)
        (demo / "Example.md").write_text("# Fictional Example\n", encoding="utf-8")
        (self.source / "Private.md").write_text("Private source", encoding="utf-8")
        os.environ["JARVIS_FOLDERS"] = json.dumps([str(self.source)])
        snapshot = data.load_documents()
        self.assertTrue(snapshot.demo)
        self.assertEqual([d["relative_path"] for d in snapshot.documents], ["Example.md"])
        self.assertNotIn(str(self.source), str(snapshot))

    def test_invalid_mode_or_missing_explicit_roots_fail_closed(self):
        os.environ["JARVIS_DEMO"] = "false"
        with self.assertRaises(data.ConfigurationError):
            data.load_documents()
        os.environ["JARVIS_DEMO"] = "0"
        with self.assertRaises(data.ConfigurationError):
            data.load_documents()
        os.environ["JARVIS_FOLDERS"] = '["relative/path"]'
        with self.assertRaises(data.ConfigurationError):
            data.load_documents()

    def test_exclusions_size_encodings_and_no_source_writes(self):
        (self.source / "Alpha.md").write_text("# Alpha\n[[Beta]]", encoding="utf-8")
        sub = self.source / "nested"
        sub.mkdir()
        (sub / "Beta.txt").write_bytes("Beta content".encode("utf-16"))
        (self.source / "too-big.txt").write_bytes(b"x" * (data.MAX_FILE_BYTES + 1))
        (self.source / "binary.txt").write_bytes(b"hello\x00world")
        for name in ("node_modules", ".git"):
            excluded = self.source / name
            excluded.mkdir()
            (excluded / "Secret.md").write_text("Do not index", encoding="utf-8")
        before = {str(p): (p.read_bytes(), p.stat().st_mtime_ns)
                  for p in self.source.rglob("*") if p.is_file()}
        self.real_mode()
        snapshot = data.load_documents()
        after = {str(p): (p.read_bytes(), p.stat().st_mtime_ns)
                 for p in self.source.rglob("*") if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual([d["relative_path"] for d in snapshot.documents], ["Alpha.md", "nested/Beta.txt"])
        self.assertEqual(snapshot.skipped["excluded_directories"], 2)
        self.assertEqual(snapshot.skipped["over_2mb"], 1)
        self.assertEqual(snapshot.skipped["binary_text_file"], 1)
        self.assertEqual(snapshot.documents[1]["content"], "Beta content")

    @unittest.skipUnless(hasattr(os, "symlink"), "Symlinks unavailable")
    def test_symlink_files_folders_and_source_roots_are_rejected(self):
        external = self.base / "outside"
        external.mkdir()
        (external / "Private.md").write_text("Outside the authorized root", encoding="utf-8")
        (self.source / "linked.md").symlink_to(external / "Private.md")
        (self.source / "linked-directory").symlink_to(external, target_is_directory=True)
        self.real_mode()
        snapshot = data.load_documents()
        self.assertEqual(snapshot.documents, [])
        self.assertEqual(snapshot.skipped["symlinks"], 2)
        self.real_mode(self.source / "linked-directory")
        with self.assertRaises(data.ConfigurationError):
            data.load_documents()

    def test_overlapping_roots_do_not_duplicate_documents(self):
        nested = self.source / "nested"
        nested.mkdir()
        (nested / "Note.md").write_text("# One note", encoding="utf-8")
        self.real_mode(self.source, nested, self.source)
        snapshot = data.load_documents()
        self.assertEqual(len(snapshot.documents), 1)
        self.assertEqual(snapshot.skipped["duplicate_files"], 1)

    def test_explicit_excluded_root_cannot_bypass_exclusions(self):
        excluded = self.source / "node_modules" / "nested"
        excluded.mkdir(parents=True)
        self.real_mode(excluded)
        with self.assertRaises(data.ConfigurationError):
            data.load_documents()

    @unittest.skipUnless(os.open in os.supports_dir_fd, "Directory descriptors unavailable")
    def test_ancestor_swap_between_resolve_and_open_is_blocked(self):
        parent = self.source / "nested"
        parent.mkdir()
        document = parent / "Note.md"
        document.write_text("Authorized", encoding="utf-8")
        external = self.base / "outside"
        external.mkdir()
        (external / "Note.md").write_text("Not authorized", encoding="utf-8")
        original_resolve = Path.resolve

        def swap_after_resolve(path, *args, **kwargs):
            resolved = original_resolve(path, *args, **kwargs)
            if path == document:
                parent.rename(self.source / "original")
                parent.symlink_to(external, target_is_directory=True)
            return resolved

        with patch.object(Path, "resolve", swap_after_resolve):
            with self.assertRaises(OSError):
                data._read_document(document, self.source)

    def test_source_encoding_and_pdf_failures_are_visible(self):
        (self.source / "encoding.txt").write_bytes(b"\x80\x81")
        (self.source / "broken.pdf").write_bytes(b"not a PDF")
        self.real_mode()
        snapshot = data.load_documents()
        self.assertEqual(snapshot.documents, [])
        self.assertEqual(snapshot.skipped["unsupported_text_encoding"], 1)
        self.assertEqual(snapshot.skipped["pdf_without_extractable_text"], 1)
        self.assertGreaterEqual(len(snapshot.warnings), 2)

    def test_fixture_content_is_deterministic_and_labeled(self):
        first = fixtures()
        self.assertEqual(first, fixtures())
        self.assertEqual(len(first), 43)
        self.assertTrue(all("FICTIONAL DEMO" in value for value in first.values()))
        self.assertTrue(any("SIMULATED, not measured" in value for value in first.values()))
        self.assertFalse(any(path.startswith("clients/") for path in first))

    @unittest.skipUnless(hasattr(os, "link"), "Hardlinks unavailable")
    def test_demo_regeneration_preserves_external_hardlinked_file(self):
        demo_root = self.project / "data" / "demo"
        fixture = demo_root / next(iter(fixtures()))
        fixture.parent.mkdir(parents=True)
        external = self.base / "private-note.txt"
        external.write_text("Keep this untouched", encoding="utf-8")
        os.link(external, fixture)
        with patch.object(generate_demo, "DEMO_ROOT", demo_root):
            generate_demo.generate_demo()
        self.assertEqual(external.read_text(encoding="utf-8"), "Keep this untouched")
        self.assertNotEqual(external.stat().st_ino, fixture.stat().st_ino)


if __name__ == "__main__":
    unittest.main()
