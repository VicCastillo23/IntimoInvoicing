/**
 * PM2 — los 3 backends en /opt/intimo (EC2 producción).
 * Copiar a /opt/intimo/ecosystem.config.js
 *
 *   pm2 start /opt/intimo/ecosystem.config.js
 *   pm2 save
 *
 * Tras git pull en accounting/invoicing: npm ci --omit=dev && pm2 restart intimo-accounting
 * Tras nuevo JAR loyalty: pm2 restart intimo-loyalty
 */
module.exports = {
  apps: [
    {
      name: "intimo-accounting",
      cwd: "/opt/intimo/IntimoAccounting",
      script: "src/index.js",
      interpreter: "/usr/bin/node",
      env: { NODE_ENV: "production" },
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,
    },
    {
      name: "intimo-invoicing",
      cwd: "/opt/intimo/IntimoInvoicing",
      script: "src/index.js",
      interpreter: "/usr/bin/node",
      env: { NODE_ENV: "production" },
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,
    },
    {
      name: "intimo-loyalty",
      cwd: "/opt/intimo/loyalty",
      script: "/opt/intimo/scripts/start-loyalty.sh",
      interpreter: "bash",
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,
    },
  ],
};
