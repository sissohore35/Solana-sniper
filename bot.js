/**
 * ╔══════════════════════════════════════════════════════╗
 * ║          SOLANA TOKEN SNIPER BOT v1.0               ║
 * ║         Built for Raydium & Jupiter DEXes           ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * HOW TO RUN:
 *   1. npm install
 *   2. Copy .env.example to .env and fill in your wallet
 *   3. node bot.js
 */

require("dotenv").config();
const {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
} = require("@solana/web3.js");
const fetch = require("node-fetch");
const bs58 = require("bs58");
const fs = require("fs");

// ─── CONFIG ──────────────────────────────────────────────
const CONFIG = {
  RPC_URL: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || "",
  BUY_AMOUNT_SOL: parseFloat(process.env.BUY_AMOUNT_SOL || "0.01"),
  TAKE_PROFIT_PERCENT: parseFloat(process.env.TAKE_PROFIT_PERCENT || "50"),
  STOP_LOSS_PERCENT: parseFloat(process.env.STOP_LOSS_PERCENT || "20"),
  SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || "300"),
  MAX_OPEN_POSITIONS: parseInt(process.env.MAX_OPEN_POSITIONS || "3"),
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || "3000"),
  MIN_LIQUIDITY_SOL: parseFloat(process.env.MIN_LIQUIDITY_SOL || "5"),
  LOG_FILE: "sniper.log",
};

// ─── STATE ────────────────────────────────────────────────
let positions = {}; // { mintAddress: { buyPrice, amount, timestamp } }
let stats = { wins: 0, losses: 0, totalPnlSol: 0, trades: 0 };
let isRunning = false;
let connection;
let wallet;

// ─── LOGGER ──────────────────────────────────────────────
function log(msg, level = "INFO") {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(CONFIG.LOG_FILE, line + "\n");

  // Emit to dashboard via stdout JSON (dashboard reads this)
  process.stdout.write(
    JSON.stringify({ type: "log", level, msg, timestamp }) + "\n"
  );
}

function emitStats() {
  process.stdout.write(
    JSON.stringify({
      type: "stats",
      stats,
      positions: Object.keys(positions).length,
      timestamp: new Date().toISOString(),
    }) + "\n"
  );
}

// ─── WALLET ──────────────────────────────────────────────
function loadWallet() {
  if (!CONFIG.WALLET_PRIVATE_KEY) {
    log("No wallet key set. Running in DEMO mode.", "WARN");
    return null;
  }
  try {
    const secretKey = bs58.decode(CONFIG.WALLET_PRIVATE_KEY);
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    log("Invalid wallet key: " + e.message, "ERROR");
    return null;
  }
}

// ─── JUPITER API ─────────────────────────────────────────
const JUPITER_API = "https://quote-api.jup.ag/v6";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS = 1_000_000_000;

async function getQuote(inputMint, outputMint, amountLamports) {
  const url = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${CONFIG.SLIPPAGE_BPS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quote failed: ${res.status}`);
  return res.json();
}

async function getSwapTx(quoteResponse, walletPublicKey) {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: walletPublicKey.toString(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 10000,
    }),
  });
  if (!res.ok) throw new Error(`Swap tx failed: ${res.status}`);
  return res.json();
}

async function executeSwap(swapTransaction) {
  if (!wallet) {
    log("[DEMO] Would execute swap here (no wallet configured)", "DEMO");
    return "DEMO_TX_" + Date.now();
  }
  const txBuf = Buffer.from(swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([wallet]);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// ─── TOKEN DISCOVERY ─────────────────────────────────────
async function fetchNewRaydiumPools() {
  try {
    // Raydium pools API - returns recently created pools
    const res = await fetch(
      "https://api.raydium.io/v2/main/pairs?sort=liquidity&order=asc&limit=20"
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).filter((pool) => {
      const ageSecs = (Date.now() - pool.lpMint?.createTime * 1000) / 1000;
      const liquiditySol = (pool.liquidity || 0) / LAMPORTS;
      return (
        ageSecs < 300 && // Less than 5 minutes old
        liquiditySol >= CONFIG.MIN_LIQUIDITY_SOL &&
        !positions[pool.baseMint] // Not already in position
      );
    });
  } catch (e) {
    log("Pool fetch error: " + e.message, "WARN");
    return [];
  }
}

async function getTokenPrice(mint) {
  try {
    const res = await fetch(
      `https://price.jup.ag/v6/price?ids=${mint}&vsToken=${SOL_MINT}`
    );
    const data = await res.json();
    return data?.data?.[mint]?.price || 0;
  } catch {
    return 0;
  }
}

