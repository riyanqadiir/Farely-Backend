const User = require("../model/User.model");
const s3Service = require("../services/s3.service");
const { emitOutboxEvent } = require("../services/outbox.service");
const { respondAccountNoLongerAvailable } = require("../utility/accountGoneResponse");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG and WebP images are allowed."), false);
    }
  },
}).single("photo");

/**
 * GET /profile
 * Returns current user profile (with optional signed photo URL).
 */
async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) {
      return respondAccountNoLongerAvailable(res, req.userId);
    }
    delete user.password;
    let profilePhotoUrl = null;
    if (user.profilePhoto) {
      try {
        profilePhotoUrl = await s3Service.getFileUrl(user.profilePhoto);
      } catch (_) {
        profilePhotoUrl = `${s3Service.baseUrl}/${user.profilePhoto}`;
      }
    }
    res.status(200).json({
      success: true,
      profile: {
        ...user,
        profilePhotoUrl,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /profile
 * Body: fullName?, street?, city?, district? (email/phone are not mutable here)
 */
async function updateProfile(req, res, next) {
  try {
    const allowed = ["fullName", "street", "city", "district"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!user) {
      return respondAccountNoLongerAvailable(res, req.userId);
    }
    delete user.password;
    res.status(200).json({ success: true, profile: user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /profile/photo
 * Multipart: photo (file)
 * Uploads to S3 and saves key in user.profilePhoto.
 */
function uploadPhoto(req, res, next) {
  upload(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, message: "Image must be under 5MB." });
      }
      return res.status(400).json({ success: false, message: err.message || "Upload failed." });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: "No image file provided." });
    }

    try {
      const { userId } = req;
      const { file } = req;
      const key = s3Service.profilePhotoKey(userId, file.mimetype);
      await s3Service.uploadFile(file.buffer, key, file.mimetype);

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { profilePhoto: key } },
        { new: true }
      ).lean();
      if (!user) {
        return respondAccountNoLongerAvailable(res, req.userId);
      }
      delete user.password;
      let profilePhotoUrl = null;
      try {
        profilePhotoUrl = await s3Service.getFileUrl(key);
      } catch (_) {
        profilePhotoUrl = `${s3Service.baseUrl}/${key}`;
      }
      res.status(200).json({
        success: true,
        message: "Profile photo updated.",
        profile: { ...user, profilePhotoUrl },
      });
    } catch (err) {
      next(err);
    }
  });
}

/**
 * POST /profile/heartbeat
 * Lightweight presence ping when the app becomes active (no sensitive body data).
 */
async function heartbeat(req, res, next) {
  try {
    const now = new Date();
    await User.updateOne(
      { _id: req.userId },
      { $set: { lastActiveAt: now } }
    );
    const uid = String(req.userId);
    await emitOutboxEvent("user.heartbeat", uid, {
      userId: uid,
      at: now.toISOString(),
    });
    return res.json({ success: true, lastActiveAt: now.toISOString() });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  uploadPhoto,
  heartbeat,
};
