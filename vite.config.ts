import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, serve /api/* from the same files Vercel deploys as functions.
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')
      Object.assign(process.env, env)
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const name = req.url.slice(5).split('?')[0]
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          let body = ''
          for await (const chunk of req) body += chunk
          const r = {
            statusCode: 200,
            status(n: number) { this.statusCode = n; return this },
            setHeader: (k: string, v: string) => res.setHeader(k, v),
            json(b: unknown) { res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)) },
          }
          await mod.default({ method: req.method, body, headers: req.headers }, r)
        } catch (e) {
          res.statusCode = 500
          res.end(String(e))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: { port: 5190 },
})