// ─── TRADING LOGIC ───────────────────────────────────────
async function buy(mint, symbol) {
  if (Object.keys(positions).length >= CONFIG.MAX_OPEN_POSITIONS) {
    log(`Max positions reached. Skipping ${symbol}`, "WARN");
    return;
  }

  log(`🟢 BUY signal: ${symbol} (${mint})`);
  const amountLamports = Math.floor(CONFIG.BUY_AMOUNT_SOL * LAMPORTS);

  try {
    const quote = await getQuote(SOL_MINT, mint, amountLamports);
    const { swapTransaction } = await getSwapTx(quote, wallet?.publicKey || new PublicKey("11111111111111111111111111111111"));
    const sig = await executeSwap(swapTransaction);

    const price = await getTokenPrice(mint);
    positions[mint] = {
      symbol,
      buyPrice: price,
      amount: parseFloat(quote.outAmount),
      timestamp: Date.now(),
      txId: sig,
    };

    log(`✅ Bought ${symbol} @ ${price} SOL | TX: ${sig}`);
    stats.trades++;
    emitStats();
  } catch (e) {
    log(`❌ Buy failed for ${symbol}: ${e.message}`, "ERROR");
  }
}

async function checkPositions() {
  for (const [mint, pos] of Object.entries(positions)) {
    const currentPrice = await getTokenPrice(mint);
    if (!currentPrice || currentPrice === 0) continue;

    const pnlPercent = ((currentPrice - pos.buyPrice) / pos.buyPrice) * 100;
    const pnlSol = (pnlPercent / 100) * CONFIG.BUY_AMOUNT_SOL;

    log(
      `📊 ${pos.symbol} | Entry: ${pos.buyPrice.toFixed(8)} | Now: ${currentPrice.toFixed(8)} | PnL: ${pnlPercent.toFixed(2)}%`
    );

    const shouldTakeProfit = pnlPercent >= CONFIG.TAKE_PROFIT_PERCENT;
    const shouldStopLoss = pnlPercent <= -CONFIG.STOP_LOSS_PERCENT;

    if (shouldTakeProfit || shouldStopLoss) {
      const reason = shouldTakeProfit ? "TAKE PROFIT 🎯" : "STOP LOSS 🛑";
      log(`${reason} triggered for ${pos.symbol} at ${pnlPercent.toFixed(2)}%`);
      await sell(mint, pos, pnlSol, shouldTakeProfit);
    }
  }
}

async function sell(mint, pos, pnlSol, isWin) {
  try {
    const quote = await getQuote(mint, SOL_MINT, pos.amount);
    const { swapTransaction } = await getSwapTx(quote, wallet?.publicKey || new PublicKey("11111111111111111111111111111111"));
    const sig = await executeSwap(swapTransaction);

    delete positions[mint];

    if (isWin) {
      stats.wins++;
      log(`💰 WIN: +${pnlSol.toFixed(4)} SOL from ${pos.symbol}`);
    } else {
      stats.losses++;
      log(`💸 LOSS: ${pnlSol.toFixed(4)} SOL from ${pos.symbol}`);
    }

    stats.totalPnlSol += pnlSol;
    stats.trades++;
    emitStats();
    log(`Sell TX: ${sig}`);
  } catch (e) {
    log(`❌ Sell failed for ${pos.symbol}: ${e.message}`, "ERROR");
  }
}

// ─── MAIN LOOP ───────────────────────────────────────────
async function runBot() {
  log("🚀 Solana Sniper Bot starting...");
  log(`Config: Buy ${CONFIG.BUY_AMOUNT_SOL} SOL | TP: +${CONFIG.TAKE_PROFIT_PERCENT}% | SL: -${CONFIG.STOP_LOSS_PERCENT}%`);

  connection = new Connection(CONFIG.RPC_URL, "confirmed");
  wallet = loadWallet();

  if (wallet) {
    log(`Wallet loaded: ${wallet.publicKey.toString()}`);
  } else {
    log("Running in DEMO MODE - no real trades will execute", "WARN");
  }

  isRunning = true;
  emitStats();

  while (isRunning) {
    try {
      // 1. Check existing positions for TP/SL
      if (Object.keys(positions).length > 0) {
        await checkPositions();
      }

      // 2. Scan for new opportunities
      const newPools = await fetchNewRaydiumPools();
      for (const pool of newPools.slice(0, 2)) {
        if (!positions[pool.baseMint]) {
          await buy(pool.baseMint, pool.name || pool.baseMint.slice(0, 8));
        }
      }

      await sleep(CONFIG.POLL_INTERVAL_MS);
    } catch (e) {
      log("Loop error: " + e.message, "ERROR");
      await sleep(5000);
    }
  }
}

function stopBot() {
  isRunning = false;
  log("🛑 Bot stopped by user");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── ENTRY ───────────────────────────────────────────────
if (require.main === module) {
  runBot().catch(console.error);
  process.on("SIGINT", () => {
    stopBot();
    process.exit(0);
  });
}

module.exports = { runBot, stopBot, stats, positions };
