import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        race: {
          dark: '#08090f',
          navy: '#0d1117',
          card: '#111827',
          border: '#1f2937',
          yellow: '#FFD700',
          gold: '#FFA500',
          green: '#00FF87',
          red: '#FF3B30',
        },
      },
      animation: {
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'urgency': 'urgency 0.5s ease-in-out infinite',
        'race-enter': 'raceEnter 0.6s ease-out',
        'pop-in': 'popIn 0.25s ease-out',
        'ticker': 'ticker 0.4s ease-out',
        // Answer feedback
        'answer-pop': 'answerPop 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'shake': 'shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        // Leaderboard rank change
        'rank-up': 'rankUp 1.1s ease-out',
        // OTP code box
        'otp-fill': 'otpFill 0.2s ease-out',
      },
      keyframes: {
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.08)' },
          '80%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(255,215,0,0.2)' },
          '50%': { boxShadow: '0 0 24px rgba(255,215,0,0.6), 0 0 48px rgba(255,215,0,0.2)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        urgency: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.12)', opacity: '0.85' },
        },
        raceEnter: {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        popIn: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        ticker: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        answerPop: {
          '0%': { transform: 'scale(0.88)', opacity: '0' },
          '55%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '15%': { transform: 'translateX(-6px)' },
          '30%': { transform: 'translateX(6px)' },
          '45%': { transform: 'translateX(-4px)' },
          '60%': { transform: 'translateX(4px)' },
          '75%': { transform: 'translateX(-2px)' },
        },
        rankUp: {
          '0%': { backgroundColor: 'transparent', boxShadow: 'none' },
          '18%': { backgroundColor: 'rgba(255,215,0,0.13)', boxShadow: '0 0 18px rgba(255,215,0,0.28)' },
          '100%': { backgroundColor: 'transparent', boxShadow: 'none' },
        },
        otpFill: {
          '0%': { transform: 'scale(0.8)', opacity: '0.4' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
