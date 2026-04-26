const Stripe = require("stripe");
const User = require("../model/User.model");

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const TEST_METHOD_BY_BRAND = {
  visa: "pm_card_visa",
  mastercard: "pm_card_mastercard",
};

function isConfigured() {
  return Boolean(stripe);
}

async function getOrCreateStripeCustomer(user) {
  if (!stripe) return null;
  if (user?.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: user?.email || undefined,
    name: user?.fullName || undefined,
    phone: user?.phone || undefined,
    metadata: { userId: String(user?._id || "") },
  });

  await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
  return customer.id;
}

function buildMockResult(prefix) {
  return {
    id: `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    status: "succeeded",
    livemode: false,
  };
}

async function resolvePaymentMethod({ brand, stripePaymentMethodId }) {
  if (stripePaymentMethodId) return stripePaymentMethodId;
  const normalized = String(brand || "").toLowerCase();
  return TEST_METHOD_BY_BRAND[normalized] || TEST_METHOD_BY_BRAND.visa;
}

async function chargePaymentMethod({ user, amountPkr, paymentMethodId, metadata = {}, description = "Farely payment" }) {
  if (!stripe) {
    return buildMockResult("pi_mock");
  }

  const amountInMinor = Math.round(Number(amountPkr) * 100);
  const intent = await stripe.paymentIntents.create({
    amount: amountInMinor,
    currency: "pkr",
    payment_method: paymentMethodId,
    confirm: true,
    description,
    metadata,
    payment_method_types: ["card"],
  });

  return { id: intent.id, status: intent.status, livemode: intent.livemode };
}

async function attachPaymentMethodToCustomer({ user, paymentMethodId }) {
  if (!stripe) {
    return { id: paymentMethodId, brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 };
  }

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  return pm.card
    ? {
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
      }
    : { id: pm.id, brand: "card", last4: "0000", exp_month: 12, exp_year: 2030 };
}

module.exports = {
  isConfigured,
  resolvePaymentMethod,
  chargePaymentMethod,
  attachPaymentMethodToCustomer,
};
