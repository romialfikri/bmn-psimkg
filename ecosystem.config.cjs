module.exports = {
  apps: [
    {
      name: 'bmn-api',
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
      name: 'bmn-web',
      cwd: './',
      script: 'server-static.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3022,
        BACKEND_PORT: 8022
      }
    }
  ]
};
