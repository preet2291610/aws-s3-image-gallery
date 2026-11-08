require("dotenv").config();

const express = require("express");
const multer = require("multer");
const {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 3000;
const BUCKET = process.env.S3_BUCKET;

const s3 = new S3Client({
  region: process.env.AWS_REGION
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  }
});

app.use(express.static("public"));
app.use(express.json());

app.get("/api/images", async (req, res) => {
  try {
    const result = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET })
    );

    const images = await Promise.all(
      (result.Contents || [])
        .filter(item => item.Key)
        .map(async item => {
          const url = await getSignedUrl(
            s3,
            new (require("@aws-sdk/client-s3").GetObjectCommand)({
              Bucket: BUCKET,
              Key: item.Key
            }),
            { expiresIn: 3600 }
          );

          return {
            key: item.Key,
            url,
            size: item.Size,
            date: item.LastModified
          };
        })
    );

    res.json(images);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load images" });
  }
});

app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Select an image first" });
    }

    const key = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    res.json({ message: "Image uploaded successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.delete("/api/images/:key", async (req, res) => {
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: req.params.key
    }));

    res.json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Delete failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Image Gallery running on port ${PORT}`);
});

