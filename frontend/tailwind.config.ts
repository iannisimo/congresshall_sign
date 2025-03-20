/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  safelist: [
    "scale-[.8]"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F0F8FF',
          100: '#E5F3FF',
          200: '#D1E9FF',
          300: '#B3DAFF',
          400: '#85C4FF',
          500: '#47A6FF',
          600: '#0D83F2',
          700: '#0871D4',
          800: '#0B5EAD',
          900: '#10508C',
          950: '#02274A',
        },
        secondary: {
          50: '#FFF0FF',
          100: '#FFE5FF',
          200: '#FED1FF',
          300: '#FEB3FF',
          400: '#FD85FF',
          500: '#FC47FF',
          600: '#EE0DF2',
          700: '#D008D4',
          800: '#AA0BAD',
          900: '#8A108C',
          950: '#49024A',
        },
        success: "#14ae5c",
        warning: "#e8b931",
        error: "#ec221f",
        mikela: "#ffb74d"
      },
    },
  },
  plugins: [],
}
