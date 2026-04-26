const PaymentMethod = require("../model/PaymentMethod.model");
const User = require("../model/User.model");
const stripeService = require("../services/stripe.service");

function toDto(pm) {
  return {
    id: pm._id,
    label: pm.label,
    brand: pm.brand,
    last4: pm.last4,
    expMonth: pm.expMonth,
    expYear: pm.expYear,
    stripePaymentMethodId: pm.stripePaymentMethodId,
    isDefault: pm.isDefault,
    createdAt: pm.createdAt,
  };
}

async function listPaymentMethods(req, res, next) {
  try {
    const list = await PaymentMethod.find({ userId: req.userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
    return res.json(list.map(toDto));
  } catch (err) {
    next(err);
  }
}

async function addPaymentMethod(req, res, next) {
  try {
    const { label, brand, stripePaymentMethodId } = req.body || {};
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const resolvedPaymentMethodId = await stripeService.resolvePaymentMethod({ brand, stripePaymentMethodId });
    const pm = await stripeService.attachPaymentMethodToCustomer({ user, paymentMethodId: resolvedPaymentMethodId });

    const count = await PaymentMethod.countDocuments({ userId: req.userId });
    const doc = await PaymentMethod.create({
      userId: req.userId,
      label: String(label || "Card").trim(),
      brand: String(pm.brand || brand || "visa").toLowerCase(),
      last4: String(pm.last4 || "0000"),
      expMonth: String(pm.exp_month || "12").padStart(2, "0"),
      expYear: String(pm.exp_year || "2030").slice(-2),
      stripePaymentMethodId: pm.id,
      isDefault: count === 0,
    });

    return res.status(201).json({ success: true, paymentMethod: toDto(doc.toObject()) });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: "Payment method already exists." });
    }
    next(err);
  }
}

async function updatePaymentMethod(req, res, next) {
  try {
    const id = req.params?.id;
    const { label, isDefault } = req.body || {};
    const doc = await PaymentMethod.findOne({ _id: id, userId: req.userId });
    if (!doc) return res.status(404).json({ success: false, message: "Payment method not found." });

    if (typeof label === "string") doc.label = label.trim() || doc.label;
    if (typeof isDefault === "boolean") {
      doc.isDefault = isDefault;
      if (isDefault) {
        await PaymentMethod.updateMany({ userId: req.userId, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
      }
    }
    await doc.save();
    return res.json({ success: true, paymentMethod: toDto(doc.toObject()) });
  } catch (err) {
    next(err);
  }
}

async function removePaymentMethod(req, res, next) {
  try {
    const id = req.params?.id;
    const doc = await PaymentMethod.findOneAndDelete({ _id: id, userId: req.userId });
    if (!doc) return res.status(404).json({ success: false, message: "Payment method not found." });

    if (doc.isDefault) {
      const nextDefault = await PaymentMethod.findOne({ userId: req.userId }).sort({ createdAt: 1 });
      if (nextDefault) {
        nextDefault.isDefault = true;
        await nextDefault.save();
      }
    }
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  removePaymentMethod,
};
