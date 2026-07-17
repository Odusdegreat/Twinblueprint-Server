import app from "./src/app.ts";
import { env } from "./src/config/env.config.ts";

const startServer = () => {
  app.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
  });
};

startServer();
