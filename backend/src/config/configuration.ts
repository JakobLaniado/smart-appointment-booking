export default () => ({
  port: parseInt(process.env["PORT"] ?? "3000", 10),
  database: {
    url: process.env["DATABASE_URL"],
  },
  redis: {
    host: process.env["REDIS_HOST"] ?? "localhost",
    port: parseInt(process.env["REDIS_PORT"] ?? "6379", 10),
  },
  jwt: {
    secret: process.env["JWT_SECRET"] ?? "change-me",
    expiresIn: process.env["JWT_EXPIRES_IN"] ?? "1h",
  },
  openrouter: {
    apiKey: process.env["OPENROUTER_API_KEY"],
    baseUrl: "https://openrouter.ai/api/v1",
    model: process.env["OPENROUTER_MODEL"] ?? "google/gemini-2.0-flash-exp:free",
  },
  logLevel: process.env["LOG_LEVEL"] ?? "info",
});
