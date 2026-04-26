require("dotenv").config();
const express = require("express");
const app = express();
const connectToDb = require("./config/db");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth.routes");
const profileRoutes = require("./routes/profile.routes");
const ridesRoutes = require("./routes/rides.routes");
const adminRoutes = require("./routes/admin.routes");
const supportRoutes = require("./routes/support.routes");
const feedbackRoutes = require("./routes/feedback.routes");
const { errorHandler } = require("./middleware/error.middleware");
const { protect } = require("./middleware/auth.middleware");
const User = require("./model/User.model");
const s3Service = require("./services/s3.service");

// DB
connectToDb();

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
    exposedHeaders: ["authorization"],
  })
);

// Health check
app.get("/", (req, res) => {
  res.send("API running");
});

// Routes
app.use("/auth", authRoutes);
app.get("/auth/me", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    delete user.password;
    let profilePhotoUrl = null;
    if (user.profilePhoto) {
      try {
        profilePhotoUrl = await s3Service.getFileUrl(user.profilePhoto);
      } catch (_) {
        profilePhotoUrl = s3Service.baseUrl ? `${s3Service.baseUrl}/${user.profilePhoto}` : null;
      }
    }
    res.json({ success: true, user: { ...user, profilePhotoUrl } });
  } catch (err) {
    next(err);
  }
});
app.use("/profile", profileRoutes);
app.use("/rides", ridesRoutes);
app.use("/admin", adminRoutes);
app.use("/support", supportRoutes);
app.use("/feedback", feedbackRoutes);

// Central error handler (must be last)
app.use(errorHandler);

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
