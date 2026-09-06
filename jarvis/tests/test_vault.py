import unittest

from agent.vault import build_index, search


def document(path, content="", source="one"):
    return {"id": f"{source}:{path}", "source_id": source, "path": f"{source}/{path}",
            "relative_path": path, "content": content, "format": "md"}


class VaultTests(unittest.TestCase):
    def test_duplicate_links_aliases_fragments_and_self_links(self):
        index = build_index([document("A.md", "# A\n[[B|alias]] [[B#Section]] [[A]] [[#Local]]"),
                             document("B.md", "# B\n[[A]]")])
        self.assertEqual(index["edges"], [{"source": "one:A.md", "target": "one:B.md"}])
        self.assertEqual([n["degree"] for n in index["nodes"]], [1, 1])
        self.assertFalse(index["unresolved_links"])

    def test_duplicate_titles_are_ambiguous(self):
        index = build_index([document("A.md", "[[Shared]]"),
                             document("a/Shared.md"), document("b/Shared.md")])
        self.assertEqual(index["edges"], [])
        self.assertEqual(index["unresolved_links"][0]["reason"], "ambiguous")
        self.assertEqual(len(index["unresolved_links"][0]["candidates"]), 2)

    def test_relative_and_explicit_extension_links(self):
        index = build_index([document("folder/A.md", "[[../B.markdown]] [[./Shared.txt]]"),
                             document("B.markdown"), document("folder/Shared.md"),
                             document("folder/Shared.txt")])
        self.assertEqual(len(index["edges"]), 2)
        self.assertFalse(index["unresolved_links"])
        self.assertEqual(next(n for n in index["nodes"] if n["id"] == "one:folder/Shared.md")["degree"], 0)

    def test_sources_are_separate_and_code_is_not_a_link(self):
        index = build_index([document("A.md", "[[B]] `[[C]]`\n```\n[[D]]\n```"),
                             document("B.md", source="other"), document("C.md"), document("D.md")])
        self.assertEqual(index["edges"], [])
        self.assertEqual([entry["target"] for entry in index["unresolved_links"]], ["B"])

    def test_metadata_and_order_are_deterministic(self):
        docs = [document("tasks/B.md", "# B\n[[A]]"),
                document("A.md", "---\ntitle: A\ntype: product\n---\n[[B]]")]
        first = build_index(docs)
        self.assertEqual(first, build_index(reversed(docs)))
        self.assertEqual(first["counts_by_type"], {"product": 1, "task": 1})

    def test_search_citations_relevance_and_empty_queries(self):
        index = build_index([document("Compression.md", "# Compression\nSynthetic token benchmark."),
                             document("Pricing.md", "# Pricing\nPricing remains undecided.")])
        results = search(index, "compression tokens")
        self.assertEqual(results[0]["path"], "one/Compression.md")
        self.assertTrue(results[0]["snippets"])
        self.assertEqual(search(index, "unfindableword"), [])
        self.assertEqual(search(index, "why?"), [])
        self.assertEqual(search(index, ""), [])


if __name__ == "__main__":
    unittest.main()
