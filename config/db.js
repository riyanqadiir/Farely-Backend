const mongoose = require("mongoose");

const SERVER_SELECTION_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 3000;
const MAX_RETRIES = 5;

function describeMongoError(error) {
    const code = error?.code || error?.cause?.code;
    if (code === "ETIMEOUT" || code === "ETIMEDOUT") {
        return "DNS SRV lookup timed out — your network couldn't reach Atlas. Most common: WiFi changed and the new public IP isn't in Atlas → Network Access, or ISP DNS blocks SRV records.";
    }
    if (code === "EAI_AGAIN" || code === "ENOTFOUND") {
        return "DNS lookup failed — try switching macOS DNS to 8.8.8.8 / 1.1.1.1 (System Settings → Wi-Fi → Details → DNS).";
    }
    if (error?.name === "MongoServerSelectionError") {
        return "Atlas cluster unreachable — check (1) cluster is RESUMED in Atlas dashboard, (2) Network Access allowlist contains your current public IP (or 0.0.0.0/0 for dev), (3) MONGO_URI credentials match a current database user.";
    }
    return error?.message || String(error);
}

const connectToDb = async () => {
    const uri = process.env.MONGO_URI || "";
    if (!uri) {
        console.error("MONGO_URI not set in backend/.env");
        process.exit(1);
    }

    // Fail fast instead of buffering queries for 10s when Atlas is unreachable.
    mongoose.set("bufferCommands", false);
    mongoose.set("bufferTimeoutMS", 4000);

    let attempt = 0;
    while (attempt < MAX_RETRIES) {
        attempt++;
        try {
            await mongoose.connect(uri, {
                serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
            });
            console.log("Database Connected Successfully!");

            mongoose.connection.on("disconnected", () => {
                console.warn("MongoDB disconnected — Mongoose will auto-reconnect.");
            });
            mongoose.connection.on("reconnected", () => {
                console.log("MongoDB reconnected.");
            });
            mongoose.connection.on("error", (err) => {
                console.error("MongoDB connection error:", describeMongoError(err));
            });
            return;
        } catch (error) {
            const reason = describeMongoError(error);
            console.error(
                `Database connection error (attempt ${attempt}/${MAX_RETRIES}):`,
                reason
            );
            if (attempt >= MAX_RETRIES) {
                console.error(
                    "Giving up. Restart the backend after restoring Atlas access (cluster + IP allowlist + DNS)."
                );
                process.exit(1);
            }
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
    }
};

module.exports = connectToDb;
