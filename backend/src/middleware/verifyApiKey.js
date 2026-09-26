const ApiKey = require('../models/ApiKey');

/**
 * Middleware to authenticate external API calls via X-ZeroGrid-API-Key header.
 * Allows open access for GET public endpoints if option optional = true.
 */
function verifyApiKey(options = { optional: true }) {
  return async (req, res, next) => {
    try {
      const apiKeyHeader = req.headers['x-zerogrid-api-key'] || req.headers['x-api-key'] || req.query.apiKey;

      if (!apiKeyHeader) {
        if (options.optional) {
          req.apiKeyData = null;
          return next();
        }
        return res.status(401).json({
          status: 'error',
          message: 'Missing X-ZeroGrid-API-Key header. Please provide a valid developer API Key.'
        });
      }

      const apiKeyDoc = await ApiKey.findOne({ key: apiKeyHeader, isActive: true });

      if (!apiKeyDoc) {
        return res.status(403).json({
          status: 'error',
          message: 'Invalid or deactivated API key.'
        });
      }

      // Update last used timestamp asynchronously
      apiKeyDoc.lastUsedAt = new Date();
      apiKeyDoc.save().catch(() => {});

      req.apiKeyData = apiKeyDoc;
      next();
    } catch (error) {
      console.error('[API Key Middleware] Error:', error);
      return res.status(500).json({ status: 'error', message: 'Internal API Key verification error.' });
    }
  };
}

module.exports = verifyApiKey;
