import express from "express";
import cors from "cors";

import demoRoutes from "./routes/demo.routes.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/demo", demoRoutes);

export default app;