// Sample application code. The coding agent is meant to edit files here.
import express from "express";

const app = express();
app.get("/health", (req, res) => res.json({ ok: true }));
app.listen(process.env.PORT ?? 3000);
