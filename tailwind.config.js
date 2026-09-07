/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        cartouche: ['Cinzel', 'Times New Roman', 'serif'],
        'serif-body': ['"Cormorant Garamond"', 'Georgia', 'serif'],
        'serif-book': ['Newsreader', 'Georgia', 'serif'],
      },
      fontSize: {
        nano: ['8px', { lineHeight: '10px', letterSpacing: '0.04em' }],
        micro: ['9px', { lineHeight: '12px', letterSpacing: '0.03em' }],
        body: ['10px', { lineHeight: '13px', letterSpacing: '0.02em' }],
        title: ['11px', { lineHeight: '14px', letterSpacing: '0.05em' }],
      },
      colors: {
        'theme-text-primary': 'var(--theme-text-primary)',
        'theme-text-secondary': 'var(--theme-text-secondary)',
        'theme-text-muted': 'var(--theme-text-muted)',
        'theme-text-accent': 'var(--theme-text-accent)',
        'theme-text-inverse': 'var(--theme-text-inverse)',

        'theme-panel-bg': 'var(--theme-panel-bg)',
        'theme-panel-border': 'var(--theme-panel-border)',
        'theme-card-bg': 'var(--theme-card-bg)',
        'theme-card-border': 'var(--theme-card-border)',
        'theme-neatline-border': 'var(--theme-neatline-border)',
        'theme-neatline-accent': 'var(--theme-neatline-accent)',

        'theme-control-bg': 'var(--theme-control-bg)',
        'theme-control-border': 'var(--theme-control-border)',
        'theme-control-text': 'var(--theme-control-text)',
        'theme-control-hover-bg': 'var(--theme-control-hover-bg)',
        'theme-control-active-bg': 'var(--theme-control-active-bg)',
        'theme-control-active-border': 'var(--theme-control-active-border)',
        'theme-control-active-text': 'var(--theme-control-active-text)',

        'theme-switch-track-bg': 'var(--theme-switch-track-bg)',
        'theme-switch-track-active-bg': 'var(--theme-switch-track-active-bg)',
        'theme-switch-thumb-bg': 'var(--theme-switch-thumb-bg)',
        'theme-switch-thumb-active-bg': 'var(--theme-switch-thumb-active-bg)',

        'theme-slider-track-bg': 'var(--theme-slider-track-bg)',
        'theme-slider-track-fill': 'var(--theme-slider-track-fill)',
        'theme-slider-thumb-bg': 'var(--theme-slider-thumb-bg)',
      },
      animation: {
        'spin-slow': 'spin 20s linear infinite',
      },
    },
  },
  plugins: [],
}
