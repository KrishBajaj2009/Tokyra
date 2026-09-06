"""Small bounded HTTPS client; provider credentials never leave the server."""
import json
import socket
import ssl
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler, HTTPSHandler
from .data import setting


class ProviderError(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        raise ProviderError("The API tried to redirect the request; credentials were not forwarded.")


def request(url, *, key, body=None, headers=None, binary=False):
    if setting("JARVIS_ALLOW_API", "0") != "1":
        raise ProviderError("API calls are disabled. Enable them in the local .env after approving usage costs.")
    if not key:
        raise ProviderError("This service's API key is missing from jarvis/.env.")
    if not url.startswith(("https://api.groq.com/", "https://api.elevenlabs.io/")):
        raise ProviderError("Provider endpoint is not allowed.")
    request_headers = {"User-Agent": "JARVIS-local/1.0", **(headers or {})}
    if url.startswith("https://api.groq.com/"):
        request_headers["Authorization"] = f"Bearer {key}"
    else:
        request_headers["xi-api-key"] = key
    if isinstance(body, dict):
        body = json.dumps(body).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    context = ssl.create_default_context()
    # python.org macOS installations may not bundle roots until a setup script
    # runs. Use the operating system's CA bundle, retaining full TLS validation.
    if Path("/etc/ssl/cert.pem").is_file():
        context.load_verify_locations(cafile="/etc/ssl/cert.pem")
    try:
        with build_opener(NoRedirect, HTTPSHandler(context=context)).open(Request(url, data=body, headers=request_headers), timeout=45) as response:
            limit = 12 * 1024 * 1024 if binary else 1024 * 1024
            raw = response.read(limit + 1)
            if len(raw) > limit:
                raise ProviderError("The API response exceeded the local size limit.")
            return raw if binary else json.loads(raw)
    except HTTPError as exc:
        messages = {401: "The API key was rejected. Check or replace it in jarvis/.env.",
                    402: "The provider requires credits. JARVIS has not purchased anything.",
                    403: "The provider denied this model or voice. Check account permissions.",
                    429: "The provider's rate or usage limit was reached. Try again later."}
        raise ProviderError(messages.get(exc.code, f"The provider returned HTTP {exc.code}. Check model and voice availability.")) from None
    except (URLError, TimeoutError, socket.timeout):
        raise ProviderError("The API could not be reached or timed out. Check your connection.") from None
    except (ValueError, UnicodeError):
        raise ProviderError("The API returned an unreadable response.") from None


def groq_chat(messages, *, tools=None, research=False):
    body = {"model": "groq/compound" if research else setting("GROQ_MODEL", "openai/gpt-oss-120b"),
            "messages": messages, "max_completion_tokens": 1600, "temperature": .35}
    if tools:
        body.update(tools=tools, tool_choice="auto", parallel_tool_calls=False)
    if research:
        body["compound_custom"] = {"tools": {"enabled_tools": ["web_search"]}}
    response = request("https://api.groq.com/openai/v1/chat/completions", key=setting("GROQ_API_KEY"), body=body)
    try:
        return response["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        raise ProviderError("The conversation provider returned no message.") from None
