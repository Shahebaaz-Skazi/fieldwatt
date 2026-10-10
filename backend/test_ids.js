const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET || 'secret');

async function check() {
  try {
    const res = await axios.get('http://localhost:3000/admin/assignments/search-properties-ids', {
      headers: { Authorization: `Bearer ${token}` },
      params: { mru: 'UDH004_O', year: 2026, month: 9, societies: 'MAHINDRA ANTHEIA' }
    });
    console.log("IDs returned:", res.data.ids.length);
  } catch (e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
check();
