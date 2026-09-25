'use client';
import { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';
import { StatusBadge, CategoryBadge, Card, Spinner, Button } from '@/components/ui';
import { ArrowLeft, Clock, MapPin, ExternalLink, Navigation, Crosshair } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SosDetail {
  id: string;
  category: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  message?: string;
  createdAt: string;
  updatedAt: string;
  accuracyMeters?: number;
  transport: string;
  location: { coordinates: [number, number] };
  triggeredBy: { displayName: string; email: string; phoneNumber?: string };
  notes?: Array<{ text: string; timestamp: string }>;
}

export default function SosDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [sos, setSos] = useState<SosDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchSos() {
      try {
        const data = await api.get<{ sos: SosDetail }>(`/api/sos/${id}`);
        setSos(data.sos);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    fetchSos();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Spinner className="w-8 h-8 text-brandTeal" />
      </div>
    );
  }

  if (notFound || !sos) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4 text-primaryText">
        <p className="text-xl font-bold">SOS Event Not Found</p>
        <p className="text-mutedGray text-sm">The requested emergency broadcast does not exist or has expired.</p>
        <Button variant="secondary" onClick={() => router.back()} className="mt-2 rounded-full flex items-center gap-2 mx-auto">
          <ArrowLeft className="w-4 h-4" /> Go Back
        </Button>
      </div>
    );
  }

  const lat = sos.location.coordinates[1];
  const lng = sos.location.coordinates[0];
  const hasValidCoords = lat !== 0 || lng !== 0;
  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}&z=16`;
  const osmEmbed = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`;
  const elapsed = Math.floor((Date.now() - new Date(sos.createdAt).getTime()) / 60000);

  return (
    <div className="min-h-full bg-canvas text-primaryText">

      {/* Sticky Header Bar */}
      <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur-md border-b border-hairline px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="text-mutedGray hover:text-primaryText p-1.5 sm:p-2 rounded-full hover:bg-surfaceElevated transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-primaryText text-sm sm:text-base truncate font-display">
            Track SOS — {sos.triggeredBy.displayName}
          </h1>
          <p className="text-[10px] sm:text-xs text-mutedGray font-mono truncate">ID: {sos.id}</p>
        </div>
        <div className="shrink-0">
          <StatusBadge status={sos.status} />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-4 sm:space-y-6 fade-in">

        {/* Core SOS Info Card */}
        <Card className="p-4 sm:p-5 space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={sos.category} />
            <span className="text-[10px] sm:text-xs text-mutedGray font-mono flex items-center gap-1 bg-surfaceElevated px-2.5 py-0.5 rounded-full border border-hairline">
              <Clock className="w-3 h-3" />
              {elapsed < 1 ? 'Just now' : elapsed < 60 ? `${elapsed}m ago` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m ago`}
            </span>
          </div>
          <div>
            <p className="font-bold text-primaryText text-base sm:text-lg">{sos.triggeredBy.displayName}</p>
            <p className="text-xs sm:text-sm text-mutedGray">{sos.triggeredBy.email}</p>
            {sos.triggeredBy.phoneNumber && (
              <p className="text-xs sm:text-sm text-mutedGray font-mono mt-0.5">
                {sos.triggeredBy.phoneNumber}
              </p>
            )}
          </div>
          {sos.message && (
            <div className="bg-surfaceElevated rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 border border-hairline">
              <p className="text-xs sm:text-sm text-primaryText italic">&quot;{sos.message}&quot;</p>
            </div>
          )}
        </Card>

        {/* GPS Coordinates Data Card */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-3">
            <Crosshair className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brandTeal" />
            <span className="text-[10px] sm:text-xs font-bold text-brandTeal uppercase tracking-wider font-display">
              GPS Coordinates
            </span>
          </div>

          {hasValidCoords ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-surfaceElevated rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-hairline">
                  <p className="text-[10px] sm:text-xs text-mutedGray mb-0.5 sm:mb-1">Latitude</p>
                  <p className="font-mono font-bold text-primaryText text-xs sm:text-sm truncate">
                    {lat.toFixed(6)}
                  </p>
                </div>
                <div className="bg-surfaceElevated rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-hairline">
                  <p className="text-[10px] sm:text-xs text-mutedGray mb-0.5 sm:mb-1">Longitude</p>
                  <p className="font-mono font-bold text-primaryText text-xs sm:text-sm truncate">
                    {lng.toFixed(6)}
                  </p>
                </div>
              </div>

              {sos.accuracyMeters != null && (
                <p className="text-[10px] sm:text-xs text-mutedGray flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-brandTeal" />
                  GPS Accuracy: ±{Math.round(sos.accuracyMeters)} meters
                </p>
              )}

              <a
                id={`track-sos-maps-${sos.id}`}
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-brandTeal hover:text-brandTealGlow mt-1"
              >
                <Navigation className="w-3.5 h-3.5" />
                Open in Google Maps
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-mutedGray italic bg-surfaceElevated p-3 rounded-lg border border-hairline">
              No GPS coordinates available for this SOS event.
            </p>
          )}
        </Card>

        {/* Live Map iFrame Box */}
        {hasValidCoords && (
          <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-hairline shadow-md bg-surfaceCard">
            <div className="bg-surfaceElevated px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between border-b border-hairline gap-2 sm:gap-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-[10px] sm:text-xs font-bold font-mono text-primaryText truncate">
                  LIVE LOCATION — {sos.triggeredBy.displayName.toUpperCase()}
                </span>
              </div>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] sm:text-xs font-semibold text-brandTeal hover:text-brandTealGlow flex items-center gap-1"
              >
                Full screen <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              </a>
            </div>

            <iframe
              id={`track-sos-map-${sos.id}`}
              src={osmEmbed}
              className="w-full h-64 sm:h-96"
              style={{ border: 'none' }}
              loading="lazy"
              title={`SOS Location - ${sos.triggeredBy.displayName}`}
            />

            <div className="bg-surfaceElevated px-3 sm:px-4 py-2 flex items-center gap-2 text-[10px] sm:text-xs text-mutedGray border-t border-hairline">
              <MapPin className="w-3 h-3 text-red-500 shrink-0" />
              <span className="font-mono truncate">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
              {sos.accuracyMeters != null && (
                <span className="ml-auto font-mono shrink-0">±{Math.round(sos.accuracyMeters)}m</span>
              )}
            </div>
          </div>
        )}

        {/* Rescue Notes Array */}
        {sos.notes && sos.notes.length > 0 && (
          <Card className="p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs font-bold text-brandTeal uppercase tracking-wider mb-2.5 sm:mb-3 font-display">
              Rescue Notes
            </p>
            <div className="space-y-2">
              {sos.notes.map((n, i) => (
                <div key={i} className="bg-surfaceElevated rounded-lg px-3 py-2.5 border border-hairline">
                  <p className="text-xs sm:text-sm text-primaryText">{n.text}</p>
                  <p className="text-[10px] sm:text-xs text-mutedGray mt-1 font-mono">
                    {new Date(n.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Technical Footer */}
        <p className="text-center text-[9px] sm:text-[10px] text-mutedGray font-mono pb-4">
          Updated: {new Date(sos.updatedAt).toLocaleString()} • Transport: {sos.transport}
        </p>
      </div>
    </div>
  );
}