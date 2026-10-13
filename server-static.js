const path = require('path');
const http = require('http');

// Safely resolve express from current directory or backend
let express;
try {
  express = require('express');
} catch (e1) {
  try {
    express = require(path.join(__dirname, 'backend', 'node_modules', 'express'));
  } catch (e2) {
    console.error('Express not found. Please run npm install in backend or root.');
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3022;
const BACKEND_PORT = process.env.BACKEND_PORT || 8022;
const distDir = path.join(__dirname, 'frontend', 'dist');

// Reverse proxy helper to backend on port 8022
function proxyToBackend(req, res) {
  // Use originalUrl to preserve mount path
  let targetPath = req.originalUrl;
  if (targetPath.startsWith('/bmn/')) {
    targetPath = targetPath.replace(/^\/bmn/, '');
  }

  const options = {
    hostname: '127.0.0.1',
    port: BACKEND_PORT,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${BACKEND_PORT}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] Failed to connect to backend on port ${BACKEND_PORT}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: 'Backend API service is currently unreachable (port ' + BACKEND_PORT + ')'
      });
    }
  });

  req.pipe(proxyReq, { end: true });
}

// 1. Proxy API & Uploads (both /api and /bmn/api)
app.use(['/api', '/bmn/api', '/uploads', '/bmn/uploads'], proxyToBackend);

// 2. Serve static assets from frontend/dist
// Supports both root / and /bmn prefix
app.use('/bmn', express.static(distDir));
app.use(express.static(distDir));

// Fallback for logo if requested directly
app.get(['/bmn/logo-bmkg.png', '/logo-bmkg.png'], (req, res) => {
  res.sendFile(path.join(distDir, 'logo-bmkg.png'));
});

// 3. SPA Fallback: send index.html for all page routes
app.get(['/bmn/*', '/*'], (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`BMN Web Static Server (bmn-web)`);
  console.log(`Port: ${PORT}`);
  console.log(`Serving dist: ${distDir}`);
  console.log(`Proxying API to backend port: ${BACKEND_PORT}`);
  console.log(`Access: http://localhost:${PORT} or http://localhost:${PORT}/bmn`);
  console.log(`===============================================`);
});
