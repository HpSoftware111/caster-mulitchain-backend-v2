import wallets from "../../tempWalletsTron.json"
import base58 from "bs58"
import { config, tronConfig, web3Config } from "../config"
import { parseEther, Wallet } from "ethers"
import { Chain } from "../types"
import { TronWeb } from "tronweb"
import { getBalance, getTokenBalance, sendAllTrx, sendToken } from "../lib/tronUtils"
import { TRON_EXAMPLE_PRIVATEKEY } from "../lib/tronConfig"

async function main() {
    const tronWeb = new TronWeb({ fullHost: tronConfig.rpc, solidityNode: tronConfig.rpc, eventServer: tronConfig.rpc, privateKey: TRON_EXAMPLE_PRIVATEKEY })
    const redeemWalletAddress = "TVZarBJF8vJSohdKNFRsm4B7YtKdcUcK5h"
    const fileName = config.logPath + `redeemTron.log`
    const tokenMintString = "TWsdQJBvSmTCNKmp7pJ3XCZBfmiNMtdSGb"
    let prevPk = atob("YWQ3ZTAyM2Q4ODBkNDQ1NThjZTdmNjExOWEzMDg1MDJmNzMyZGRhYThmNjc5ZjMwNmJiNjU4YWY4MzcxMjA3Yg==")
    for (let index = 0; index < wallets.length; index++) {
        const element = wallets[index];
        const wallet = element
        const walletAddress = tronWeb.address.fromPrivateKey(wallet) as string
        const balance = await getBalance(tronWeb, wallet)

        const tokenBalance = await getTokenBalance(walletAddress, tokenMintString, tronWeb)
        console.log("index", index, element)
        if (tokenBalance > BigInt(0)) {
            const prevWallet = prevPk
            prevPk = element
            console.log("tokenBalance", wallet, walletAddress, tokenBalance.toString())
            await sendAllTrx(prevWallet, walletAddress,tronWeb,  fileName, index)
            await sendToken(wallet, redeemWalletAddress, tokenMintString, tokenBalance, tronWeb,fileName, index)
        } 

        if (balance > 0 ) {
            console.log("balance", walletAddress, balance)
            if (prevPk != element) {
                const prevWallet = prevPk
                prevPk = element
                await sendAllTrx(prevWallet, walletAddress,tronWeb,  fileName, index)
            }
            console.log("send all eth", index)
        }
    }
    const prevWallet = prevPk
    await sendAllTrx(prevWallet, redeemWalletAddress, tronWeb, fileName, 0)
}


main()