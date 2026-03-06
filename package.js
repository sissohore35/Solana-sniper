{
  "name": "solana-sniper-bot",
  "version": "1.0.0",
  "description": "Solana Token Sniper Bot - Auto buy/sell new Raydium pools with TP/SL",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "dashboard": "node dashboard.js",
    "demo": "DEMO_MODE=true node bot.js"
  },
  "dependencies": {
    "@solana/web3.js": "^1.91.8",
    "bs58": "^5.0.0",
    "dotenv": "^16.4.5",
    "node-fetch": "^2.7.0"
  },
  "keywords": ["solana", "sniper", "bot", "raydium", "jupiter", "defi"],
  "license": "MIT"
}
