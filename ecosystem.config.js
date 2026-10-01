module.exports = {
  apps: [
    {
      name: "mis-backend",
      cwd: "/opt/apps/nga_central_mis/backend",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M",
      // Usage & Monitoring flushes buffered activity on SIGTERM (docs/PLATFORM_ACTIVITY.md).
      kill_timeout: 8000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
