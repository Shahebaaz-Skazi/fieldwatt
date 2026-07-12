const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'N7p!Q4vRz9KxL2m#Db',
  database: 'postgres'
});

const run = async () => {
  try {
    await client.connect();
    
    // Check if database exists
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname='fieldwatt'");
    if (res.rows.length === 0) {
      console.log('Database "fieldwatt" does not exist. Creating now...');
      await client.query('CREATE DATABASE fieldwatt');
      console.log('Database "fieldwatt" created successfully.');
    } else {
      console.log('Database "fieldwatt" already exists.');
    }
  } catch (e) {
    console.error('Error creating database:', e);
  } finally {
    await client.end();
  }
};

run();
