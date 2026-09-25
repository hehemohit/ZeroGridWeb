'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

interface ThemeToggleProps {
  /** 'icon' = just the icon button (default), 'pill' = icon + label */
  variant?: 'icon' | 'pill';
  className?: string;
}

export function ThemeToggle({ variant = 'icon', className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  if (variant === 'pill') {
    return (
      <button
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
          ${isDark
            ? 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
            : 'bg-black/5 text-gray-600 hover:bg-black/10 hover:text-gray-900'}
          ${className}`}
      >
        {isDark ? (
          <Sun className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 text-indigo-500" />
        )}
        <span>{isDark ? 'Light' : 'Dark'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 group
        ${isDark
          ? 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-amber-300'
          : 'bg-black/5 hover:bg-black/10 text-gray-500 hover:text-indigo-600'}
        ${className}`}
    >
      {/* Animated icon swap */}
      <span
        className="absolute transition-all duration-300"
        style={{
          opacity: isDark ? 1 : 0,
          transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)',
        }}
      >
        <Sun className="w-4 h-4 text-amber-400" />
      </span>
      <span
        className="absolute transition-all duration-300"
        style={{
          opacity: isDark ? 0 : 1,
          transform: isDark ? 'rotate(90deg) scale(0.5)' : 'rotate(0deg) scale(1)',
        }}
      >
        <Moon className="w-4 h-4 text-indigo-500" />
      </span>
    </button>
  );
}
