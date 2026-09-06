"""ElevenLabs speech in and out. All calls are server-side, with no SDK."""
import re
import uuid
from .data import setting
from .provider import ProviderError, request

ALLOWED_AUDIO = {"audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mpeg": "mp3"}


def listen(raw, mime):
    mime = mime.split(";")[0].strip().lower()
    if mime not in ALLOWED_AUDIO or not raw or len(raw) > 8 * 1024 * 1024:
        raise ValueError("Audio must be a supported recording under 8 MB.")
    boundary = "jarvis-" + uuid.uuid4().hex
    start = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\nscribe_v1\r\n"
             f"--{boundary}\r\nContent-Disposition: form-data; name=\"tag_audio_events\"\r\n\r\nfalse\r\n"
             f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"turn.{ALLOWED_AUDIO[mime]}\"\r\n"
             f"Content-Type: {mime}\r\n\r\n").encode()
    response = request("https://api.elevenlabs.io/v1/speech-to-text", key=setting("ELEVENLABS_API_KEY"),
                       body=start + raw + f"\r\n--{boundary}--\r\n".encode(),
                       headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    text = response.get("text", "")
    if not isinstance(text, str) or not text.strip():
        raise ProviderError("No speech was recognized. Try speaking a little closer to the microphone.")
    return text.strip()[:8000]


def speak(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 2500:
        raise ValueError("Speech text must contain between 1 and 2,500 characters.")
    voice_id = setting("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", voice_id):
        raise ValueError("Invalid ElevenLabs voice ID.")
    return request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
                   key=setting("ELEVENLABS_API_KEY"), body={"text": text, "model_id": "eleven_multilingual_v2"}, binary=True)
