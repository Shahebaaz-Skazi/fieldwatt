require('dotenv').config();
const db = require('./db');
const bcrypt = require('bcryptjs');

const seedData = async () => {
  const client = await db.pool.connect();
  try {
    console.log('Seeding default operations workspace database...');
    await client.query('BEGIN');

    // 1. Seed administrator
    const adminEmail = 'admin@fieldwatt.com';
    const adminPw = 'password123';
    
    const adminCheck = await client.query('SELECT id FROM admins WHERE email = $1', [adminEmail]);
    let adminId;
    
    if (adminCheck.rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(adminPw, salt);
      const insertAdmin = await client.query(
        `INSERT INTO admins (name, email, password_hash) 
         VALUES ('Default Administrator', $1, $2) RETURNING id`,
        [adminEmail, passwordHash]
      );
      adminId = insertAdmin.rows[0].id;
      console.log('✔ Administrator created.');
    } else {
      adminId = adminCheck.rows[0].id;
    }

    // 2. Seed active cycle
    const cycleCheck = await client.query('SELECT id FROM cycles WHERE is_active = true LIMIT 1');
    let cycleId;
    if (cycleCheck.rows.length === 0) {
      const insertCycle = await client.query(
        `INSERT INTO cycles (label, start_date, end_date, is_active) 
         VALUES ('July 2026 Billing', CURRENT_DATE - 5, CURRENT_DATE + 25, true) RETURNING id`
      );
      cycleId = insertCycle.rows[0].id;
      console.log('✔ Active Billing Cycle created.');
    } else {
      cycleId = cycleCheck.rows[0].id;
    }

    // 3. Seed agent
    const agentPhone = '9876543210';
    const agentPw = 'password123';
    
    const agentCheck = await client.query('SELECT id FROM agents WHERE phone = $1', [agentPhone]);
    let agentId;
    
    if (agentCheck.rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(agentPw, salt);
      const insertAgent = await client.query(
        `INSERT INTO agents (name, phone, password_hash, is_active) 
         VALUES ('Default Agent', $1, $2, true) RETURNING id`,
        [agentPhone, passwordHash]
      );
      agentId = insertAgent.rows[0].id;
      console.log('✔ Field Agent created.');
    } else {
      agentId = agentCheck.rows[0].id;
    }

    // 4. Seed areas & properties
    const propCheck = await client.query('SELECT id FROM properties LIMIT 1');
    if (propCheck.rows.length === 0) {
      // Create area
      const insertArea = await client.query(
        `INSERT INTO areas (name) VALUES ('Manhattan North') RETURNING id`
      );
      const areaId = insertArea.rows[0].id;

      // Create properties
      const props = [
        { serial: '1001', name: 'John Doe', address: '123 Main St, Apt 4B', meter: 'MTR-88910', type: 'flat' },
        { serial: '1002', name: 'Jane Smith', address: '456 Broadway Ave', meter: 'MTR-88911', type: 'flat' },
        { serial: '1003', name: 'Acme Corp Office', address: '789 Seventh Ave, Fl 12', meter: 'MTR-88912', type: 'flat' },
        { serial: '1004', name: 'Robert Johnson', address: '102 Park Ave', meter: 'MTR-88913', type: 'bungalow' }
      ];

      for (const p of props) {
        const insertProp = await client.query(
          `INSERT INTO properties (area_id, serial_no, consumer_name, address, meter_no, property_type) 
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [areaId, p.serial, p.name, p.address, p.meter, p.type]
        );
        
        // Assign to our agent
        await client.query(
          `INSERT INTO assignments (agent_id, property_id, cycle_id) 
           VALUES ($1, $2, $3)`,
          [agentId, insertProp.rows[0].id, cycleId]
        );
      }
      console.log('✔ 4 Seed Properties created and assigned to Default Agent.');
    }

    await client.query('COMMIT');
    console.log('--------------------------------------------------');
    console.log('Database Seeding Completed Successfully!');
    console.log('ADMINISTRATOR LOGIN INFO:');
    console.log(`  Email:    ${adminEmail}`);
    console.log(`  Password: ${adminPw}`);
    console.log('AGENT LOGIN INFO:');
    console.log(`  Phone:    ${agentPhone}`);
    console.log(`  Password: ${agentPw}`);
    console.log('--------------------------------------------------');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed operations database:', error);
    process.exit(1);
  } finally {
    client.release();
  }
};

seedData();
