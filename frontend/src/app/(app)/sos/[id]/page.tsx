'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { MapPin, ArrowLeft, Navigation, Clock, AlertTriangle, ExternalLink, Crosshair } from 'lucide-react';
import { Card, Button, StatusBadge, CategoryBadge, Spinner } from '@/components/ui';

interface SosEvent {
  id: string;
  triggeredBy: { displayName: string; email: string; phoneNumber?: string };
  location: { type: string; coordinates: [number, number] };
  accuracyMeters?: number;
  category: string;
  message?: string;
  transport: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  notes?: { authorId: string; text: string; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
}

export default function TrackSosPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sos, setSos] = useState<SosEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<{ sos: SosEvent }>(`/api/sos/${id}`)
      .then(d => setSos(d.sos))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><Spinner className="w-8 h-8 text-red-500" /></div>;
  if (error || !sos) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-white">
      <AlertTriangle className="w-12 h-12 text-red-400" />
      <p className="text-lg font-semibold">{error || 'SOS event not found'}</p>
      <Button variant="secondary" onClick={() => router.back()}><ArrowLeft className="w-4 h-4" /> Go Back</Button>
    </div>
  );

  const lat = sos.location.coordinates[1];
  const lng = sos.location.coordinates[0];
  const hasValidCoords = lat !== 0 || lng !== 0;
  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}&z=16`;
  const osmEmbed = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.01},${lat-0.01},${lng+0.01},${lat+0.01}&layer=mapnik&marker=${lat},${lng}`;
  const elapsed = Math.floor((Date.now() - new Date(sos.createdAt).getTime()) / 60000);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white truncate">Track SOS — {sos.triggeredBy.displayName}</h1>
          <p className="text-xs text-gray-500 font-mono">ID: {sos.id}</p>
        </div>
        <StatusBadge status={sos.status} />
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5 fade-in">
        <Card className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={sos.category} />
            <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {elapsed < 1 ? 'Just now' : elapsed < 60 ? `${elapsed}m ago` : `${Math.floor(elapsed/60)}h ${elapsed%60}m ago`}
            </span>
          </div>
          <div>
            <p className="font-bold text-lg">{sos.triggeredBy.displayName}</p>
            <p className="text-sm text-gray-400">{sos.triggeredBy.email}</p>
            {sos.triggeredBy.phoneNumber && <p className="text-sm text-gray-400 font-mono">{sos.triggeredBy.phoneNumber}</p>}
          </div>
          {sos.message && <div className="bg-gray-900 rounded-lg px-4 py-3 border border-white/5"><p className="text-sm text-gray-300 italic">"{sos.message}"</p></div>}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Crosshair className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">GPS Coordinates</span>
          </div>
          {hasValidCoords ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900 rounded-lg p-3 border border-white/5">
                  <p className="text-xs text-gray-500 mb-1">Latitude</p>
                  <p className="font-mono font-bold">{lat.toFixed(6)}</p>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 border border-white/5">
                  <p className="text-xs text-gray-500 mb-1">Longitude</p>
                  <p className="font-mono font-bold">{lng.toFixed(6)}</p>
                </div>
              </div>
              {sos.accuracyMeters != null && <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />GPS Accuracy: +-{Math.round(sos.accuracyMeters)} meters</p>}
              <a id={`track-sos-maps-${sos.id}`} href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
                <Navigation className="w-3.5 h-3.5" />Open in Google Maps<ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : <p className="text-sm text-gray-500 italic">No GPS coordinates available for this SOS event.</p>}
        </Card>

        {hasValidCoords && (
          <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <div className="bg-gray-900 px-4 py-2.5 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold font-mono">LIVE LOCATION — {sos.triggeredBy.displayName.toUpperCase()}</span>
              </div>
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">Full screen <ExternalLink className="w-3 h-3" /></a>
            </div>
            <iframe id={`track-sos-map-${sos.id}`} src={osmEmbed} className="w-full h-96" style={{border:'none',filter:'invert(90%) hue-rotate(180deg)'}} loading="lazy" title={`SOS Location - ${sos.triggeredBy.displayName}`} />
            <div className="bg-gray-900 px-4 py-2 flex items-center gap-2 text-xs text-gray-500 border-t border-white/5">
              <MapPin className="w-3 h-3 text-red-400" />
              <span className="font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
              {sos.accuracyMeters != null && <span className="ml-auto">+-{Math.round(sos.accuracyMeters)}m</span>}
            </div>
          </div>
        )}

        {sos.notes && sos.notes.length > 0 && (
          <Card>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Rescue Notes</p>
            <div className="space-y-2">
              {sos.notes.map((n, i) => (
                <div key={i} className="bg-gray-900 rounded-lg px-3 py-2.5 border border-white/5">
                  <p className="text-sm text-gray-300">{n.text}</p>
                  <p className="text-xs text-gray-600 mt-1">{new Date(n.timestamp).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <p className="text-center text-xs text-gray-700 font-mono">Updated: {new Date(sos.updatedAt).toLocaleString()} - Transport: {sos.transport}</p>
      </div>
    </div>
  );
}