import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { configDotenv } from "dotenv";

import { processFile } from "./main.js"; // AI agent function

configDotenv();

const allowedOrigins = process.env.ORIGIN

const app = express();
app.use(cors({ 
    origin: allowedOrigins,
    methods: ["POST"],
    })); 

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

app.post("/execute-task", upload.single("file"), async (req, res) => {
  try {
    if (!req.file.path) {
      return res.status(400).json({ error: "No file received." });
    }

    const filePath = req.file.path;
    console.log("Received file:", filePath);

    const result = await processFile(filePath);
    res.json({ message: "Task executed successfully", result });
  } catch (error) {
    console.error("Error executing task:", error);
    res.status(500).json({ error: "Failed to execute task." });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
