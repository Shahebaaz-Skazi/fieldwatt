const express = require('express');
const router  = express.Router();
const { z }   = require('zod');
const authMiddleware  = require('../../middleware/auth');
const { requireAgent } = require('../../middleware/roleGuard');
const { getPresignedUploadUrl } = require('../../utils/r2Storage');

const uploadRequestSchema = z.object({
  filename:    z.string().min(1),
  contentType: z.string().startsWith('image/'),
});

// POST /agent/upload-url — Generate a short-lived presigned PUT URL for direct R2 upload
router.post(['/', '/upload-url'], authMiddleware, requireAgent, async (req, res, next) => {
  try {
    const { filename, contentType } = uploadRequestSchema.parse(req.body);
    const agentId = req.user.id;

    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key           = `${agentId}/${Date.now()}_${cleanFilename}`;

    const { uploadUrl, photoUrl } = await getPresignedUploadUrl(key, contentType, 300);

    res.json({
      uploadUrl,
      photoUrl,
      photoId: key,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
