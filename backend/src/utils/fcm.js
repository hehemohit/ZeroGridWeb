/**
 * FCM Push Notification Utility — ZeroGrid Backend
 *
 * Wraps Firebase Admin SDK for sending FCM push messages.
 * Initialized with graceful degradation so the server boots cleanly
 * even if Firebase credentials are not yet configured.
 *
 * FCM is used ONLY for push delivery — not for auth or database.
 *
 * Environment Variables:
 *   FIREBASE_SERVICE_ACCOUNT_BASE64 — Base64-encoded Firebase Admin SDK service account JSON
 *   FCM_SERVER_KEY                  — Legacy fallback for service account JSON (raw or base64)
 */

let admin = null;
let fcmAvailable = false;

function initFirebaseAdmin() {
  if (admin && admin.apps.length > 0) return;

  const encodedKey = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FCM_SERVER_KEY;

  if (!encodedKey) {
    console.warn(
      '[FCM] WARNING: FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Push notifications will be disabled. ' +
        'Set FIREBASE_SERVICE_ACCOUNT_BASE64 (base64-encoded service account JSON) to enable.'
    );
    return;
  }

  try {
    const firebaseAdmin = require('firebase-admin');

    let serviceAccount;
    try {
      // Decode base64 UTF-8 string
      const decoded = Buffer.from(encodedKey, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decoded);
    } catch {
      // Fallback in case raw JSON string was passed directly
      serviceAccount = JSON.parse(encodedKey);
    }

    if (!firebaseAdmin.apps.length) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount)
      });
    }

    admin = firebaseAdmin;
    fcmAvailable = true;
    console.log('[FCM] Firebase Admin SDK initialized successfully');
  } catch (err) {
    console.error('[FCM] Failed to initialize Firebase Admin SDK:', err.message);
  }
}

/**
 * Sends high-priority SOS emergency push notification to an emergency contact device.
 *
 * @param {Object} params
 * @param {string} params.fcmToken   - Target device FCM registration token
 * @param {string} params.senderName - Display name of the user who triggered the SOS
 * @param {string} params.category   - Emergency category (e.g., MEDICAL, DISASTER)
 * @param {string} [params.message]  - Optional message/notes from the user
 * @param {string} params.sosId      - Mongo ID of the created SosEvent
 * @param {number|string} params.lat - Latitude coordinate
 * @param {number|string} params.lng - Longitude coordinate
 * @returns {Promise<{success?: boolean, skipped?: boolean, result?: any, error?: string, reason?: string}>}
 */
async function sendSosPush({ fcmToken, senderName, category, message, sosId, lat, lng }) {
  if (!fcmToken) return { skipped: true, reason: 'no fcmToken' };

  if (!admin || !admin.apps.length) {
    initFirebaseAdmin();
  }

  if (!admin || !admin.apps.length) {
    return { skipped: true, reason: 'firebase not initialized' };
  }

  try {
    const result = await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: `SOS Alert - ${category}`,
        body: `${senderName || 'Someone'} has triggered an emergency SOS. Please check on them immediately.`,
      },
      data: {
        sosId: String(sosId),
        category: String(category),
        lat: String(lat),
        lng: String(lng),
        senderName: String(senderName || 'Emergency Contact'),
        message: String(message || ''),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'sos_alerts'
        },
      },
    });
    return { success: true, result };
  } catch (err) {
    // Log and continue — a failed push to one contact must never fail the whole SOS creation response
    console.error(`[FCM] Push failed for token ${fcmToken?.slice(0, 10)}...:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sends a single generic FCM push notification to a device.
 */
async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!admin || !admin.apps.length) {
    initFirebaseAdmin();
  }

  if (!admin || !admin.apps.length || !fcmToken) {
    return false;
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'sos_alerts'
      }
    }
  };

  try {
    const response = await admin.messaging().send(message);
    return true;
  } catch (err) {
    console.error(`[FCM] Failed to send push to token: ${err.message}`);
    return false;
  }
}

/**
 * Sends FCM push notifications to multiple tokens concurrently.
 */
async function sendPushToMany(fcmTokens, title, body, data = {}) {
  if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) return;
  const validTokens = fcmTokens.filter(Boolean);
  if (validTokens.length === 0) return;

  const results = await Promise.allSettled(
    validTokens.map((token) => sendPushNotification(token, title, body, data))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
  console.log(`[FCM] Batch push complete: ${succeeded}/${validTokens.length} delivered`);
}

// Initial bootstrap attempt
initFirebaseAdmin();

module.exports = {
  sendSosPush,
  sendPushNotification,
  sendPushToMany
};
