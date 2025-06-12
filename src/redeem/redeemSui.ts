import wallets from "../../tempWalletsSui.json"
import { config, suiConfig } from "../config"
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getClient, getBalance, getTokenBalance, sendSui, sendAllSui, sendToken, getHopSDK, poolExistsSui, getSwapTransaction, signAndSendTransaction, poolExistsSuiWith7K, getSwapTransactionWith7K } from "../lib/suiUtils"
import { startMonitorAndBotSui } from "../lib/suiMain"
import { printToFile, sleep } from "../lib/utils";
import { HopApi, HopApiOptions } from "@hop.ag/sdk";
import { setSuiClient } from "@7kprotocol/sdk-ts";

async function main() {
    const client = await getClient();
    setSuiClient(client);
    const redeemWalletAddress = "0x3513b9452ee7d2f5940d9f93f24f2bc32958b961f164f2307bcca3ed98100e32"
    const fileName = config.logPath + `redeemSui.log`
    const tokenMintString = "0x4cf08813756dfa7519cb480a1a1a3472b5b4ec067592a8bee0f826808d218158::tardi::TARDI"
    let prevPk = atob("c3VpcHJpdmtleTFxcHZheXZldTNyanZ2cTBxZTA4M3I1d3Z1dDIzOHl0c2x0YzZnN3hzOXF1MHpqdTZlZXdmazJwN205bQ==")

    // startMonitorAndBotSui(
    //     265,
    //     tokenMintString,
    //     {
    //         "maxSwap": 0.1,
    //         "minSwap": 0.1,
    //         "totalDay": 1,
    //         "totalFund": 50,
    //         "txCountPerMin": 40
    //     },
    //     prevPk,
    //     redeemWalletAddress,
    //     1,
    //     'cetus',
    //     true,
    //     false,
    //     false,
    //     suiConfig.treasuryPubkey
    // );

    // redeem for volume bot
    // for (let index = 0; index < wallets.length; index++) {
    //     const element = wallets[index];
    //     const wallet = Ed25519Keypair.fromSecretKey(element);
    //     const balance = await getBalance(wallet.toSuiAddress(), client)
    //     const tokenBalance = await getTokenBalance(client, wallet.toSuiAddress(), tokenMintString, fileName, index)
     
    //     if (tokenBalance > BigInt(0)) {
    //         const prevWallet = Ed25519Keypair.fromSecretKey(prevPk);
    //         prevPk = element
    //         console.log("tokenBalance", wallet.getSecretKey(), wallet.toSuiAddress(), tokenBalance.toString())
    //         await sendAllSui(client, prevWallet, wallet.toSuiAddress(), fileName, index)
    //         await sendToken(client, wallet, redeemWalletAddress, tokenMintString, tokenBalance, fileName, index)
    //     } else {
    //         console.log('tokenBalance', wallet.toSuiAddress(), tokenBalance)
    //     }

    //     if (balance > 0) {
    //         console.log("sui balance", wallet.toSuiAddress(), balance)
    //         if (prevPk != element) {
    //             const prevWallet = Ed25519Keypair.fromSecretKey(prevPk);
    //             prevPk = element
    //             await sendAllSui(client, prevWallet, wallet.toSuiAddress(), fileName, index)
    //         }
    //         console.log("send all sui", index)
    //     }
    // }
    // const prevWallet = Ed25519Keypair.fromSecretKey(prevPk);
    // await sendAllSui(client, prevWallet, redeemWalletAddress, fileName, 0)

    // redeem for trending bot
    for (let index = 0; index < wallets.length; index++) {
        const element = wallets[index];
        const wallet = Ed25519Keypair.fromSecretKey(element);
        const balance = await getBalance(wallet.toSuiAddress(), client)
        const tokenBalance = await getTokenBalance(client, wallet.toSuiAddress(), tokenMintString, fileName, index)
        if (tokenBalance > BigInt(0)) {
            console.log("sui token balance", wallet.toSuiAddress(), tokenBalance)
            printToFile(fileName, element)
        }

        if (balance > 0) {
            console.log("sui balance", wallet.toSuiAddress(), balance)
            await sendAllSui(client, wallet, redeemWalletAddress, fileName, index)
        }
    }
}


main()