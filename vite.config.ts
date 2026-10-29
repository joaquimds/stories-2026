import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  // The dev server runs the app in-process, so it needs .env in process.env
  if (command === 'serve') {
    Object.assign(process.env, {
      ...loadEnv(mode, process.cwd(), ''),
      ...process.env,
    })
  }
  return {
    server: { port: 3000 },
    plugins: [tanstackStart(), viteReact()],
  }
})
