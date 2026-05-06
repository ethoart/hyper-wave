# A-Z Hosting & Deployment Guide

This guide covers everything you need to know to take this system from development to a live, production-ready environment.

Since this application has both a frontend (React/Vite) and a backend (Express.js), plus a smart contract (Base network), you will need a hosting provider that supports Node.js applications (such as Render, Heroku, or a VPS like DigitalOcean).

---

## 1. Prerequisites Checklist

Before you deploy, you need to have the following accounts and resources ready:

1.  **MongoDB Database**: A database to store users, analyses, and settings.
    *   *Recommendation*: Use **MongoDB Atlas** (Cloud). It has a free tier. Register and get your connection string (`MONGO_URI`).
2.  **Binance API Keys**: To enable the Super Admin to place trades.
    *   Create an account on Binance, go to API Management, and generate an API key and Secret key. Enable "Spot & Margin Trading" and "Futures Trading".
3.  **Google Gemini API Key**: For the AI Elliott Wave analysis feature.
    *   Get it from [Google AI Studio](https://aistudio.google.com/app/apikey).
4.  **Smart Contract (Base Network)**: If you want the PRO subscription feature to work on the blockchain.
    *   Deploy the `contracts/HyperWaveSubscription.sol` using Remix IDE or Hardhat to the Base network.

---

## 2. Environment Variables

You must configure these environment variables in your hosting provider's dashboard (often called "Environment Secrets" or "Config Vars"). Do **not** commit them to your code.

```env
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/hyperwave?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_make_it_long
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_SECRET_KEY=your_binance_secret_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Frontend Variables (must start with VITE_)
VITE_PRO_CONTRACT_ADDRESS=your_deployed_smart_contract_address
VITE_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 # Base USDC address
```

---

## 3. Deploying the Smart Contract

To make the "Buy PRO" button work in production:

1. Go to [Remix IDE](https://remix.ethereum.org/).
2. Create a new file `HyperWaveSubscription.sol` and paste the code from `/contracts/HyperWaveSubscription.sol`.
3. Compile the contract.
4. Go to the "Deploy & Run Transactions" tab.
5. Set "Environment" to "Injected Provider - MetaMask".
6. Ensure MetaMask is connected to the **Base Mainnet** (or Base Sepolia for testing).
7. Deploy the contract by providing two arguments to the constructor: 
   * `_acceptedToken`: The Base USDC contract address (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
   * `initialOwner`: Your personal wallet address.
8. Copy the deployed contract address and set it as your `VITE_PRO_CONTRACT_ADDRESS`.

---

## 4. Hosting Solutions

### Option A: Render.com (Recommended & Easiest)

Render natively supports hosting both the Express server and the Vite React app simultaneously.

1.  Push your code to a private GitHub repository.
2.  Go to [Render](https://render.com) and sign up.
3.  Click **New +** and select **Web Service**.
4.  Connect your GitHub repository.
5.  Configure the service:
    *   **Name**: `hyperwave-platform`
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install && npm run build`
    *   **Start Command**: `npm start`
6.  Scroll down to **Environment Variables** and add all the variables from the checklist above.
7.  Click **Create Web Service**. Render will build and deploy your app. It will give you a public URL (e.g., `hyperwave.onrender.com`).

### Option B: DigitalOcean/Hetzner/AWS (VPS) using Docker & PM2

If you prefer full control over a Linux server, you can host both the app and the MongoDB database on the same server.

1. Server Setup & MongoDB Installation (Ubuntu/Debian):
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm git

   # Install MongoDB (Ubuntu 22.04 example)
   sudo apt-get install gnupg curl
   curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
      sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg \
      --dearmor
   echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
   sudo apt-get update
   sudo apt-get install -y mongodb-org

   # Start MongoDB
   sudo systemctl start mongod
   sudo systemctl enable mongod
   
   # Install PM2
   sudo npm install -g pm2
   ```

2. Clone & Build:
   ```bash
   git clone <your-repo-url>
   cd hyperwave
   npm install
   npm run build
   ```

3. Setup Environment:
   * Create a `.env` file in the root folder and add your environment variables.
   * **Crucial for Local MongoDB**: Set your `MONGO_URI` to point to the local instance:
     `MONGO_URI=mongodb://127.0.0.1:27017/hyperwave`

4. Start the Application:
   ```bash
   # We use tsx to run the server.ts file, or compile it to node
   npm i -g tsx
   pm2 start "npm start" --name "hyperwave"
   pm2 save
   pm2 startup
   ```

5. Reverse Proxy (Nginx):
   * Install Nginx and proxy traffic from port `80/443` to `http://localhost:3000`.

---

## 5. Security Checklist

* [ ] Ensure `NODE_ENV` is set to `production`. This ensures Vite serves statically compiled HTML/JS files rather than running the dev middleware.
* [ ] Pick a strong, random password for `JWT_SECRET`.
* [ ] Verify that your Binance API keys have IP restrictions added or have "Withdrawals" **disabled** to limit risks.
* [ ] To make yourself the first "Super Admin", register a brand new account on your live site. Then, connect directly to your MongoDB Atlas dashboard, edit your user document, and change the `role` field from `"user"` to `"admin"`. Once done, you can manage all other users from the app's UI.

## Troubleshooting

- **White Screen on Load**: Make sure you ran `npm run build` and that `NODE_ENV=production` is set so the server serves the `/dist` output folder.
- **WebSocket Errors**: On a VPS, make sure your Nginx proxy supports WebSocket upgrades. (Render supports this out of the box).
- **MetaMask "Cannot Connect"**: Ensure the user adding Funds is actually on the Base Network inside their MetaMask wallet, and that the `VITE_` variables were set before the build phase.
