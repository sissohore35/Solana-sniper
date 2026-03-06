# ⚡ SOL SNIPER PRO v1.0

> Automated Solana token sniper with stop-loss, take-profit, and live dashboard.
> Monitors new Raydium pools in real-time and executes trades via Jupiter DEX.

---

## 🚀 Features

- **Auto Pool Detection** — scans Raydium for new token launches < 5 mins old
- **Jupiter Swaps** — best-route execution with slippage control
- **Take Profit / Stop Loss** — automated exit logic, protect your capital
- **Live Dashboard** — beautiful real-time web UI (open `dashboard.html`)
- **Configurable** — all settings in `.env`, no coding needed
- **Demo Mode** — test without a wallet connected

---

## 📦 Setup (2 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Copy config
cp .env.example .env

# 3. Edit .env with your wallet key and settings
nano .env

# 4. Run the bot
node bot.js
```

Open `dashboard.html` in your browser to see the live UI.

---

## ⚙️ Configuration

| Setting | Default | Description |
|---|---|---|
| `BUY_AMOUNT_SOL` | 0.01 | SOL per trade |
| `TAKE_PROFIT_PERCENT` | 50 | Exit at +50% |
| `STOP_LOSS_PERCENT` | 20 | Exit at -20% |
| `MAX_OPEN_POSITIONS` | 3 | Max simultaneous trades |
| `SLIPPAGE_BPS` | 300 | 3% slippage tolerance |
| `MIN_LIQUIDITY_SOL` | 5 | Ignore pools below this |

---

## 🔒 Security

- **NEVER** share your `.env` file or private key
- Use a dedicated hot wallet — do not use your main wallet
- Start with small amounts to test

---

## 📡 Recommended RPC

Free public RPC is slow. For faster execution:
- [Helius](https://helius.xyz) — free tier available
- [QuickNode](https://quicknode.com) — fast and reliable

---

## ⚠️ Disclaimer

This software is for educational purposes. Crypto trading involves significant risk.
The developer is not responsible for financial losses. Trade responsibly.

---

## 💬 Support

Telegram: @McMemeAI
