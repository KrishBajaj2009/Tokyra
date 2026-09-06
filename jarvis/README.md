# JARVIS

A local assistant for Krish Bajaj's AI prompt-compression business. Python standard
library on the server; plain HTML, CSS, JavaScript and canvas in the browser.
No frameworks, package installation or build step.

## Run

Requires Python 3.10+ on macOS or Linux. From the directory containing `jarvis/`:

```sh
python3 jarvis/agent/main.py
```

Open **http://127.0.0.1:8765**. Stop with Ctrl+C. Use `--port 8766` if that port is busy.
The server binds only to the loopback address, never to your network interface.
Secure directory reads require Unix no-follow file descriptors.

The graph and local tools work without API keys. Your server-only `.env` is ignored
by Git and has permissions `600`. In a fresh copy, copy `.env.example` to `.env`.
Never put keys into the source code, chat, or browser JavaScript.

```dotenv
JARVIS_DEMO=1
JARVIS_FOLDERS=[]
JARVIS_INCLUDE_CODE=0
JARVIS_ALLOW_API=1
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

Only enable API calls after accepting your providers' usage costs. In this local
setup, Krish explicitly authorized Groq conversation and selected ElevenLabs voice.
Settings are reread for requests: after adding the ElevenLabs key, click the mic;
a restart is not needed. Voice ID can be replaced with a voice available to your
ElevenLabs account. No key is returned by the API or embedded in the page.

## Use it

- **Graph:** hover highlights neighbors; click inspects a note. Shift-click a
  second note traces the shortest path through visible layers. The inspector's
  “Trace a connection” button offers the same flow using the note explorer.
- **Navigate:** drag the canvas to pan, drag a node to reposition, scroll to zoom.
  Use the zoom/fit buttons or focus the canvas and press +, −, 0 or arrow keys.
  Press `/` to search note titles and paths. Type filters update visible counts.
- **Conversation:** type into the ask bar. Groq receives the owner profile, up to
  ten recent turns, and tool-selected excerpts when needed. Conversation history
  is kept in process memory, not written into your projects.
- **Voice:** click the microphone once, then talk. Pausing for about 900 ms ends a
  turn. The microphone is disabled while JARVIS thinks or speaks, then resumes.
  Click the mic, Space outside inputs, or Escape to interrupt speech. Click the
  mic while listening to end the session. Mute suppresses spoken replies.
- **Memory:** use the Memory button, or say/type “Remember that …”. JARVIS saves
  one dated Markdown file per fact and returns the exact fact plus its filename.
  When speech is unavailable or muted, the receipt remains visible. Memory is
  not silently inferred from conversation.

Microphone audio uses MediaRecorder and a Web Audio AnalyserNode. The audio-level
and silence loop uses setInterval, not requestAnimationFrame. Audio is posted to
the local server, then to ElevenLabs Scribe (`scribe_v1`). Speech output uses
ElevenLabs `eleven_multilingual_v2` and returns MP3 bytes. Browser Web Speech APIs
are never used. Recordings are held in memory, not saved to disk.

Live captions are best-effort cumulative transcription, attempted every four
seconds during speech. The final transcript appears after the pause. Short turns
may finish before a partial caption arrives. Incomplete interim audio containers
can delay captions until the final transcript. Partial-caption requests increase
speech-to-text usage. Each turn is capped at 30 seconds and 8 MB.

Tune `SILENCE_MS` and `SPEECH_LEVEL` at the top of `ui/voice-client.js`. Permissions,
missing keys, rate limits, provider errors and playback failures appear on screen.
The existing UI microphone path still requires an actual ElevenLabs key and a
user-granted microphone permission for end-to-end verification.

## Import your projects

1. Click **Import project**.
2. Paste an absolute folder path. In Finder, Option-right-click a folder and use
   “Copy … as Pathname” if available.
3. Click **Review folder** to see readable file counts and examples.
4. Click **Import read-only** to add it to the index.

Importing reads the selected folder locally. It does not upload or copy the
folder. Later conversation about that project can send relevant excerpts to Groq.
Your files are never edited, renamed or deleted. The importer saves the explicit
folder list and real/demo selection in the app's own `.env`, so it survives a
restart. Additional imports add more folders. Returning to demo disconnects the
real index and clears its conversation history without changing those folders.

The importer supports Markdown, text, supported PDF text, and common code files:
JS/TS, JSX/TSX, HTML/CSS, Python, Java, Swift, Go, Rust, JSON, YAML and TOML. It skips
hidden files/directories, node_modules, .git, environments, build output, known
secret-related filenames and files over 2 MiB. Recognizable credential strings
are redacted with a warning. This is a best-effort filter, not a guarantee that
arbitrary secrets in source files can all be recognized; choose folder scope
accordingly. The app does not automatically index your home or operating system.

PDF extraction is conservative: ordinary text objects and bounded Flate streams
are supported. Encrypted, scanned, unsupported-font or modern compressed-object
PDFs may be skipped or partly readable, with explicit warnings. No OCR or full
layout reconstruction is claimed. Export unsupported PDFs to UTF-8 text/Markdown.

## Demo switch and graph

`agent/data.py` is the only file that reads `JARVIS_DEMO` and opens imported files.
`1` selects fictional fixtures by default; `0` uses explicit `JARVIS_FOLDERS`.
An environment variable overrides `.env`, so do not export a conflicting mode
if you want the importer to control it.

The fixed seed generates 43 fictional compression-business documents and 88
wikilink edges. Pricing is undecided and no clients are invented. Benchmark token
reductions are explicitly simulated, not claims about Krish's actual product.
Regeneration is reproducible:

```sh
python3 jarvis/data/generate_demo.py
python3 jarvis/agent/main.py --index
python3 jarvis/agent/main.py --search 'compression metrics'
python3 jarvis/agent/main.py --json
```

JSON prints the full index, including file text. These CLI index commands make
no API calls. Links resolve within each source root, with aliases, heading
fragments and relative paths; ambiguity is reported, not guessed. Node radius
uses distinct connection count. The canvas uses bounded spatial-grid repulsion,
collision-rejected labels and an accessible HTML note explorer. Reduced-motion
preferences disable decorative motion.

## Tools and boundaries

- `search_brain`: retrieves files with source paths and preserves excerpts.
- `research_web`: Groq Compound web search, only on a direct public-research
  request; returns provider-retrieved source links. No code execution enabled.
- `read_inbox`: currently reports **not connected**. It cannot send or read email.
- `brief_me`: shows indexed tasks and explicitly reports missing calendar/inbox
  data. It does not invent unread counts or overdue items.
- `plan_day`: proposes at most five indexed tasks using revenue-related language;
  the order is a suggestion, not measured financial impact or a schedule.
- `remember`: only a direct request writes a fact, to `memory/` with permissions 600.

Each tool supplies a spoken summary and a separate structured card. A conversation
model can help explain retrieved facts, but source excerpts remain the reference.
The app has no shell-execution, email-send, calendar-write, purchase, project-write
or automatic-billing-upgrade tool. File/web instructions cannot authorize tools.
Model-generated memory calls are rejected. A simple numeric evidence check rejects
unsupported numbers in file-search speech; it is not a proof of factual accuracy.
`CLAUDE.md` stores the supplied personal context and is loaded for conversation.

If Groq is unreachable, greetings stay conversational and relevant file queries
use local lexical scoring. The UI labels this as an offline fallback. Follow-ups
that cannot be interpreted reliably without a model say so.

## What it costs

Local indexing, graph exploration, imports and local memory have no API cost.
Conversation, web research, transcription and generated speech consume provider
usage on the accounts you configure. JARVIS does not buy plans or credits.

As checked September 5, 2026, Groq lists GPT-OSS 120B at **$0.15 per million input
and $0.60 per million output tokens** on its published paid pricing; free quotas
and your account terms may differ. Web research has separate tool/model usage.
See [Groq model pricing](https://console.groq.com/docs/models) and
[Groq web-search documentation](https://console.groq.com/docs/tool-use/built-in-tools/web-search).

ElevenLabs lists v2 Multilingual TTS at **$0.10 per 1,000 characters** on its API
pricing page; subscription allowances and terms vary. Scribe usage is separate,
and the page currently highlights v2 rates while this build uses requested
`scribe_v1`; check the rate available to your account. Partial live captions can
transcribe overlapping audio more than once. See
[ElevenLabs API pricing](https://elevenlabs.io/pricing/api).

## Verify

No Node runtime is needed to run the app. If Node is already installed, it can
run the optional JavaScript math/voice-state tests without packages:

```sh
cd jarvis
python3 -m unittest discover -s tests -v
node --test tests/graph.test.mjs
```

Tests cover read-only source access, symlink escapes, deterministic fixtures,
conservative PDFs, HTTP access boundaries, API-key secrecy, explicit memory,
conversation history, import preview/commit, graph paths, 1,500-node repulsion,
zoom anchors, label collisions and microphone state logic. They use temporary
sources and mocks. Live Groq checks are separate from this offline suite.

Optional WebMCP graph-focus/state tools are registered only in browsers that
support `document.modelContext`. That optional browser-tool bridge has not been
verified in a supporting browser. No browser interaction or visual QA is claimed.
