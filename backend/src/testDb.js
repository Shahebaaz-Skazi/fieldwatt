const { Client } = require('pg');

const testPasswords = ['N7p!Q4vRz9KxL2m#Db', 'postgres', 'password'];
const dbName = 'fieldwatt';

const runTest = async () => {
  for (const pw of testPasswords) {
    console.log(`Trying password: "${pw}"...`);
    const client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: pw,
      database: 'postgres' // test default db first
    });

    try {
      await client.connect();
      console.log(`Success! Password is: "${pw}"`);
      await client.end();
      process.exit(0);
    } catch (e) {
      console.log(`Failed with password: "${pw}":`, e.message);
    }
  }
  console.log('Could not connect with any common password.');
  process.exit(1);
};

runTest();
