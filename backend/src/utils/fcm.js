/**
 * FCM Push Notification Utility — ZeroGrid Backend
 *
 * Wraps Firebase Admin SDK for sending FCM push messages.
 * Initialized lazily on first use so the server still boots if
 * FCM_SERVER_KEY is not yet configured (graceful degradation).
 *
 * FCM is used ONLY for push delivery — not for auth or database.
 *
 * Environment Variables Required:
 *   FCM_SERVER_KEY — Base64-encoded Firebase Admin SDK service account JSON
 *                    (from Firebase Console > Project Settings > Service accounts)
 *
 * To encode your service account JSON:
 *   node -e "console.log(Buffer.from(require('fs').readFileSync('./serviceAccount.json')).toString('base64'))"
 */

let admin = null;
let fcmAvailable = false;

function initFirebaseAdmin() {
  if (admin) return; // Already initialized

  const encodedKey = process.env.FCM_SERVER_KEY;

  if (!encodedKey) {
    console.warn(
      '[FCM] WARNING: FCM_SERVER_KEY is not set. Push notifications will be disabled. ' +
        'Set FCM_SERVER_KEY (base64-encoded service account JSON) to enable.'
    );
    return;
  }

  try {
    const firebaseAdmin = require('firebase-admin');

    let serviceAccount;
    try {
      // Support both raw JSON string and base64-encoded JSON
      const decoded = Buffer.from(encodedKey, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decoded);
    } catch {
      // Maybe it's raw JSON directly
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
 * Sends a single FCM push notification to a device.
 *
 * @param {string} fcmToken    - The target device FCM registration token
 * @param {string} title       - Notification title
 * @param {string} body        - Notification body text
 * @param {Object} [data={}]   - Optional key-value data payload
 * @returns {Promise<boolean>} - true if sent, false if skipped/failed
 */
async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!fcmAvailable) {
    initFirebaseAdmin();
  }

  if (!fcmAvailable) {
    console.warn('[FCM] Push notification skipped — FCM not configured');
    return false;
  }

  if (!fcmToken) {
    console.warn('[FCM] Push notification skipped — no FCM token provided');
    return false;
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)]) // FCM data must be string values
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
    console.log(`[FCM] Push sent successfully. MessageId: ${response}`);
    return true;
  } catch (err) {
    console.error(`[FCM] Failed to send push to token ${fcmToken?.slice(0, 10)}...: ${err.message}`);
    return false;
  }
}

/**
 * Sends FCM push notifications to multiple tokens concurrently.
 * Failures on individual tokens are logged but do not throw.
 *
 * @param {string[]} fcmTokens - Array of device tokens
 * @param {string}   title
 * @param {string}   body
 * @param {Object}   [data={}]
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

// Initialize on module load
initFirebaseAdmin();

module.exports = { sendPushNotification, sendPushToMany };
