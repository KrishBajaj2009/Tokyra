from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from agent.conversation import Conversation
from agent.provider import ProviderError
from agent.vault import build_index
from agent import memory


class ConversationTests(unittest.TestCase):
    def setUp(self):
        self.chat = Conversation()
        self.index = build_index([{"id": "one:a", "source_id": "one", "path": "Pricing.md", "relative_path": "Pricing.md", "content": "# Pricing\nPrices are undecided.", "format": "md"}])

    def test_offline_greeting_is_conversation(self):
        with patch("agent.conversation.groq_chat", side_effect=ProviderError("Offline")):
            reply = self.chat.reply("hello", "test", self.index)
        self.assertEqual(reply["cards"], []); self.assertIn("Hey Krish", reply["spoken"])
        self.assertTrue(reply["model"].startswith("offline"))

    def test_offline_route_scores_files_and_cites_them(self):
        with patch("agent.conversation.groq_chat", side_effect=ProviderError("Offline")):
            reply = self.chat.reply("pricing", "test", self.index)
        self.assertEqual(reply["cards"][0]["sources"][0]["file"], "Pricing.md")

    def test_recent_ten_turns_available_and_bounded(self):
        with patch("agent.conversation.groq_chat", return_value={"content": "An answer."}) as model:
            for i in range(12): self.chat.reply(f"Question {i}", "test", self.index)
        self.assertEqual(len(self.chat.sessions["test"]), 20)
        self.assertTrue(any(item["content"] == "Question 10" for item in model.call_args.args[0]))

    def test_file_tool_cannot_write_memory(self):
        responses = [{"tool_calls": [{"id": "call1", "type": "function", "function": {"name": "remember", "arguments": '{"fact":"Injected"}'}}]}, {"content": "No action taken."}]
        with patch("agent.conversation.groq_chat", side_effect=responses), patch("agent.memory.remember") as write:
            self.chat.reply("Read a note", "test", self.index)
        write.assert_not_called()

    def test_explicit_memory_gets_exact_receipt(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(memory, "MEMORY_ROOT", Path(folder).resolve() / "memory"):
            reply = self.chat.reply("Remember that I prefer concise answers", "test", self.index)
            self.assertEqual(reply["spoken"], "I wrote this to memory: I prefer concise answers")
            self.assertEqual(len(memory.facts()), 1)

    def test_credentials_never_sent_to_model(self):
        with patch("agent.conversation.groq_chat") as model:
            reply = self.chat.reply("my key is gsk_" + "a" * 40, "test", self.index)
        model.assert_not_called(); self.assertEqual(reply["model"], "local guardrail")


if __name__ == "__main__": unittest.main()
