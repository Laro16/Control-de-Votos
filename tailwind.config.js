/** Config usada para COMPILAR tailwind.css (en la RAÍZ del repo) (no se carga en el navegador).
 *  Si se agregan clases nuevas en index.html o js/, hay que recompilar:
 *  npx tailwindcss -i input.css -o tailwind.css (en la RAÍZ del repo) --minify
 */
module.exports = {
  content: ['./index.html', './js/*.js'],
  theme: {
    extend: {
      colors: {
        ink: { 900: '#111826', 800: '#1D2432', 700: '#2A3244', 500: '#5A6376', 400: '#7C8496', 200: '#D9DDE4', 100: '#E9EBEF', 50: '#F4F5F7' },
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
