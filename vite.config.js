import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import url from 'node:url'

// Vite plugin to provide local dev server API endpoints matching Vercel serverless functions
function apiMiddlewarePlugin() {
  return {
    name: 'api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = url.parse(req.url, true)
        const pathname = parsedUrl.pathname

        if (pathname === '/api/analyze' || pathname === '/api/chat') {
          // Parse JSON body if POST/PUT
          let body = {}
          if (req.method === 'POST' || req.method === 'PUT') {
            const buffers = []
            for await (const chunk of req) {
              buffers.push(chunk)
            }
            const rawBody = Buffer.concat(buffers).toString()
            if (rawBody) {
              try {
                body = JSON.parse(rawBody)
              } catch (e) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                return res.end(JSON.stringify({ error: 'Invalid JSON body' }))
              }
            }
          }

          // Construct Vercel/Express compatible response object
          const mockReq = {
            method: req.method,
            headers: req.headers,
            query: parsedUrl.query,
            body,
          }

          const mockRes = {
            statusCode: 200,
            status(code) {
              this.statusCode = code
              return this
            },
            json(data) {
              res.statusCode = this.statusCode
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(data))
              return this
            },
            send(data) {
              res.statusCode = this.statusCode
              res.end(data)
              return this
            }
          }

          try {
            if (pathname === '/api/analyze') {
              const { default: handler } = await import('./api/analyze.js')
              return await handler(mockReq, mockRes)
            }
            if (pathname === '/api/chat') {
              const { default: handler } = await import('./api/chat.js')
              return await handler(mockReq, mockRes)
            }
          } catch (err) {
            console.error('API dev middleware error:', err)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }))
          }
        }

        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), apiMiddlewarePlugin()],
  build: {
    outDir: 'dist',
  },
})
