import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// base must match the GitHub repo name so asset links resolve on Pages.
// If you name the repo something other than "taimaka-itp-triage",
// change the base below to "/your-repo-name/".
export default defineConfig({
  base: '/taimaka-itp-triage/',
  plugins: [react(), tailwindcss()],
})
