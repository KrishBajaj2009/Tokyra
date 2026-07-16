import { useState } from "react";

// The frontend and backend are two SEPARATE Wasmer apps, so this must be
// a full URL, not a relative path. After you deploy the tokyra-api app
// (see ../tokyra-api/README.md), Wasmer will print its URL — paste it
// here, e.g. "https://tokyra-api-yourusername.wasmer.app"
const API_URL = "https://tokyra-api-YOUR_WASMER_USERNAME.wasmer.app";

export default function App() {
  const [input, setInput] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCompress() {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/compress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(password ? { "X-App-Password": password } : {}),
        },
        body: JSON.stringify({ text: input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (result?.compressed) navigator.clipboard.writeText(result.compressed);
  }

  const reduction =
    result && result.originalTokens > 0
      ? Math.round((1 - result.compressedTokens / result.originalTokens) * 100)
      : null;

  return (
    <div className="page">
      <h1>Prompt Compressor</h1>
      <p className="subtitle">
        Paste text below. Claude rewrites it to use fewer tokens while
        keeping the same meaning and intent.
      </p>

      <textarea
        rows={8}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste the prompt or text you want compressed..."
      />

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="App password (if this deployment requires one)"
        className="password-input"
      />

      <div className="actions">
        <button onClick={handleCompress} disabled={loading || !input.trim()}>
          {loading ? "Compressing..." : "Compress"}
        </button>
        <button
          className="secondary"
          onClick={() => {
            setInput("");
            setResult(null);
            setError("");
          }}
        >
          Clear
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <div className="stats">
            <div className="stat-card">
              <p className="label">Original tokens (est.)</p>
              <p className="value">{result.originalTokens.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <p className="label">Compressed tokens (est.)</p>
              <p className="value success">
                {result.compressedTokens.toLocaleString()}
              </p>
            </div>
          </div>

          <label className="output-label">
            Compressed text{" "}
            {reduction !== null && (
              <span className="success">(-{reduction}%)</span>
            )}
          </label>
          <div className="output-box">{result.compressed}</div>
          <button className="secondary" onClick={handleCopy}>
            Copy compressed text
          </button>
        </>
      )}

      <p className="disclaimer">
        Token counts are estimates. Compression is a rewrite, not lossless —
        spot-check important prompts before relying on the compressed
        version.
      </p>
    </div>
  );
}
