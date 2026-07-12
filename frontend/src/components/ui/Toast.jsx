import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: <CheckCircle size={16} className="text-green-500" />,
  error:   <AlertCircle size={16} className="text-red-500" />,
  info:    <Info        size={16} className="text-blue-500" />,
};

let _emit;
export function toast(message, type = 'info') {
  _emit?.({ message, type, id: Date.now() });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _emit = (t) => {
      setToasts(prev => [...prev.slice(-4), t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500);
    };
    return () => { _emit = null; };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2.5 bg-white rounded-lg shadow-lg border border-gray-200 px-3.5 py-2.5 max-w-xs text-sm animate-fade-in"
        >
          {ICONS[t.type] || ICONS.info}
          <span className="text-gray-800 flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
