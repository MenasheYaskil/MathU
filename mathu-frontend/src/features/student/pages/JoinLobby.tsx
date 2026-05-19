import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { races } from '../../../services/apiService';

export default function JoinLobby() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { raceId } = await races.join(code.trim().toUpperCase());
      navigate(`/student/race/${raceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code — check with your teacher.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <form
        onSubmit={handleJoin}
        className="bg-gray-800 p-8 rounded-xl w-full max-w-sm space-y-5 shadow-xl text-white"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold">Join a Race</h1>
          <p className="text-gray-400 text-sm mt-1">Enter the 6-character code from your teacher.</p>
        </div>

        <input
          className="w-full px-4 py-4 rounded bg-gray-700 text-center text-3xl font-mono tracking-[0.4em] uppercase placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="XXXXXX"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          required
        />

        {error && (
          <p className="bg-red-900/50 border border-red-600 text-red-300 text-sm px-3 py-2 rounded text-center">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-semibold transition-colors"
        >
          {loading ? 'Joining…' : 'Join Race'}
        </button>
      </form>
    </div>
  );
}
