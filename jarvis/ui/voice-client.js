// Tune turn-taking here. The level/VAD loop deliberately uses setInterval.
export const SILENCE_MS = 900;
const LEVEL_INTERVAL_MS = 50;
const SPEECH_LEVEL = .014;
const MAX_TURN_MS = 30000;
const PARTIAL_CAPTION_INTERVAL_MS = 4000;

export class VoiceController {
  constructor(callbacks) {
    this.callbacks = callbacks; this.active = false; this.muted = false; this.state = 'idle';
    this.epoch = 0; this.stream = null; this.audio = null; this.recorder = null; this.partialBusy = false;
  }
  setState(state) { this.state = state; this.callbacks.state(state, this.active); }
  tracks(enabled) { this.stream?.getAudioTracks().forEach(track => { track.enabled = enabled; }); }
  async start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microphone recording is unavailable in this browser. Use localhost in a current browser, or type below.');
      await this.callbacks.checkReady();
      if (!this.stream || this.stream.getAudioTracks().some(track => track.readyState === 'ended')) {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 1024;
        this.context.createMediaStreamSource(this.stream).connect(this.analyser);
        this.samples = new Float32Array(this.analyser.fftSize);
      }
      await this.context.resume(); this.active = true; this.epoch++;
      if (!this.interval) this.interval = setInterval(() => this.tick(), LEVEL_INTERVAL_MS);
      this.resume();
    } catch (error) {
      this.stop();
      const errors = { NotAllowedError: 'Microphone permission was blocked. Allow the microphone for this localhost page, then try again.', NotFoundError: 'No microphone was found. Connect one or type your message.', NotReadableError: 'The microphone is busy or unavailable. Check other audio apps.' };
      this.callbacks.error(errors[error.name] || error.message);
    }
  }
  resume() {
    if (!this.active || this.state === 'speaking') return;
    this.tracks(true); this.chunks = []; this.started = performance.now(); this.lastLoud = this.started;
    this.hasSpeech = false; this.voicedMs = 0; this.lastPartial = this.started;
    const supported = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    try {
      const recorder = new MediaRecorder(this.stream, supported ? { mimeType: supported } : {});
      this.recorder = recorder; this.mime = recorder.mimeType || supported || 'audio/webm';
      recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
      recorder.onerror = () => { this.stop(); this.callbacks.error('Audio recording failed. Try the microphone again or type your message.'); };
      recorder.start(250); this.setState('listening'); this.callbacks.caption('Listening. Speak naturally, then pause.');
    } catch (error) { this.stop(); this.callbacks.error(`Could not start recording: ${error.message}`); }
  }
  pause() {
    this.tracks(false);
    if (this.recorder && this.recorder.state !== 'inactive') { this.recorder.onstop = null; this.recorder.stop(); }
    this.recorder = null;
    this.callbacks.level(0);
    if (this.state !== 'speaking') this.setState('thinking');
  }
  tick() {
    if (!this.active || this.state !== 'listening' || !this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.samples);
    let total = 0; for (const value of this.samples) total += value * value;
    const rms = Math.sqrt(total / this.samples.length), now = performance.now();
    this.callbacks.level(Math.min(1, rms * 9));
    if (rms > SPEECH_LEVEL) { this.lastLoud = now; this.voicedMs += LEVEL_INTERVAL_MS; this.hasSpeech = this.voicedMs >= 150; }
    if (this.hasSpeech && (now - this.lastLoud >= SILENCE_MS || now - this.started >= MAX_TURN_MS)) { this.finishTurn(); return; }
    if (this.hasSpeech && now - this.lastPartial >= PARTIAL_CAPTION_INTERVAL_MS && !this.partialBusy && this.chunks.length) {
      this.lastPartial = now; this.partialCaption();
    }
    // Rotate silent recordings to bound memory without sending silent audio.
    if (!this.hasSpeech && now - this.started >= MAX_TURN_MS) { this.pause(); this.resume(); }
  }
  async partialCaption() {
    const epoch = this.epoch, started = this.started; this.partialBusy = true;
    try {
      const response = await this.callbacks.transcribe(new Blob(this.chunks, { type: this.mime }));
      if (epoch === this.epoch && this.state === 'listening' && started === this.started) this.callbacks.caption(response.text);
    } catch { /* A cumulative chunk may be incomplete. The final turn reports any transcription failure. */ }
    finally { this.partialBusy = false; }
  }
  finishTurn() {
    if (!this.recorder || this.state !== 'listening') return;
    const epoch = this.epoch, recorder = this.recorder;
    this.tracks(false); this.setState('thinking'); this.callbacks.level(0); this.callbacks.caption('Transcribing your turn…');
    recorder.onstop = async () => {
      const blob = new Blob(this.chunks, { type: this.mime }); this.recorder = null;
      try {
        const response = await this.callbacks.transcribe(blob);
        if (epoch !== this.epoch || !this.active) return;
        this.callbacks.caption(response.text);
        await this.callbacks.transcript(response.text);
        if (epoch === this.epoch && this.active) this.resume();
      } catch (error) { if (epoch === this.epoch) { this.stop(); this.callbacks.error(error.message); } }
    };
    recorder.stop();
  }
  async speak(text) {
    this.pause();
    if (this.muted) { this.setState('idle'); return; }
    const epoch = this.epoch;
    try {
      const bytes = await this.callbacks.synthesize(text);
      if (epoch !== this.epoch) return;
      this.setState('speaking'); this.tracks(false);
      const url = URL.createObjectURL(bytes), audio = new Audio(url); this.audio = audio;
      await new Promise((resolve, reject) => {
        this.finishAudio = resolve;
        audio.onended = resolve; audio.onerror = () => reject(new Error('The returned speech audio could not be played.'));
        audio.play().catch(() => reject(new Error('The browser blocked audio playback. Click the microphone or try speaking again.')));
      });
      URL.revokeObjectURL(url); this.audio = null; this.finishAudio = null;
    } catch (error) { this.callbacks.error(`Voice output unavailable: ${error.message}`); }
    finally { if (epoch === this.epoch) this.setState('idle'); }
  }
  interrupt() {
    this.epoch++; this.audio?.pause(); this.finishAudio?.(); this.audio = null;
    this.pause(); this.callbacks.interrupt?.(); this.setState('idle');
    if (this.active) this.resume();
  }
  stop() {
    this.active = false; this.epoch++; this.audio?.pause(); this.finishAudio?.();
    this.pause(); this.setState('idle'); this.callbacks.caption('Microphone off.');
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.context?.close().catch(() => {}); this.context = null;
    clearInterval(this.interval); this.interval = null;
  }
  async toggle() { if (this.state === 'speaking' || this.state === 'thinking') { if (this.active) this.interrupt(); else { this.interrupt(); await this.start(); } } else if (this.active) this.stop(); else await this.start(); }
  setMuted(value) { this.muted = value; if (value && this.audio) { this.audio.pause(); this.finishAudio?.(); } }
}
