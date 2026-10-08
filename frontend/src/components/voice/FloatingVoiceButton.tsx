'use client';

import React, { useState } from 'react';
import { Mic, X, Radio } from 'lucide-react';
import { VoiceDispatchAssistant } from './VoiceDispatchAssistant';

export function FloatingVoiceButton({
  onInjectNote
}: {
  onInjectNote?: (text: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-96 max-w-[calc(100vw-2rem)] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute -top-3 -right-3 z-10 p-1.5 rounded-full bg-surfaceCard text-mutedGray hover:text-primaryText border border-hairline shadow-md"
              title="Close Voice Assistant"
            >
              <X className="w-4 h-4" />
            </button>
            <VoiceDispatchAssistant
              title="Tactical Voice Dispatcher"
              onInjectNote={onInjectNote}
            />
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative flex items-center gap-2.5 px-4 py-3 rounded-full font-semibold text-xs shadow-2xl transition-all duration-300 ${
          isOpen
            ? 'bg-surfaceCard text-primaryText border border-hairline'
            : 'bg-brandTeal text-slate-950 hover:bg-brandTeal/90 hover:scale-105 shadow-[0_0_25px_rgba(45,212,191,0.4)]'
        }`}
      >
        <div className="relative flex items-center justify-center">
          <Mic className="w-4 h-4" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        <span className="tracking-wide">
          {isOpen ? 'Close Voice AI' : 'Voice Dispatch AI'}
        </span>
      </button>
    </div>
  );
}
