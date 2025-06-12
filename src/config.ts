import "dotenv/config";
import { Chain } from "./types";
import { PublicKey } from "@solana/web3.js";

export const chainNames: Chain[] = [
    "bsc",
    "bsc",
    "base",
    "avax",
    "avax",
    "avax",
    "bera",
    "bera"
]

export const config = {
    PORT: process.env.PORT || 8000,
    logPath: "src/logs/",
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    MONITOR_SECONDS: 30 * 60,
    IS_PUBLIC: process.env.IS_PUBLIC == "1" ? true: false,
    IS_RAYDIUM: process.env.IS_RAYDIUM == "1" ? true: false,
    USE_JITO_API: process.env.USE_JITO_API == "1" ? true: false
}
const bscChainId = 56
const baseChainId = 8453
const avaxChainId = 43114
const beraChainId = 80094

export const web3Config = {
    bsc: {
        eth: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        treasuryPubkey: process.env.EVM_TREASURY_WALLET!,
        rpc: process.env.BSC_RPC_URL || "https://base-rpc.publicnode.com",
        oneInchLink: `https://api.1inch.dev/swap/v6.0/${bscChainId}`,
        // oneInchBroadcastLink: `https://api.1inch.dev/tx-gateway/v1.1/${bscChainId}/broadcast`,
        // oneInchBalanceLink: `https://api.1inch.dev/balance/v1.2/${bscChainId}/balances`,
        oneInchApikey: process.env.ONEINCH_APIKEY || "krRsD3lSV74pjvBj8nHx0bJ4TTEa4eSj",
        baseWalletCount: 3,
        gasFee: "0.002",
        referralPercent: 10,
        chainId: bscChainId,
        swapAmounts: [0.05, 0.15, 0.25, 0.5, 1, 2, 3, 5],
        profitTrendingPercent: 30,
        profitVolumePercent: 20,
        txnPerMinuteTrending: 3,
        sendAllEthGasFee: 0.000001,
        sendAllEthCount: 3
    },
    base: {
        eth: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        treasuryPubkey: process.env.EVM_TREASURY_WALLET!,
        rpc: process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com",
        oneInchLink: `https://api.1inch.dev/swap/v6.0/${baseChainId}`,
        // oneInchBroadcastLink: `https://api.1inch.dev/tx-gateway/v1.1/${baseChainId}/broadcast`,
        // oneInchBalanceLink: `https://api.1inch.dev/balance/v1.2/${baseChainId}/balances`,
        oneInchApikey: process.env.ONEINCH_API_KEY || "9sAyJpdH2KS8WkPBdmjowzDVdG4AEyHB",
        baseWalletCount: 3,
        gasFee: "0.001",
        referralPercent: 10,
        chainId: baseChainId,
        swapAmounts: [0.02, 0.05, 0.08, 0.1, 0.25, 1],
        profitTrendingPercent: 40,
        profitVolumePercent: 20,
        txnPerMinuteTrending: 3,
        sendAllEthGasFee: 0.000001,
        sendAllEthCount: 3
    },
    avax: {
        eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", //AVAX
        treasuryPubkey: process.env.AVAX_TREASURY_WALLET!,
        rpc: process.env.AVAX_RPC_URL || "https://ancient-chaotic-uranium.avalanche-mainnet.quiknode.pro/e96c327b6f595f69c58da5cfeab4bd5aa1d0fbd9/ext/bc/C/rpc/",
        oneInchLink: `https://api.1inch.dev/swap/v6.0/${baseChainId}`,
        oneInchBroadcastLink: `https://api.1inch.dev/tx-gateway/v1.1/${baseChainId}/broadcast`,
        oneInchBalanceLink: `https://api.1inch.dev/balance/v1.2/${baseChainId}/balances`,
        oneInchApikey: process.env.ONEINCH_API_KEY || "9sAyJpdH2KS8WkPBdmjowzDVdG4AEyHB",
        baseWalletCount: 3,
        gasFee: "0.001",
        referralPercent: 0,
        chainId: avaxChainId,
        swapAmounts: [0.02, 0.05, 0.08, 0.1, 0.25, 1],
        profitTrendingPercent: 40,
        profitVolumePercent: 20,
        txnPerMinuteTrending: 3,
        sendAllEthGasFee: 0.000245758347141,
        sendAllEthCount: 3
    },
    bera: {
        eth: "0x6969696969696969696969696969696969696969", // WBERA
        treasuryPubkey: process.env.BERA_TREASURY_WALLET!,
        rpc: process.env.BERA_RPC_URL || "https://rpc.berachain.com/",
        oneInchLink: `https://api.1inch.dev/swap/v6.0/${baseChainId}`,
        oneInchBroadcastLink: `https://api.1inch.dev/tx-gateway/v1.1/${baseChainId}/broadcast`,
        oneInchBalanceLink: `https://api.1inch.dev/balance/v1.2/${baseChainId}/balances`,
        oneInchApikey: process.env.ONEINCH_API_KEY || "9sAyJpdH2KS8WkPBdmjowzDVdG4AEyHB",
        baseWalletCount: 3,
        gasFee: "0.001",
        referralPercent: 10,
        chainId: beraChainId,
        swapAmounts: [5, 10, 25, 50, 100],
        profitTrendingPercent: 40,
        profitVolumePercent: 20,
        txnPerMinuteTrending: 5,
        sendAllEthGasFee: 0.000001,
        sendAllEthCount: 3
    },
    suShiContract: '0x85CD07Ea01423b1E937929B44E4Ad8c40BbB5E71', //v6 https://docs.sushi.com/contracts/route-processor
    busdContract: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
}

