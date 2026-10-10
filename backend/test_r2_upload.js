require('dotenv').config();
const { getPresignedUploadUrl } = require('./src/utils/r2Storage');

async function testUpload() {
  try {
    const { uploadUrl, photoUrl } = await getPresignedUploadUrl('test-photo.jpg', 'image/jpeg', 300);
    console.log("Upload URL generated:", uploadUrl);
    
    // Test actual upload to R2
    const fetch = require('node-fetch');
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg'
      },
      body: Buffer.from('fake image data')
    });
    
    console.log("Upload response status:", response.status);
    console.log("Upload response text:", await response.text());
  } catch (error) {
    console.error("Test failed:", error);
  }
}
testUpload();
