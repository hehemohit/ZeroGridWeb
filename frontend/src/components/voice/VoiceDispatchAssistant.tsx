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
  Waves
} from 'lucide-react';
import {
  sendVoiceTranscriptToAI,
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

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Initialize SpeechRecognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setSpeechSupported(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setInputText(currentTranscript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  function toggleListening() {
    if (!speechSupported) {
      alert('Speech recognition is not supported in this browser. Please type your message.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setInputText('');
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  }

  function speakText(text: string) {
    if (!audioEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick best available English voice
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha'))
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

      {/* Dynamic Sound Wave Indicator */}
      {(isListening || isSpeaking) && (
        <div className="px-4 py-1.5 bg-brandTeal/10 border-t border-brandTeal/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-brandTeal">
            <Waves className="w-4 h-4 animate-bounce" />
            <span>{isListening ? 'Listening to speech...' : 'Speaking reply...'}</span>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6].map((bar) => (
              <span
                key={bar}
                className="w-1 bg-brandTeal rounded-full animate-pulse"
                style={{
                  height: `${8 + (bar % 3) * 6}px`,
                  animationDuration: `${0.4 + bar * 0.1}s`
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 border-t border-hairline bg-surfaceCard flex items-center gap-2">
        <button
          onClick={toggleListening}
          className={`relative p-2.5 rounded-xl transition-all duration-200 ${
            isListening
              ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse'
              : 'bg-brandTeal/15 text-brandTeal hover:bg-brandTeal/25 border border-brandTeal/30'
          }`}
          title={isListening ? 'Stop Listening' : 'Speak (Push-to-Talk)'}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isListening ? 'Listening to microphone...' : 'Type or speak emergency command...'}
          disabled={isProcessing}
          className="flex-1 px-3 py-2 text-xs rounded-xl bg-surface/70 border border-hairline focus:border-brandTeal focus:outline-none text-primaryText placeholder:text-mutedGray"
        />

        <button
          onClick={() => handleSend()}
          disabled={!inputText.trim() || isProcessing}
          className="p-2.5 rounded-xl bg-brandTeal text-slate-950 font-bold hover:bg-brandTeal/90 disabled:opacity-40 disabled:hover:bg-brandTeal transition-all shadow-sm"
          title="Send Command"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