export const solanaConfig = {
    wsol: "So11111111111111111111111111111111111111112",
    treasuryPubkey: process.env.SOL_TREASURY_WALLET!,
    rpc: process.env.SOL_RPC_URL || "https://api.mainnet-beta.solana.com",
    jupiterLink: process.env.JUPITER_LINK || "https://quote-api.jup.ag/v6",
    jupiterPublicLink: "https://quote-api.jup.ag/v6",
    jitoLink: process.env.JITO_URL || "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
    jitoTipFloorLink: "https://bundles.jito.wtf/api/v1/bundles/tip_floor",
    baseWalletCount: 3,
    gasFee: 0.001,
    normalFeeRetryCount: 1,
    gasFeeSendSolNormal: 5025,
    gasFeeSendSolHigh: 5250,
    maxLamportsNormal: 50000,
    maxLamportsHigh: 500000,
    maxRetries: 20,
    logPath: "src/logs/",
    referralPercent: 10,
    profitTrendingPercent: 10,
    profitVolumePercent: 20,
    profitVolumePercent20: 10,
    profitVolumePercent40: 8,
    profitVolumePercent21Pacakage: 30,
    profitHolderPercent: 5,
    adminCustomerIds: [26],
    swapSolAmounts: [0.5, 1, 1.5, 2, 10],
    jitoTip: 0.00005,
    txnPerMinute: 15,
    txnPerMinuteTrending: 10,
    txnPerMinuteJito: 10,
    minSwapAmount: 0.1,
    signerTxnFee: 0.001,
    swapLoopCount: 5,
    jupiterFeeVolme: 5000,
    jupiterFeeTrending: 1000,
    PUMPFUN_PROGRAM_ID: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    BOANDING_CURVE_ACC_RETRY_AMOUNT: 5,
    BOANDING_CURVE_ACC_RETRY_DELAY: 50,
    pumpFunBumpAmount: 0.011
}

export const tronConfig = {
    treasuryPubkey: process.env.TRON_TREASURY_WALLET!,
    rpc: process.env.TRON_RPC_URL || "https://api.trongrid.io/",
    baseWalletCount: 3,
    referralPercent: 10,
    gasFee: 50
}

export const suiConfig = {
    wsui: "0x2::sui::SUI",
    treasuryPubkey: process.env.SUI_TREASURY_WALLET!,
    rpc: process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443",
    hopApikey: process.env.HOP_API_KEY || "",
    baseWalletCount: 3,
    referralPercent: 10,
    profitTrendingPercent: 40,
    profitVolumePercent: 20,
    profitHolderPercent: 40,
    gasFee: 0.002,
    swapFee: 0.05,
    txnPerMinuteTrending: 5,
    swapSuiAmounts: [5, 10, 25, 50, 100],
    partnerAddress: "0x184b8abc14b3bfbca92e0d14c0d0a08ae526f7fc6d45cb936d1369fabe3aa7f6"
}