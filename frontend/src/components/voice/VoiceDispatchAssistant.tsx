'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Loader2,
  Sparkles,
  Bot,
  User,
  Radio,
  RefreshCw,
  Check,
  Copy,
  AlertCircle,
  HelpCircle,
  Waves,
  Square,
  Settings
} from 'lucide-react';
import {
  sendVoiceTranscriptToAI,
  sendAudioRecordingToAI,
  checkVoiceAgentHealth,
  VoiceAgentHealth
} from '@/lib/voiceAgent';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  latencyMs?: number;
}

const PRESET_PROMPTS = [
  'Report waterlogging at Virar East Ward 4 with 80cm depth.',
  'Request immediate evacuation boat dispatch for elderly residents.',
  'What is the drainage status and tidal timeline at Datt Mandir?',
  'Draft an emergency situation broadcast for nearby citizens.'
];

export function VoiceDispatchAssistant({
  className = '',
  onInjectNote,
  title = 'AI Voice Dispatch Assistant'
}: {
  className?: string;
  onInjectNote?: (text: string) => void;
  title?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Voice Dispatch Assistant active. Press the microphone or type below to issue tactical voice commands.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [health, setHealth] = useState<VoiceAgentHealth>({ status: 'active' });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  // Check health on mount
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkHealth() {
    const res = await checkVoiceAgentHealth();
    setHealth(res);
  }

  // Initialize SpeechRecognition for optional interim live text preview
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setSpeechSupported(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (currentTranscript.trim()) {
          setInputText(currentTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        // Silently ignore browser speech errors because MediaRecorder handles the actual audio
        console.warn('Browser SpeechRecognition warning:', event.error);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micVolume, setMicVolume] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Audio input device selection
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [isTestingMic, setIsTestingMic] = useState(false);

  useEffect(() => {
    loadAudioDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', loadAudioDevices);
      };
    }
  }, []);

  async function loadAudioDevices() {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput');
      setAudioDevices(mics);
      if (mics.length > 0) {
        setSelectedDeviceId((prev) => prev || mics[0].deviceId);
      }
    } catch (err) {
      console.warn('Could not enumerate audio devices:', err);
    }
  }

  async function testMicrophone() {
    if (isTestingMic) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      setIsTestingMic(false);
      setMicVolume(0);
      return;
    }

    try {
      setIsTestingMic(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      loadAudioDevices(); // refresh device labels now that permission is active

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVol = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const pct = Math.min(100, Math.round((avg / 64) * 100));
        setMicVolume(pct);
        animFrameRef.current = requestAnimationFrame(updateVol);
      };
      updateVol();
    } catch (e: any) {
      alert('Could not open selected microphone: ' + e.message);
      setIsTestingMic(false);
    }
  }

  // Timer for active recording
  useEffect(() => {
    let timer: any;
    if (isListening) {
      setRecordSeconds(0);
      timer = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } else if (!isTestingMic) {
      setRecordSeconds(0);
      setMicVolume(0);
    }
    return () => clearInterval(timer);
  }, [isListening, isTestingMic]);

  async function startRecording() {
    if (isTestingMic) {
      await testMicrophone(); // stop testing if active
    }
    setSpeechError(null);
    setInputText('');
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Audio volume analyzer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVol = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const pct = Math.min(100, Math.round((avg / 64) * 100));
          setMicVolume(pct);
          animFrameRef.current = requestAnimationFrame(updateVol);
        };
        updateVol();
      } catch (e) {
        console.warn('AudioContext volume meter unavailable:', e);
      }

      // Select best supported MIME type
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const supportedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

      const mediaRecorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Collect data in 100ms chunks
      mediaRecorder.start(100);
      setIsListening(true);

      // Try interim speech preview if browser supports it
      try {
        recognitionRef.current?.start();
      } catch (e) {}
    } catch (err: any) {
      console.error('Failed to access microphone:', err);
      setSpeechError(
        'Microphone permission denied. Please allow microphone access in your browser address bar.'
      );
      setIsListening(false);
    }
  }

  async function stopRecordingAndSend() {
    setIsListening(false);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
    setMicVolume(0);

    try {
      recognitionRef.current?.stop();
    } catch (e) {}

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      if (inputText.trim()) {
        handleSend();
      }
      return;
    }

    recorder.onstop = async () => {
      // Release microphone tracks
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];

      setIsProcessing(true);
      try {
        // Send audio to Whisper API + AWS Lambda
        const result = await sendAudioRecordingToAI(audioBlob);
        const recognizedText = result.transcript || inputText || 'Voice report received.';

        const userMsg: Message = {
          id: Date.now().toString(),
          sender: 'user',
          text: recognizedText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: result.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          latencyMs: result.latencyMs,
        };

        setMessages((prev) => [...prev, userMsg, aiMsg]);
        speakText(result.reply);
        setInputText('');
      } catch (err: any) {
        setSpeechError('Voice processing failed: ' + (err.message || 'Error'));
      } finally {
        setIsProcessing(false);
      }
    };

    try {
      // Flush buffered audio chunks before stopping
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
    } catch (e) {}

    recorder.stop();
  }

  function toggleListening() {
    if (isListening) {
      stopRecordingAndSend();
    } else {
      startRecording();
    }
  }

  function speakText(text: string) {
    if (!audioEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick highest quality natural/conversational voice
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Online') ||
          v.name.includes('Google') ||
          v.name.includes('Neural') ||
          v.name.includes('Samantha') ||
          v.name.includes('Zira'))
    );
    if (naturalVoice) utterance.voice = naturalVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  async function handleSend(textToSend?: string) {
    const query = (textToSend || inputText).trim();
    if (!query || isProcessing) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsProcessing(true);

    try {
      const result = await sendVoiceTranscriptToAI(query);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: result.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latencyMs: result.latencyMs
      };

      setMessages((prev) => [...prev, aiMsg]);
      speakText(result.reply);
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: 'Error processing transcript: ' + (err.message || 'Unknown network error'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  }

  function copyMessage(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className={`flex flex-col rounded-2xl bg-surfaceCard/95 border border-hairline shadow-2xl backdrop-blur-md overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-surfaceCard/50">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-brandTeal/15 text-brandTeal border border-brandTeal/20">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-primaryText flex items-center gap-2">
              {title}
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-brandTeal/15 text-brandTeal border border-brandTeal/30">
                AWS Lambda
              </span>
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-mutedGray">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  health.status === 'active'
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : 'bg-rose-500'
                }`}
              />
              <span>{health.status === 'active' ? 'Live AWS Microservice' : 'Offline'}</span>
              {health.latencyMs && (
                <span className="font-mono text-[10px] text-mutedGray/80">({health.latencyMs}ms)</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              showSettings
                ? 'bg-brandTeal/15 text-brandTeal border-brandTeal/30'
                : 'bg-surface/50 text-mutedGray border-hairline hover:text-primaryText'
            }`}
            title="Microphone Input Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              audioEnabled
                ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                : 'bg-surface/50 text-mutedGray border-hairline'
            }`}
            title={audioEnabled ? 'Voice Playback On' : 'Voice Playback Muted'}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={checkHealth}
            className="p-1.5 rounded-lg border border-hairline text-mutedGray hover:text-primaryText hover:bg-surface/50 transition-colors"
            title="Refresh Microservice Health"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Microphone Device Selector & Live Tester Panel */}
      {showSettings && (
        <div className="p-3.5 bg-surfaceElevated border-b border-hairline text-xs space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="font-bold text-primaryText flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-brandTeal" />
              Microphone Input Device
            </span>
            <button
              onClick={testMicrophone}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                isTestingMic
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                  : 'bg-brandTeal/15 text-brandTeal border-brandTeal/30 hover:bg-brandTeal/25'
              }`}
            >
              {isTestingMic ? 'Stop Test' : 'Test Selected Mic'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                if (isTestingMic) testMicrophone();
              }}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-surface border border-hairline text-primaryText focus:border-brandTeal focus:outline-none"
            >
              {audioDevices.length === 0 ? (
                <option value="">Default System Microphone</option>
              ) : (
                audioDevices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Microphone ${idx + 1}`}
                  </option>
                ))
              )}
            </select>
            <button
              onClick={loadAudioDevices}
              className="p-1.5 rounded-lg border border-hairline text-mutedGray hover:text-primaryText"
              title="Refresh Devices List"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {isTestingMic && (
            <div className="p-2 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-mutedGray">LEVEL:</span>
                <div className="w-32 h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 rounded-full ${
                      micVolume > 15 ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.max(4, micVolume)}%` }}
                  />
                </div>
                <span className={`text-[11px] font-mono font-bold ${micVolume > 15 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {micVolume}%
                </span>
              </div>
              <span className="text-[10px] text-mutedGray">
                {micVolume > 15 ? '🎙️ Audio active!' : 'Speak to test volume'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[240px] max-h-[380px]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-mutedGray mb-1">
              {msg.sender === 'user' ? (
                <>
                  <span>Dispatcher</span>
                  <User className="w-3 h-3" />
                </>
              ) : (
                <>
                  <Bot className="w-3 h-3 text-brandTeal" />
                  <span>AI Voice Core ({health.model || 'Groq 120B'})</span>
                  {msg.latencyMs && (
                    <span className="font-mono text-brandTeal/80">· {msg.latencyMs}ms</span>
                  )}
                </>
              )}
              <span>· {msg.timestamp}</span>
            </div>

            <div
              className={`group relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-brandTeal text-slate-950 font-medium rounded-tr-sm shadow-md'
                  : 'bg-surface/80 text-primaryText border border-hairline rounded-tl-sm shadow-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Action Buttons */}
              <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-surfaceCard/90 rounded-md p-0.5 border border-hairline shadow-sm">
                <button
                  onClick={() => copyMessage(msg.id, msg.text)}
                  className="p-1 text-mutedGray hover:text-primaryText transition-colors"
                  title="Copy text"
                >
                  {copiedId === msg.id ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                {onInjectNote && msg.sender === 'ai' && (
                  <button
                    onClick={() => onInjectNote(msg.text)}
                    className="px-1.5 py-0.5 text-[10px] font-bold text-brandTeal hover:underline"
                    title="Insert to Dispatch Notes"
                  >
                    + Note
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-brandTeal/20 flex items-center justify-center text-brandTeal">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-surface/80 border border-hairline px-3.5 py-2.5 text-xs text-mutedGray flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brandTeal" />
              <span>Generating tactical AI audio response via AWS Lambda...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-4 py-2 border-t border-hairline/50 bg-surface/30">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
          <span className="text-[10px] font-bold text-mutedGray shrink-0 uppercase tracking-wider">
            Quick Prompts:
          </span>
          {PRESET_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => handleSend(p)}
              disabled={isProcessing}
              className="shrink-0 px-2.5 py-1 rounded-full bg-surfaceCard border border-hairline text-secondaryText hover:text-primaryText hover:border-brandTeal/40 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Sound Wave & Mic Volume Indicator */}
      {(isListening || isSpeaking) && (
        <div className="px-4 py-2 bg-brandTeal/10 border-t border-brandTeal/20 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs font-semibold text-brandTeal">
            <Waves className="w-4 h-4 animate-bounce" />
            <span>
              {isListening
                ? micVolume > 12
                  ? `🎙️ Voice Detected (${micVolume}%) — Speaking...`
                  : 'Listening to mic... (Speak clearly into your mic)'
                : 'Speaking AI reply...'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isListening && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/40 border border-white/10 text-[10px] font-mono">
                <span className="text-mutedGray">MIC:</span>
                <div className="w-14 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 rounded-full ${
                      micVolume > 12 ? 'bg-emerald-400' : 'bg-amber-400/80'
                    }`}
                    style={{ width: `${Math.max(4, micVolume)}%` }}
                  />
                </div>
                <span className={micVolume > 12 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  {micVolume}%
                </span>
              </div>
            )}

            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6].map((bar) => (
                <span
                  key={bar}
                  className="w-1 bg-brandTeal rounded-full animate-pulse"
                  style={{
                    height: `${8 + (bar % 3) * 6 + (isListening ? (micVolume / 100) * 8 : 0)}px`,
                    animationDuration: `${0.4 + bar * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Speech Error Banner */}
      {speechError && (
        <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 flex items-center justify-between text-[11px] text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>{speechError}</span>
          </div>
          <button
            onClick={() => setSpeechError(null)}
            className="text-amber-400/80 hover:text-amber-200 ml-2 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 border-t border-hairline bg-surfaceCard flex items-center gap-2">
        <button
          onClick={toggleListening}
          className={`relative p-2.5 rounded-xl transition-all duration-200 flex items-center gap-1.5 ${
            isListening
              ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.7)] animate-pulse'
              : 'bg-brandTeal/15 text-brandTeal hover:bg-brandTeal/25 border border-brandTeal/30'
          }`}
          title={isListening ? 'Stop Recording & Send to Whisper' : 'Start Recording Voice (Click to Speak)'}
        >
          {isListening ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              <span className="text-[10px] font-mono font-bold pr-0.5">
                {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
                {String(recordSeconds % 60).padStart(2, '0')}
              </span>
            </>
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (isListening) {
                stopRecordingAndSend();
              } else {
                handleSend();
              }
            }
          }}
          placeholder={
            isListening
              ? `🔴 Recording audio (${recordSeconds}s)... Speak now, then click Done or Stop to transcribe!`
              : 'Type or speak emergency command...'
          }
          disabled={isProcessing}
          className={`flex-1 px-3 py-2 text-xs rounded-xl border focus:outline-none transition-colors ${
            isListening
              ? 'bg-rose-950/20 border-rose-500/40 text-primaryText placeholder:text-rose-300/70'
              : 'bg-surface/70 border-hairline focus:border-brandTeal text-primaryText placeholder:text-mutedGray'
          }`}
        />

        {isListening ? (
          <button
            onClick={() => stopRecordingAndSend()}
            disabled={isProcessing}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md flex items-center gap-1.5 text-xs animate-pulse"
            title="Stop Speaking & Transcribe with Whisper"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Done Speaking</span>
          </button>
        ) : (
          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isProcessing}
            className="p-2.5 rounded-xl bg-brandTeal text-slate-950 font-bold hover:bg-brandTeal/90 disabled:opacity-40 disabled:hover:bg-brandTeal transition-all shadow-sm"
            title="Send Command"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
