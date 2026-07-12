const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { createClient } = require('@supabase/supabase-js');
const authMiddleware = require('../../middleware/auth');
const { requireAgent } = require('../../middleware/roleGuard');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Initialize Supabase client
const supabase = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

const uploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().startsWith('image/'),
});

// POST /agent/upload-url - Generate a short-lived presigned upload URL
router.post(['/', '/upload-url'], authMiddleware, requireAgent, async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase storage is not configured on this server.' });
    }

    const { filename, contentType } = uploadRequestSchema.parse(req.body);
    const agentId = req.user.id;
    
    // Clean filename to prevent weird characters
    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${agentId}/${Date.now()}_${cleanFilename}`;

    // Generate signed upload URL (valid for 5 minutes / 300 seconds)
    // Supabase bucket is assumed to be 'meter-photos'
    const { data, error } = await supabase.storage
      .from('meter-photos')
      .createSignedUploadUrl(path, { expiresIn: 300 });

    if (error) {
      throw error;
    }

    // Generate the public read URL for the file to be saved in DB
    const { data: publicUrlData } = supabase.storage
      .from('meter-photos')
      .getPublicUrl(path);

    res.json({
      uploadUrl: data.signedUrl,
      photoUrl: publicUrlData.publicUrl,
      photoId: path, // We can use the storage path as photoId
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
