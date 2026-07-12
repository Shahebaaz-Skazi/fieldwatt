# FieldWatt Production Deployment Manual

This manual provides the step-by-step, detailed instructions for deploying the **FieldWatt** application components on a zero-budget cloud stack: **Supabase** (Database + Photo Storage), **Upstash** (Redis Sync Queue broker), **Render.com** (Backend API), and **Vercel** (Admin Web Panel).

---

## 📅 Deployment Architecture Overview

```
                          ┌───────────────────────────┐
                          │     AGENT MOBILE APP      │
                          │   (React Native / Expo)   │
                          └─────┬───────────────┬─────┘
                                │               │
                API Requests    │               │  Binary PUT (Photos)
                (Render URL)    ▼               ▼
                   ┌──────────────────┐   ┌───────────────────────────┐
                   │    BACKEND API   │   │     SUPABASE STORAGE      │
                   │ (Render Node.js) │   │ (Photo Upload Bucket)     │
                   └────────┬─────────┘   └───────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌──────────────────┐        ┌───────────────────┐
    │   SUPABASE DB    │        │   UPSTASH REDIS   │
    │  (PostgreSQL)    │        │ (Sync Queue Broker)│
    └──────────────────┘        └───────────────────┘
```

---

## 🛠️ Step 1: Set Up Supabase (Database + Storage)

Supabase provides the relational database and the media storage bucket for field verification photos.

### 1.1 Create the Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up for a free account.
2. Click **New Project** and select your organization.
3. Configure the project:
   * **Name**: `FieldWatt`
   * **Database Password**: Choose a strong password and save it securely.
   * **Region**: Select a database region closest to your operational area.
4. Click **Create new project** and wait ~2 minutes for provisioning to finish.

### 1.2 Initialize Database Schema
1. In the Supabase Sidebar, click on **SQL Editor** (the `>_` terminal icon).
2. Click **New Query**.
3. Open [backend/migrations/001_init.sql](file:///f:/firewatt/backend/migrations/001_init.sql) in your local code editor, copy the entire SQL script, and paste it into the Supabase SQL editor pane.
4. Click **Run** on the top-right. Verify that all tables (`cycles`, `areas`, `properties`, `assignments`, `readings`, `attendance`, `revisits`) and indices build successfully.

### 1.3 Configure Photo Storage Bucket
1. In the Supabase Sidebar, click on **Storage** (the bucket icon).
2. Click **New Bucket**.
3. Set the name to exactly: **`meter-photos`**
4. Keep the **Public bucket** toggle **Disabled** (we will use backend signed URLs for secure direct-to-cloud uploading).
5. Click **Save**.

### 1.4 Gather Supabase Credentials
Go to your project's **Project Settings** (gear icon) -> **API** in the sidebar, and copy these values:
1. **Project URL**: (e.g. `https://xyzabc.supabase.co`) -> This is your `SUPABASE_URL`.
2. **Service Role JWT Key** (`service_role` / secret): Click **Reveal** and copy it -> This is your `SUPABASE_SERVICE_KEY`.
3. Go to **Database** settings -> **Connection string** -> **URI** tab:
   * Copy the connection string.
   * Replace `[YOUR-PASSWORD]` with the database password you chose in Step 1.1.
   * Toggle the Port to **6543** (Transaction Pooler mode, recommended for Serverless/Render platforms). This is your `DATABASE_URL`.

---

## 📡 Step 2: Set Up Upstash Redis (Sync Broker)

BullMQ requires a Redis server to manage task queues. Upstash offers a persistent Redis instance on a true free tier.

1. Go to [upstash.com](https://upstash.com) and sign up using your GitHub or Google account.
2. Click **Create Database**.
3. Name your instance: `fieldwatt-queue`
4. Select **Redis** type, and choose a region close to your API region.
5. Click **Create**.
6. Under the **Connect to your database** section, copy the **Redis URL** connection string (e.g., `redis://default:password@xyz.upstash.io:6379`). This is your `REDIS_URL`.

---

## ⚙️ Step 3: Deploy the Backend API to Render.com

Render hosts the Node.js Express server. It will automatically detect our `render.yaml` configuration.

### 3.1 Link Repository to Render
1. Commit and push all changes in your repository (including `render.yaml`) to your GitHub account.
2. Go to [render.com](https://render.com) and sign up for a free account.
3. In the dashboard, click **New +** on the top right, and select **Blueprint**.
4. Connect your GitHub account and select your `fieldwatt` repository.

### 3.2 Supply Environment Variables
Render will read the blueprint and prompt you to input values for variables marked as `sync: false`. Paste the values you gathered:
* `DATABASE_URL`: The Supabase transaction pooler connection string (Port 6543, with password included).
* `REDIS_URL`: The Redis connection string from Upstash.
* `SUPABASE_URL`: The Supabase project URL.
* `SUPABASE_SERVICE_KEY`: The Supabase `service_role` secret API key.
* `JWT_SECRET`: Type a long random string (e.g. `e9r8y4h38291h0d9273y4gh2010...`).

### 3.3 Trigger Deploy
1. Click **Approve** / **Deploy**.
2. Render will automatically provision the Node.js container, run `npm install` inside the `backend/` directory, and launch the server.
3. Copy the URL of your deployed web service (e.g. `https://fieldwatt-backend.onrender.com`). This is your **Backend Service URL**.

---

## 🎨 Step 4: Deploy the Admin Web Panel to Vercel

Vercel hosts the React frontend. It will parse `vercel.json` to handle React Router routing.

1. Go to [vercel.com](https://vercel.com) and sign up for a free account.
2. Click **Add New** -> **Project**.
3. Select your GitHub repository.
4. **Configure Project Settings**:
   * **Root Directory**: Select **`admin-web`** (Click Edit, choose `admin-web`, and click Select).
   * **Framework Preset**: Choose **Vite** (Vercel should auto-detect this).
5. Expand **Environment Variables** and add:
   * **Key**: `VITE_API_URL`
   * **Value**: Your **Backend Service URL** from Step 3.3 (e.g., `https://fieldwatt-backend.onrender.com`). *Do not add a trailing slash.*
6. Click **Deploy**.
7. Vercel will build the frontend assets. Once complete, it will provide your dashboard URL (e.g., `https://fieldwatt-admin.vercel.app`).

---

## 📱 Step 5: Update the Agent Mobile App Base URL

Before generating builds for the field agents, we must point the React Native app to the deployed Render server.

1. Open [agent-mobile/src/utils/api.ts](file:///f:/firewatt/agent-mobile/src/utils/api.ts) in your local editor.
2. Edit line 3:
   ```typescript
   // Replace 'http://localhost:3000' with your Render backend URL
   const API_BASE_URL = 'https://fieldwatt-backend.onrender.com';
   ```
3. Commit this change.
4. Run your mobile compilation or start Expo to distribute/simulate:
   ```bash
   cd agent-mobile
   npx expo start --web
   ```
