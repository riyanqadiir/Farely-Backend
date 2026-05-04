const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
      maxlength: [120, "Name cannot exceed 120 characters"],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true, // allows multiple nulls for google-only users
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
    },
    countryCode: {
      type: String,
      default: "+92",
      trim: true,
      maxlength: 5,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },
    password: {
      type: String,
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    profilePhoto: {
      type: String, // S3 key or URL
      default: null,
    },
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    district: { type: String, trim: true, default: "" },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    googleId: { type: String, sparse: true, default: null },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    passwordChangedAt: { type: Date, default: null },
    passwordResetRequestedAt: { type: Date, default: null },
    lastPasswordResetAt: { type: Date, default: null },
    /** Updated on app foreground (heartbeat) for operational analytics. */
    lastActiveAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: false, transform: (_, ret) => { delete ret.password; return ret; } },
    toObject: { virtuals: false },
  }
);

// Indexes are created by sparse: true on email, phone, googleId; no need to duplicate with schema.index()

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.model("User", UserSchema);
