function notFound(req, res) {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
}

/**
 * Central error handler.
 *
 * body-parser raises an error with type 'entity.too.large' (status 413) when
 * the payload exceeds the configured limit. Without explicit handling it can
 * be swallowed into a generic 500, so we map it here.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    return res.status(413).json({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body', code: 'BAD_JSON' });
  }
  if (err.code === 'CORS_REJECTED') {
    return res.status(403).json({ error: err.message, code: 'CORS_REJECTED' });
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message, code: 'BAD_REQUEST' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
}

module.exports = { notFound, errorHandler };
