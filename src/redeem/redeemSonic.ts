import { erc20Abi, getBalance, getProvider, getTokenBalance, sendAllEth, sendToken, sendEth, approve, signAndSendTransaction, sendAllAvax } from "../lib/evmUtils"
import wallets from "../../tempWalletsSonic.json"
import base58 from "bs58"
import { config, web3Config } from "../config"
import { parseEther, Wallet } from "ethers"
import { Chain } from "../types"

async function main() {
    let chainName: Chain
    chainName = "sonic"
    const evmConfig = web3Config[chainName]
    const provider = getProvider(evmConfig.rpc)
    const redeemWalletAddress = "0xCEfB1791df4008c44349aA6040453B2b5449D23E"
    const fileName = config.logPath + `redeemSonic.log`
    const tokenMintString = "0xB87FC144decab62eCCf7a58B4Cc60c06a9e97076"
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
    console.log(provider);
    
    for (let index = 0; index < wallets.length; index++) {
        const element = wallets[index];
        const wallet = new Wallet(element, provider)
        const balance = await getBalance(wallet.address, provider)
        console.log("balance", wallet.address, balance.toString())
        if (balance > BigInt(63000000000000)) {
            console.log("balance", wallet.address, balance.toString())
            await sendAllEth(provider, wallet, redeemWalletAddress, fileName, index, chainName)
        }
    }
}


main()