/** PM2 ecosystem for the transcript web service. */
module.exports = {
  apps: [
    {
      name: "zenode-transcript",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      kill_timeout: 10_000,
      min_uptime: "5s",
      max_restarts: 15,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
