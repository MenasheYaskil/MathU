import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { races } from '../../../services/apiService';

const CODE_LENGTH = 6;

export default function JoinLobby() {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(CODE_LENGTH).fill(null));
  const navigate = useNavigate();

  const code = digits.join('');
  const filled = digits.filter(Boolean).length;

  const focus = (i: number) => inputRefs.current[Math.max(0, Math.min(i, CODE_LENGTH - 1))]?.focus();

  const handleChange = useCallback((index: number, value: string) => {
    const char = value.replace(/[^A-Z0-9]/gi, '').slice(-1).toUpperCase();
    setDigits((prev) => {
      const next = [...prev];
      next[index] = char;
      return next;
    });
    if (char) focus(index + 1);
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigits((prev) => { const n = [...prev]; n[index] = ''; return n; });
      } else {
        focus(index - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      focus(index - 1);
    } else if (e.key === 'ArrowRight') {
      focus(index + 1);
    }
  }, [digits]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text')
      .replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
    if (!paste) return;
    const next = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < paste.length; i++) next[i] = paste[i];
    setDigits(next);
    focus(Math.min(paste.length, CODE_LENGTH - 1));
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) return;
    setError(null);
    setLoading(true);
    try {
      const { raceId } = await races.join(code);
      navigate(`/student/race/${raceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code — check with your teacher.');
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => focus(0), 50);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #08090f 0%, #0d1117 55%, #08090f 100%)' }}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {['🏎️', '⚡', '🏁', '🚗', '⭐', '🎯'].map((emoji, i) => (
          <span
            key={i}
            className="absolute text-4xl opacity-[0.04] animate-float"
            style={{ left: `${5 + i * 17}%`, top: `${10 + (i % 3) * 30}%`, animationDelay: `${i * 0.5}s` }}
          >
            {emoji}
          </span>
        ))}
        {[15, 35, 55, 75, 90].map((top, i) => (
          <div
            key={i}
            className="absolute h-px"
            style={{
              top: `${top}%`, left: '-5%', right: '-5%',
              background: 'linear-gradient(to right, transparent, rgba(59,130,246,0.07), transparent)',
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-sm mx-4 animate-slide-up">
        <div
          className="h-3 rounded-t-2xl"
          style={{ background: 'repeating-conic-gradient(rgba(59,130,246,0.15) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px' }}
        />

        <form onSubmit={handleJoin} className="card-glass rounded-b-2xl p-8 space-y-8 shadow-2xl">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="text-5xl mb-3 animate-float">🏁</div>
            <h1 className="text-3xl font-black text-white tracking-tight">Join a Race</h1>
            <p className="text-gray-500 text-sm">Enter the 6-character code your teacher shared</p>
          </div>

          {/* OTP boxes */}
          <div className="flex gap-2.5 justify-center" onPaste={handlePaste}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="text"
                maxLength={2}
                value={digits[i]}
                autoFocus={i === 0}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                className={[
                  'w-12 h-14 rounded-xl text-center text-2xl font-black font-mono uppercase',
                  'transition-all duration-150 outline-none select-all',
                  digits[i] ? 'animate-otp-fill' : '',
                ].join(' ')}
                style={{
                  background: 'rgba(17,24,39,0.9)',
                  color: digits[i] ? '#FFD700' : '#4b5563',
                  border: digits[i]
                    ? '2px solid rgba(255,215,0,0.55)'
                    : document.activeElement === inputRefs.current[i]
                    ? '2px solid rgba(59,130,246,0.5)'
                    : '2px solid rgba(255,255,255,0.08)',
                  boxShadow: digits[i] ? '0 0 12px rgba(255,215,0,0.12)' : 'none',
                }}
                aria-label={`Code digit ${i + 1}`}
              />
            ))}
          </div>

          {/* Progress indicator */}
          <div className="flex justify-center gap-1.5 -mt-4">
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full transition-all duration-200"
                style={{
                  width: i < filled ? '18px' : '6px',
                  background: i < filled ? 'rgba(255,215,0,0.7)' : 'rgba(255,255,255,0.1)',
                }}
              />
            ))}
          </div>

          {error && (
            <div className="bg-red-950/80 border border-red-500/40 text-red-400 text-sm px-4 py-3 rounded-xl animate-shake text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || filled < CODE_LENGTH}
            className="w-full py-4 rounded-2xl font-black text-sm text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            style={{
              background: filled === CODE_LENGTH
                ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                : 'rgba(31,41,55,0.6)',
              boxShadow: filled === CODE_LENGTH ? '0 4px 20px rgba(37,99,235,0.3)' : 'none',
            }}
          >
            {loading
              ? '⚙️ Joining race…'
              : filled === CODE_LENGTH
              ? '🏎️ Enter Race!'
              : `${CODE_LENGTH - filled} more character${CODE_LENGTH - filled !== 1 ? 's' : ''}`}
          </button>
        </form>
      </div>
    </div>
  );
}
