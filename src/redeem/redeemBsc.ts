import { getBalance, getProvider, getTokenBalance, sendAllEth, sendToken } from "../lib/evmUtils"
import wallets from "../../tempWalletsBsc.json"
import base58 from "bs58"
import { config, web3Config } from "../config"
import { parseEther, parseUnits, Wallet } from "ethers"
import { Chain } from "../types"


async function main() {
    let chainName: Chain
    chainName = "bsc"
    const evmConfig = web3Config[chainName]

    console.log(evmConfig.rpc);
    const provider = getProvider(evmConfig.rpc);
    const gasLimit = await provider.estimateGas({});
    console.log(gasLimit);
    const redeemWallet = "0xCEfB1791df4008c44349aA6040453B2b5449D23E"
    const fileName = config.logPath + `redeemBsc.log`
    const tokenMintString = "0xb881917e91a07F848eF5F9827204BD4F0a411165";
    const version = "v3"
    let prevPk = atob("MHgwMDQ4ZDA1MzZiZmZhMzRlZGM2ODQ2YzU2MjY2NzU2ZmZmMWI1ODJhNjM2YjE4ZGM0ZWMwZGQwMjQ4YmMzNjhh")

    for (let index = 0; index < wallets.length; index++) {
        const element = wallets[index];
        const wallet = new Wallet(element, provider)
        console.log("index", index, element);
        const balance = await getBalance(wallet.address, provider)
        console.log("balance", balance)
        const tokenBalance = await getTokenBalance(provider, wallet.address, tokenMintString, fileName, index, version);
        console.log("tokenBalance", tokenBalance)
        if (tokenBalance > BigInt(0)) {
            const prevWallet = new Wallet(prevPk, provider)
            prevPk = element
            console.log("tokenBalance", wallet.privateKey, wallet.address, tokenBalance.toString())
            await sendAllEth(provider, prevWallet, wallet.address, fileName, index, chainName)
            await sendToken(wallet, redeemWallet, tokenMintString, tokenBalance, fileName, index)
        } else {
            console.log(wallet.address, tokenBalance)
        }

        if ((balance > parseUnits("0.00001", 18) && chainName.length == 4) || (balance > BigInt("0") && chainName.length == 3)) {
            console.log("balance", wallet.address, balance.toString())
            if (prevPk != element) {
                const prevWallet = new Wallet(prevPk, provider)
                prevPk = element
                await sendAllEth(provider, prevWallet, wallet.address, fileName, index, chainName)
            }
            console.log("send all eth", index)
        }
    }
    const prevWallet = new Wallet(prevPk, provider)
    await sendAllEth(provider, prevWallet, redeemWallet, fileName, 0, chainName)
}


main()