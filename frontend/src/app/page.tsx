'use client';
import Link from 'next/link';
import { Shield, Radio, Users, Bell, Map, ChevronRight, Wifi, WifiOff, Zap } from 'lucide-react';

const features = [
  {
    icon: WifiOff,
    title: 'Offline-First Mesh',
    description: 'BLE & Wi-Fi Direct mesh network that works with zero internet. Messages relay through other devices automatically.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    icon: Bell,
    title: 'Internet SOS Alerts',
    description: 'When online, SOS triggers send push notifications to emergency contacts and alerts the rescue admin panel instantly.',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
  },
  {
    icon: Users,
    title: 'Emergency Contacts',
    description: 'Add trusted ZeroGrid users as emergency contacts. They get notified the moment you trigger an SOS.',
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
  },
  {
    icon: Map,
    title: 'Live Rescue Map',
    description: 'Admin rescue teams see a real-time map of all active SOS events with GPS coordinates and can acknowledge or resolve them.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
  },
  {
    icon: Radio,
    title: 'Family Tracking',
    description: 'Link parent and child accounts. Parents can view a child\'s last known location when they trigger SOS.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
  },
  {
    icon: Zap,
    title: 'Automatic Failover',
    description: 'SOS fans out to both mesh and internet simultaneously. If offline, queues the online send until connectivity returns.',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
  },
];

const stats = [
  { value: 'Zero', label: 'Internet Required', sub: 'for core mesh functionality' },
  { value: '2s', label: 'SOS Delivery', sub: 'average time to alert contacts' },
  { value: 'TTL 10', label: 'Mesh Hops', sub: 'SOS beacon relay depth' },
  { value: '100%', label: 'Free to use', sub: 'no subscription ever' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
        {/* Radial background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(239,68,68,0.15),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_60%,rgba(249,115,22,0.06),transparent)]" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8 fade-in">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card border border-red-500/20 text-sm text-red-400">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Emergency Network · Offline First · Always Ready
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight">
            <span className="text-white">When networks</span>
            <br />
            <span className="gradient-text">fail, we don't.</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            ZeroGrid is a dual-mode emergency communication platform. Offline mesh via BLE & Wi-Fi Direct, 
            online SOS alerts to rescue teams — both triggered with a single tap.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/register"
              id="hero-get-started"
              className="inline-flex items-center gap-2 px-8 py-4 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-red-500/25 hover:-translate-y-0.5 text-base"
            >
              Get Started Free
              <ChevronRight className="w-5 h-5" />
            </Link>
            <Link
              href="/auth/login"
              id="hero-login"
              className="inline-flex items-center gap-2 px-8 py-4 glass-card text-gray-300 hover:text-white font-medium rounded-xl transition-all duration-200 hover:-translate-y-0.5 text-base"
            >
              <Shield className="w-5 h-5" />
              Sign In
            </Link>
          </div>

          {/* Supported indicators */}
          <div className="flex items-center justify-center gap-8 pt-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Wifi className="w-4 h-4 text-green-400" />
              Wi-Fi Direct
            </div>
            <div className="w-1 h-1 bg-gray-700 rounded-full" />
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Radio className="w-4 h-4 text-blue-400" />
              Bluetooth LE
            </div>
            <div className="w-1 h-1 bg-gray-700 rounded-full" />
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Bell className="w-4 h-4 text-red-400" />
              FCM Push
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-600 animate-bounce">
          <div className="w-px h-8 bg-gradient-to-b from-transparent to-gray-600" />
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 border-y border-white/5">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center space-y-1">
              <div className="text-3xl font-black gradient-text">{s.value}</div>
              <div className="text-sm font-semibold text-gray-200">{s.label}</div>
              <div className="text-xs text-gray-500">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-white">
              Built for the <span className="gradient-text">worst moments</span>
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Every feature is designed around a simple principle: when you need help, it should work — 
              no bars, no Wi-Fi, no excuses.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className={`glass-card rounded-2xl p-6 border transition-all duration-300 hover:border-white/15 hover:-translate-y-1 group ${f.bg}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${f.bg} border border-current/20`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="font-bold text-gray-100 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto sos-pulse">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white">
            Ready to stay protected?
          </h2>
          <p className="text-gray-400">
            Create your free account and add your emergency contacts today. Hope you never need it — but know it&apos;s there.
          </p>
          <Link
            href="/auth/register"
            id="cta-register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-red-500/25 hover:-translate-y-0.5"
          >
            Create Free Account
            <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm">Zero<span className="text-red-400">Grid</span></span>
          </div>
          <p className="text-xs text-gray-600">© 2026 ZeroGrid. Built for emergencies. Free forever.</p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <Link href="/auth/login" className="hover:text-gray-400 transition-colors">Login</Link>
            <Link href="/auth/register" className="hover:text-gray-400 transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
