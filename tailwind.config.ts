import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { brand: { DEFAULT: '#2e7d32', dark: '#1b5e20', light: '#e8f3e8' }, leaf: '#66bb6a' } } },
  plugins: [],
} satisfies Config;
