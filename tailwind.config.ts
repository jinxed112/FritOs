import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Couleurs MDjambo
        primary: {
          DEFAULT: '#FF6B00',
          50: '#FFF3E6',
          100: '#FFE0BF',
          200: '#FFCC99',
          300: '#FFB873',
          400: '#FFA44D',
          500: '#FF6B00',
          600: '#CC5600',
          700: '#994000',
          800: '#662B00',
          900: '#331500',
        },
        dark: '#1A1A1A',
        success: '#22C55E',
        warning: '#EAB308',
        error: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
