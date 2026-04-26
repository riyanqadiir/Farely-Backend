const User = require("../model/User.model");
const Wallet = require("../model/Wallet.model");
const Transaction = require("../model/Transaction.model");
const PaymentMethod = require("../model/PaymentMethod.model");
const stripeService = require("../services/stripe.service");

async function ensureWallet(userId) {
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, balance: 0 } },
    { new: true, upsert: true }
  );
  return wallet;
}

async function getBalance(req, res, next) {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    await ensureWallet(req.userId);
    return res.json({ balance: user.walletBalance || 0 });
  } catch (err) {
    next(err);
  }
}

async function getHistory(req, res, next) {
  try {
    const tx = await Transaction.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const mapped = tx.map((t) => ({
      _id: t._id,
      transactionId: t.transactionId,
      type: t.type === "topup" ? "topup" : "ride_payment",
      method: t.method,
      amount: t.amount,
      date: t.createdAt,
      meta: t.meta || {},
      rideId: t.rideId || null,
    }));
    return res.json(mapped);
  } catch (err) {
    next(err);
  }
}

async function topup(req, res, next) {
  try {
    const amount = Number(req.body?.amount);
    const method = req.body?.method || "card";
    const paymentMethodId = req.body?.paymentMethodId || null;
    const transactionId = req.body?.transactionId || `topup_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount." });
    }
    if (!["card"].includes(method)) {
      return res.status(400).json({ success: false, message: "Top-up currently supports card only." });
    }

    // Idempotency: if already exists, return it and do not add balance again.
    const existing = await Transaction.findOne({ transactionId, userId: req.userId }).lean();
    if (existing) {
      const user = await User.findById(req.userId).lean();
      return res.json({ success: true, balance: user?.walletBalance || 0, transaction: existing, duplicated: true });
    }

    await ensureWallet(req.userId);
    const userForCharge = await User.findById(req.userId).lean();
    if (!userForCharge) return res.status(404).json({ success: false, message: "User not found." });

    const selectedMethod =
      (paymentMethodId &&
        (await PaymentMethod.findOne({ _id: paymentMethodId, userId: req.userId, isDefault: { $in: [true, false] } }).lean())) ||
      (await PaymentMethod.findOne({ userId: req.userId, isDefault: true }).lean());

    if (!selectedMethod) {
      return res.status(400).json({ success: false, message: "Add a card before top-up." });
    }

    const charge = await stripeService.chargePaymentMethod({
      user: userForCharge,
      amountPkr: amount,
      paymentMethodId: selectedMethod.stripePaymentMethodId,
      description: "Farely wallet top-up",
      metadata: { userId: String(req.userId), transactionId, flow: "wallet_topup" },
    });

    if (charge.status !== "succeeded") {
      return res.status(402).json({ success: false, message: "Card charge did not succeed." });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $inc: { walletBalance: amount } },
      { new: true }
    ).lean();
    await Wallet.findOneAndUpdate({ userId: req.userId }, { $inc: { balance: amount } }, { new: true });

    const tx = await Transaction.create({
      userId: req.userId,
      transactionId,
      rideId: null,
      type: "topup",
      method,
      amount,
      meta: {
        label: "Wallet top-up",
        status: "succeeded",
        stripePaymentIntentId: charge.id,
        paymentMethodId: String(selectedMethod._id),
      },
    });

    return res.json({ success: true, balance: user?.walletBalance || 0, transaction: tx });
  } catch (err) {
    // Handle duplicate index races gracefully
    if (err?.code === 11000) {
      const existing = await Transaction.findOne({ transactionId: req.body?.transactionId, userId: req.userId }).lean();
      const user = await User.findById(req.userId).lean();
      return res.json({ success: true, balance: user?.walletBalance || 0, transaction: existing, duplicated: true });
    }
    next(err);
  }
}

async function payRide(req, res, next) {
  try {
    const { transactionId, rideId, method, amount, meta, paymentMethodId } = req.body || {};
    const amt = Number(amount);

    if (!transactionId || typeof transactionId !== "string") {
      return res.status(400).json({ success: false, message: "transactionId is required." });
    }
    if (!rideId || typeof rideId !== "string") {
      return res.status(400).json({ success: false, message: "rideId is required." });
    }
    if (!["cash", "card", "wallet"].includes(method)) {
      return res.status(400).json({ success: false, message: "Invalid method." });
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount." });
    }

    // Idempotency: return same transaction if already created.
    const existing = await Transaction.findOne({ transactionId, userId: req.userId }).lean();
    if (existing) {
      const user = await User.findById(req.userId).lean();
      return res.json({ success: true, balance: user?.walletBalance || 0, transaction: existing, duplicated: true });
    }

    await ensureWallet(req.userId);

    // If paying with wallet, subtract from balance (and prevent going negative).
    if (method === "wallet") {
      const tx = await Transaction.create({
        userId: req.userId,
        transactionId,
        rideId,
        type: "ride_payment",
        method,
        amount: amt,
        meta: { ...(meta || {}), status: "succeeded" },
      });
      const user = await User.findOneAndUpdate(
        { _id: req.userId, walletBalance: { $gte: amt } },
        { $inc: { walletBalance: -amt } },
        { new: true }
      ).lean();

      if (!user) {
        // Roll back transaction if insufficient funds.
        await Transaction.deleteOne({ _id: tx._id }).catch(() => null);
        return res.status(400).json({ success: false, message: "Insufficient wallet balance." });
      }

      await Wallet.findOneAndUpdate({ userId: req.userId }, { $inc: { balance: -amt } }, { new: true });
      return res.json({ success: true, balance: user.walletBalance || 0, transaction: tx });
    }

    if (method === "card") {
      const userForCharge = await User.findById(req.userId).lean();
      const selectedMethod =
        (paymentMethodId &&
          (await PaymentMethod.findOne({ _id: paymentMethodId, userId: req.userId, isDefault: { $in: [true, false] } }).lean())) ||
        (await PaymentMethod.findOne({ userId: req.userId, isDefault: true }).lean());
      if (!selectedMethod) {
        return res.status(400).json({ success: false, message: "No saved card found for this payment." });
      }

      const charge = await stripeService.chargePaymentMethod({
        user: userForCharge,
        amountPkr: amt,
        paymentMethodId: selectedMethod.stripePaymentMethodId,
        description: "Farely ride payment",
        metadata: { userId: String(req.userId), transactionId, rideId, flow: "ride_payment" },
      });
      if (charge.status !== "succeeded") {
        return res.status(402).json({ success: false, message: "Card payment failed." });
      }

      const tx = await Transaction.create({
        userId: req.userId,
        transactionId,
        rideId,
        type: "ride_payment",
        method,
        amount: amt,
        meta: {
          ...(meta || {}),
          status: "succeeded",
          stripePaymentIntentId: charge.id,
          paymentMethodId: String(selectedMethod._id),
        },
      });

      const user = await User.findById(req.userId).lean();
      return res.json({ success: true, balance: user?.walletBalance || 0, transaction: tx });
    }

    const tx = await Transaction.create({
      userId: req.userId,
      transactionId,
      rideId,
      type: "ride_payment",
      method,
      amount: amt,
      meta: { ...(meta || {}), status: "pending_cash_collection" },
    });
    const user = await User.findById(req.userId).lean();
    return res.json({ success: true, balance: user?.walletBalance || 0, transaction: tx });
  } catch (err) {
    if (err?.code === 11000) {
      // Either transactionId duplicate or (userId,rideId,type) duplicate
      const tx =
        (await Transaction.findOne({ transactionId: req.body?.transactionId, userId: req.userId }).lean()) ||
        (await Transaction.findOne({ userId: req.userId, rideId: req.body?.rideId, type: "ride_payment" }).lean());
      const user = await User.findById(req.userId).lean();
      return res.json({ success: true, balance: user?.walletBalance || 0, transaction: tx, duplicated: true });
    }
    next(err);
  }
}

module.exports = {
  getBalance,
  getHistory,
  topup,
  payRide,
};

