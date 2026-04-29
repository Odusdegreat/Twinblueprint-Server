import app from "./src/app.ts";
import { connectDB } from "./src/config/db.config.ts";
import { env } from "./src/config/env.config.ts";

const startServer = async () => {
  await connectDB();

  app.listen(env.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
  });
};

startServer();