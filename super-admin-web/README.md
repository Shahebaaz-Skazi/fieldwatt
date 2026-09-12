
# FieldWatt Super Admin

This is the centralized oversight panel for FieldWatt. It queries the `fieldwatt-master` Cloudflare D1 database to get a list of active vendors, and then securely queries each vendor's individual D1 database to fetch aggregated usage statistics in real-time.

## Local Development
1. Start the API in `../super-admin-backend` (`node index.js`). It runs on port 4000.
2. Run `npm run dev` in this directory to start the Vite frontend.

