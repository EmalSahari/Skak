import Stripe from 'stripe';
import {
  findByStripeCustomerId,
  getStripeCustomerId,
  setProUntil,
  setStripeCustomerId,
} from './db.js';

const SECRET = process.env.STRIPE_SECRET_KEY;
const PRICE_ID = process.env.STRIPE_PRICE_ID;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3001';

export const billingEnabled = !!(SECRET && PRICE_ID);

const stripe = SECRET ? new Stripe(SECRET) : null;

/** Create a Stripe Checkout session for a $5/mo Pro subscription. */
export async function createCheckoutSession(
  userId: number,
  username: string,
  email: string | null,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!stripe || !PRICE_ID) {
    return { ok: false, error: 'Subscriptions are not set up yet.' };
  }
  try {
    let customerId = await getStripeCustomerId(userId);
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        name: username,
        metadata: { userId: String(userId) },
      });
      customerId = customer.id;
      await setStripeCustomerId(userId, customerId);
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}/?upgrade=success`,
      cancel_url: `${APP_URL}/?upgrade=cancel`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      metadata: { userId: String(userId) },
    });
    return session.url ? { ok: true, url: session.url } : { ok: false, error: 'No checkout URL returned.' };
  } catch (err) {
    console.error('createCheckoutSession failed', err);
    return { ok: false, error: 'Could not start checkout.' };
  }
}

/** Stripe-hosted Customer Portal — for "Manage subscription / cancel". */
export async function createPortalSession(
  userId: number,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!stripe) return { ok: false, error: 'Subscriptions are not set up yet.' };
  const customerId = await getStripeCustomerId(userId);
  if (!customerId) return { ok: false, error: 'No subscription found.' };
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/`,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    console.error('createPortalSession failed', err);
    return { ok: false, error: 'Could not open the billing portal.' };
  }
}

interface WebhookResult {
  ok: boolean;
  error?: string;
}

/** Verify and dispatch a Stripe webhook event. */
export async function handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookResult> {
  if (!stripe || !WEBHOOK_SECRET) return { ok: false, error: 'Webhook not configured.' };
  if (!signature) return { ok: false, error: 'Missing signature.' };

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err);
    return { ok: false, error: 'Invalid signature.' };
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = Number(session.metadata?.userId);
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (userId && customerId) await setStripeCustomerId(userId, customerId);
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
    }
    return { ok: true };
  } catch (err) {
    console.error('Webhook handler error', err);
    return { ok: false, error: 'Handler error.' };
  }
}

/** Apply a Stripe Subscription's state to our user row. */
async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const user = await findByStripeCustomerId(customerId);
  if (!user) return;
  const active = sub.status === 'active' || sub.status === 'trialing';
  // current_period_end exists on active subs; fall back to ended_at when cancelled.
  const endSecs =
    (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.ended_at ?? 0;
  const proUntil = active && endSecs ? new Date(endSecs * 1000) : null;
  await setProUntil(user.id, proUntil);
}
