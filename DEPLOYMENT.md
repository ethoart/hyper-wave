# VPS Deployment Guide (AWS t3.small Ubuntu + Cloudflare Zero Trust)

This guide provides instructions to deploy your trading application on an AWS t3.small Ubuntu VPS and route it securely using Cloudflare Zero Trust (Cloudflare Tunnels).

## 1. Initial VPS Setup
SSH into your AWS t3.small Ubuntu instance:
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Git, Curl, and build tools
sudo apt install -y git curl build-essential

# Install Node.js (Version 22.x recommended)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Clone and Install Your App
```bash
# Clone the repository (replace with your actual GitHub URL)
git clone https://github.com/yourusername/hyper-wave-trading.git
cd hyper-wave-trading

# Install dependencies
npm install

# Create your .env file
cp .env.example .env

# Edit the .env file with your specific variables
# - BINANCE_API_KEY
# - BINANCE_SECRET_KEY
# - GEMINI_API_KEY
# - MONGO_URI
# - JWT_SECRET
nano .env

# Build the frontend assets
npm run build
```

## 3. Run the App using PM2
We use PM2 to keep the Node.js server running in the background.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the application. We use "tsx" to run the server.ts directly
pm2 start npx --name "hyper-wave" -- tsx server.ts

# Set PM2 to automatically startup on server reboot
pm2 startup
# Follow the command output PM2 gives you, copy-paste it, and run it. Then run:
pm2 save
```

## 4. Setup Cloudflare Zero Trust (Cloudflare Tunnel)
Instead of exposing ports through AWS Security Groups and dealing with Nginx/SSL certificates, use Cloudflare *cloudflared* to create a secure tunnel.

1. Go to your **Cloudflare Dashboard** -> **Zero Trust**.
2. Navigate to **Networks** -> **Tunnels** -> **Create a tunnel**.
3. Name it "HyperWave-VPS" and save.
4. It will provide you with an installation command.
   Select **Debian/Ubuntu** -> **64-bit**. Run the command they give you on your VPS.

It looks something like this:
```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
sudo cloudflared service install eyJh...
```

5. After the tunnel connects, click **Next** in the Cloudflare dashboard.
6. Under **Public Hostnames**, add your domain (e.g., `trade.yourdomain.com`).
7. Set the **Service** to:
   - **Type**: `HTTP`
   - **URL**: `localhost:3000`
8. Save the hostname.

## 5. You're Live!
Your AWS VPS now securely forwards traffic through the Cloudflare Zero Trust tunnel. You do NOT need to open any inbound ports on AWS (port 80/443). The tunnel connects outbound.
Access your app at `https://trade.yourdomain.com`

*Note: For the best performance on a t3.small, ensure that you have configured a swap file if Ubuntu runs low on memory during the `npm run build` process.*
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
