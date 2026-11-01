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
    // The dev server's scan for browser dependencies follows the share image
    // route into server code and tries to bundle resvg, a native module it
    // can't read. The browser never loads it.
    environments: {
      client: { optimizeDeps: { exclude: ['@resvg/resvg-js'] } },
    },
    plugins: [tanstackStart(), viteReact()],
  }
})
