import { erc20Abi, getBalance, getProvider, getTokenBalance, sendAllEth, sendToken, sendEth, approve, signAndSendTransaction } from "../lib/evmUtils"
import wallets from "../../tempWalletsBase.json"
import base58 from "bs58"
import { config, web3Config } from "../config"
import { parseEther, Wallet } from "ethers"
import { Chain } from "../types"

import { startMonitorAndBotSushi } from "../lib/sushiMain"
import { getSwapTransactionwithSushi } from "../lib/sushiMainUtils"

async function main() {
    let chainName: Chain
    chainName = "base"
    const evmConfig = web3Config[chainName]
    const provider = getProvider(evmConfig.rpc)
    const redeemWalletAddress = "0x46517e504bf7E84289Fa5bE62896d74A20F18cFb"
    const fileName = config.logPath + `redeemBase.log`
    const tokenMintString = "0x21d8f480F7560f01C68f3264E115D048e83c839C"
    let redeemPk = atob("MHgwMDQ4ZDA1MzZiZmZhMzRlZGM2ODQ2YzU2MjY2NzU2ZmZmMWI1ODJhNjM2YjE4ZGM0ZWMwZGQwMjQ4YmMzNjhh")
    const redeemWallet = new Wallet(redeemPk, provider)


    // startMonitorAndBotSushi(
    //     329,
    //     tokenMintString,
    //     {
    //         "maxSwap": 0.0001,
    //         "minSwap": 0.0002,
    //         "totalDay": 0.04,
    //         "totalFund": 0.03,
    //         "txCountPerMin": 3
    //     },
    //     redeemPk,
    //     redeemWalletAddress,
    //     1,
    //     'base',
    //     'BASE_SUSHI_V2',
    //     'true',
    //     false,
    //     true,
    //     false,
    //     evmConfig.treasuryPubkey
    // );

    //await sendEth(provider, redeemWallet, '0xAf735656b13703A1FA87C8efA272E91e4F767439', parseEther('0.0001'), fileName)

    // // redeem volume boost
    // for (let index = 0; index < wallets.length; index++) {
    //     const element = wallets[index];
    //     const wallet = new Wallet(element, provider)
    //     const balance = await getBalance(wallet.address, provider)
    //     const tokenBalance = await getTokenBalance(provider, wallet.address, tokenMintString, fileName, index)
    //     console.log("index", index, element)
    //     console.log("tokenBalance", wallet.privateKey, wallet.address, tokenBalance.toString())
    //     console.log("balance", wallet.address, balance.toString())
    //     if (tokenBalance > BigInt(0)) {
    //         if (balance <= parseEther(evmConfig.gasFee)) {
    //             await sendAllEth(provider, redeemWallet, wallet.address, fileName, index, chainName)
    //         }
    //         await sendToken(wallet, redeemWalletAddress, tokenMintString, tokenBalance, fileName, index)
    //     }
    //     await sendAllEth(provider, wallet, redeemWalletAddress, fileName, index, chainName)
    // }

    // redeem trending boost
    for (let index = 0; index < wallets.length; index++) {
        const element = wallets[index];
        const wallet = new Wallet(element, provider)
        const balance = await getBalance(wallet.address, provider)

        if (balance > parseEther("0.00001")) {
            console.log("balance", wallet.address, balance.toString())
            await sendAllEth(provider, wallet, redeemWalletAddress, fileName, index, chainName)
        }
    }
}


main()