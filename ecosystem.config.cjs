module.exports = {
  apps: [
    {
      name: 'bmn-backend',
      cwd: './backend',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 8022
      }
    },
    {
      name: 'bmn-frontend',
      cwd: './frontend',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 3022 --host 0.0.0.0',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
