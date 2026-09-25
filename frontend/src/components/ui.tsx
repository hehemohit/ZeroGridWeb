import { Loader2 } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function PageSpinner() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <Spinner className="w-8 h-8 text-brandTeal" />
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  loading = false,
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-red-500 hover:bg-red-400 text-white shadow-sm',
    secondary: 'bg-surfaceElevated hover:bg-surface text-primaryText border border-hairline shadow-sm',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30',
    ghost: 'text-secondaryText hover:text-primaryText hover:bg-surfaceElevated',
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner className="w-4 h-4" />}
      {children}
    </button>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-secondaryText">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full bg-surfaceElevated border ${error ? 'border-red-500' : 'border-hairline'} rounded-xl px-3 py-2.5 text-sm text-primaryText placeholder-mutedGray focus:outline-none focus:ring-2 focus:ring-brandTeal/30 focus:border-brandTeal transition-colors ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surfaceCard border border-hairline rounded-2xl p-6 shadow-sm transition-colors duration-200 ${className}`}>
      {children}
    </div>
  );
}

interface StatusBadgeProps {
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const map = {
    ACTIVE: { cls: 'status-active', label: 'Active' },
    ACKNOWLEDGED: { cls: 'status-acknowledged', label: 'Acknowledged' },
    RESOLVED: { cls: 'status-resolved', label: 'Resolved' },
  };
  const { cls, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    MEDICAL: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    DISASTER: 'bg-red-500/10 text-red-500 border-red-500/20',
    TRAPPED: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    SECURITY: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    OTHER: 'bg-gray-500/10 text-mutedGray border-hairline',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[category] ?? colors.OTHER}`}>
      {category}
    </span>
  );
}
