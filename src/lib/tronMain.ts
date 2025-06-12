import { TronWeb } from "tronweb";
import { config, tronConfig } from "../config";
import { Package } from "../types";
import { getSupabase } from "./authUtil";
import { generateRandomNumber, insertOrUpdatePrivateKeys, printToFile, sleep } from "./utils";
import { approveToken, buyToken, getBalance, getTokenBalance, getTxFee, isTronAddress, sellToken, sendAllTrx, sendTrx, SUN_PER_TRX } from "./tronUtils";
import { SUNSWAP_ROUTER_ADDRESS, TRON_EXAMPLE_PRIVATEKEY } from "./tronConfig";

export const startMonitorAndBotTron = async (boostId: number, tokenMint: string, originalOption: Package, depositWalletPrivateKey: string, referralWalletAddress: string, referralId: number, isRent: boolean, treasuryWallet: string) => {
    const tronWeb = new TronWeb({ fullHost: tronConfig.rpc, solidityNode: tronConfig.rpc, eventServer: tronConfig.rpc, privateKey: TRON_EXAMPLE_PRIVATEKEY })
    const supabase = getSupabase()
    const fileName = config.logPath + `${boostId}.log`
    const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`
    const startTime = new Date().getTime()
    printToFile(fileName, "monitoring started", new Date(startTime).toUTCString())
    const mainWallet = depositWalletPrivateKey
    let currentTime
    while (true) {
        await sleep(10 * 1000)
        const ss = "ss"
        currentTime = new Date().getTime()
        const balance = await getBalance(tronWeb, mainWallet)
        if (BigInt(balance) >= BigInt(tronWeb.toSun(originalOption.totalFund).toString())) {
            //deposited
            printToFile(fileName, "deposit found", boostId)
            const result = await supabase.from("Boosts")
                .update({ payment_status: 1 })
                .eq('id', boostId)
            break
        }

        if (currentTime > startTime + config.MONITOR_SECONDS * 1000) {
            //expired
            printToFile(fileName, "boost expired", boostId)
            const result = await supabase.from("Boosts")
                .update({ payment_status: 2 })
                .eq('id', boostId)
            return
        }
    }

    await sleep(3000)
    const option = {
        ...originalOption,
    }
    printToFile(fileName, "original option", JSON.stringify(originalOption))
    printToFile(fileName, "currnet option", JSON.stringify(option))
    const boostStartTime = new Date().getTime()
    const walletCount = tronConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
    printToFile(fileName, "Bot started", new Date(boostStartTime).toUTCString())
    const balance = await getBalance(tronWeb, mainWallet)
    const minFund = (balance * (100 - tronConfig.referralPercent) / 100 - (walletCount * 2 * 1000_000)) / (walletCount)

    let totalFailCount = 0;
    let totalFee = (0);
    let totalTxCount = 0;
    printToFile(fileName, "wallet count", walletCount)

    const refAmount = Math.floor((balance) * (tronConfig.referralPercent) / (100))
    if (
        isTronAddress(referralWalletAddress, tronWeb) && !isRent
    ) {
        printToFile(fileName, "sending to referral", refAmount)
        await sendTrx(mainWallet, referralWalletAddress, refAmount, tronWeb, fileName)
        printToFile(fileName, "sent to referral", refAmount)
        await supabase.from("Referrals").update({ fund_earned: `${refAmount}` }).eq("id", referralId)
        await sleep(1000)
    }

    printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}xz`)
    printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)

    const mainThreads = Array.from({ length: walletCount }, (v, i) => {
        const mainLogic = async () => {
            const avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)

            const startWallet = (await tronWeb.createAccount()).privateKey;
            const startAddress = tronWeb.address.fromPrivateKey(startWallet) as string

            await sleep(avgBetweenTime / walletCount * i)
            await insertOrUpdatePrivateKeys(boostId, i, startWallet, startWallet)
            printToFile(fileName, `thread ${i} startwallet ${startWallet}xz ${startAddress}`)
            printToFile(fileNameTempWallet, `"${startWallet}",`)
            const txid = await sendTrx(mainWallet, startAddress, minFund, tronWeb, fileName)
            printToFile(fileName, i, "send trx success", txid.txid)
            const txFee = await getTxFee(txid.txid, tronWeb)
            printToFile(fileName, i, "send trx fee", txFee)
            totalFailCount += txid.count || 0
            totalFee += txFee


            const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000


            const ret = await thread(startWallet, tronWeb, tokenMint, i, option, fileName, mainWallet, boostId, new Date().getTime(), finishTime, fileNameTempWallet)

            totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0
            totalFee += ret?.totalFee ? ret.totalFee : 0
            totalTxCount += ret?.txCount ? ret.txCount : 0
        }
        return mainLogic()
    });

    await Promise.all(mainThreads)
    const totalFundRemaining = await getBalance(tronWeb, mainWallet)
    await sendAllTrx(mainWallet, treasuryWallet, tronWeb, fileName, 9999)
    await sleep(1000)
    const endTime = new Date().getTime()
    printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
    printToFile(fileName, "total fail count", totalFailCount)
    printToFile(fileName, "total tx count", totalTxCount)
    printToFile(fileName, "starting trx", option.totalFund)
    printToFile(fileName, "referral trx", refAmount / SUN_PER_TRX)
    printToFile(fileName, "remaining trx", totalFundRemaining / SUN_PER_TRX)
    printToFile(fileName, "used trx", option.totalFund - refAmount / SUN_PER_TRX - totalFundRemaining / SUN_PER_TRX)
    printToFile(fileName, "total transaction fee", (totalFee / SUN_PER_TRX))
    printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
    await supabase.from("Boosts")
        .update({ boost_status: 1 })
        .eq('id', boostId)
}

export const thread = async (startSecretKey: string, tronWeb: TronWeb, tokenMint: string, threadNumber: number, option: Package, fileName: string, tempStoreWallet: string, boostId: number, startTime: number, finishTime: number, fileNameTempWallet: string) => {
    const totalCount = Math.floor((finishTime - startTime) / 60 / 1000 * option.txCountPerMin)
    const walletCount = tronConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
    const avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)

    let eachCount = Math.floor(totalCount / walletCount);
    eachCount = eachCount % 2 == 0 ? eachCount : eachCount + 1;
    let totalFailCount = 0;
    let totalFee = 0;
    const startWallet = startSecretKey
    const tempStoreWalletAddress = tronWeb.address.fromPrivateKey(tempStoreWallet) as string

    while (true) {
        try {
            await sleep(1000)
            const initialTrxAmount = await getBalance(tronWeb, startWallet)
            if (initialTrxAmount == (0)) continue
            if (initialTrxAmount / SUN_PER_TRX < tronConfig.gasFee) {
                printToFile(fileName, threadNumber, "insufficient trx", (initialTrxAmount / SUN_PER_TRX))
                return;
            }
            break
        } catch (error) {
            await sleep(1000)

        }
    }

    let secretKey = startWallet
    //main logic
    for (let index = 0; index < eachCount / 2; index++) {
        const startLoopTime = new Date().getTime()
        const wallet = secretKey
        const walletAddress = tronWeb.address.fromPrivateKey(wallet) as string
        const nextAccount = (await tronWeb.createAccount());
        const nextWallet = nextAccount.privateKey
        const nextAddress = nextAccount.address.base58

        printToFile(fileName, `${threadNumber} next wallet ${nextWallet}wd ${nextAddress}`);
        printToFile(fileNameTempWallet, `"${(nextWallet)}",`)
        await insertOrUpdatePrivateKeys(boostId, threadNumber, wallet, nextWallet)

        let oldTrxAmount = 0
        {
            //buy
            let count = 0
            let balanceCount = 0
            while (true) {
                try {
                    // to prevent not updating token balance
                    await sleep(1000)
                    const tokenAmount = await getTokenBalance(walletAddress, tokenMint, tronWeb)
                    if (tokenAmount > BigInt(0)) {
                        printToFile(fileName, threadNumber, "token balance", walletAddress, tokenAmount)
                        break
                    }

                    const trxAmount = await getBalance(tronWeb, wallet)
                    printToFile(fileName, threadNumber, "trx balance", walletAddress, trxAmount / SUN_PER_TRX)
                    //if get sol balance is not correct, retry
                    if (trxAmount == (0)) continue

                    if (balanceCount > 100) {
                        printToFile(fileName, threadNumber, "insufficient buy trx", trxAmount / SUN_PER_TRX)
                        await sendAllTrx(wallet, tempStoreWalletAddress, tronWeb, fileName, threadNumber)
                        return { totalFailCount, trxAmount, totalFee, txCount: index * 2 + 2 }
                    }

                    if (trxAmount < (tronConfig.gasFee * SUN_PER_TRX) * (2) && trxAmount > (tronConfig.gasFee * SUN_PER_TRX)) {
                        await sleep(1000)
                        balanceCount++
                        continue
                    }

                    if (trxAmount <= (tronConfig.gasFee * SUN_PER_TRX)) {
                        printToFile(fileName, threadNumber, "insufficient buy trx", trxAmount / SUN_PER_TRX)
                        await sendAllTrx(wallet, tempStoreWalletAddress, tronWeb, fileName, threadNumber)
                        return { totalFailCount, trxAmount, totalFee, txCount: index * 2 + 2 }
                    }
                    oldTrxAmount = trxAmount

                    const randomBuyAmount = generateRandomNumber(option.minSwap, option.maxSwap)
                    const minBuyAmount = trxAmount - (tronConfig.gasFee * SUN_PER_TRX) * (2)
                    const buyTrxAmount = Math.floor(randomBuyAmount * SUN_PER_TRX) > minBuyAmount ? minBuyAmount : Math.floor(randomBuyAmount * SUN_PER_TRX)
                    printToFile(fileName, threadNumber, "buy trx amount", buyTrxAmount / SUN_PER_TRX)

                    const txid = await buyToken(tokenMint, buyTrxAmount, wallet, tronWeb, threadNumber, fileName)
                    printToFile(fileName, threadNumber, "buy token success", txid.txid)
                    const txFee = await getTxFee(txid.txid, tronWeb)
                    printToFile(fileName, threadNumber, "buy token fee", txFee)
                    totalFailCount += txid.count || 0
                    totalFee += txFee
                    break
                } catch (error) {

                }
            }


            //approve
            {
                const approveTx = await approveToken(tokenMint, SUNSWAP_ROUTER_ADDRESS, wallet, tronWeb, threadNumber, fileName)
                printToFile(fileName, threadNumber, "approve token success", approveTx.txid);
                const txFee = await getTxFee(approveTx.txid, tronWeb)
                printToFile(fileName, threadNumber, "approve  token fee", txFee)
                totalFailCount += approveTx.count || 0
                totalFee += txFee
            }


            //sell token
            count = 0;
            let tokenBalanceCount = 0
            while (true) {
                try {
                    await sleep(1000)
                    const newTrxAmount = await getBalance(tronWeb, wallet)
                    if (newTrxAmount == oldTrxAmount) {
                        continue
                    }


                    const tokenAmount = await getTokenBalance(walletAddress, tokenMint, tronWeb)
                    printToFile(fileName, threadNumber, "token balance", (tokenAmount.toString()))

                    if (newTrxAmount <= tronConfig.gasFee * SUN_PER_TRX) {
                        printToFile(fileName, threadNumber, "insufficient buy trx", (newTrxAmount))
                        await sendAllTrx(wallet, tempStoreWalletAddress, tronWeb, fileName, threadNumber)
                        return { totalFailCount, newTrxAmount, totalFee, txCount: index * 2 + 2 }
                    }
                    if (tokenBalanceCount > 30) {
                        printToFile(fileName, threadNumber, "tokenBalanceCount exceed")
                        break
                    }
                    if (tokenAmount == BigInt(0)) {
                        tokenBalanceCount++
                        continue
                    }



                    const sellTx = await sellToken(tokenMint, tokenAmount, wallet, tronWeb, threadNumber, fileName)
                    printToFile(fileName, threadNumber, "sell token success", sellTx.txid);
                    const sellTxFee = await getTxFee(sellTx.txid, tronWeb)
                    printToFile(fileName, threadNumber, "sell  token fee", sellTxFee)

                    totalFailCount += sellTx.count
                    totalFee += sellTxFee
                    break

                } catch (error) {
                    await sleep(1000)
                    count++
                    printToFile(fileName, threadNumber, "sell token error2", error)
                }
            }
        }


        //send all trx
        const sendAllTrxTx = await sendAllTrx(wallet, nextAddress, tronWeb, fileName, threadNumber)
        printToFile(fileName, threadNumber, "sent all trx", sendAllTrxTx.txid)
        const sendTrxFee = await getTxFee(sendAllTrxTx.txid, tronWeb)
        printToFile(fileName, threadNumber, "send trx fee", sendTrxFee)
        totalFee += sendTrxFee

        //prepare next round
        secretKey = nextWallet
        const endTime = new Date().getTime()
        const totalTimeElapsed = endTime - startTime;
        const loopTimeEstimated = avgBetweenTime * (index + 1) + generateRandomNumber(0, 20 * 1000) - 10000
        const delayMs = loopTimeEstimated >= totalTimeElapsed ? (loopTimeEstimated - totalTimeElapsed) : 1
        const delay = Math.floor(delayMs)
        printToFile(fileName, threadNumber, index, "round ended in ", endTime - startLoopTime, delayMs)
        if (index != eachCount - 1) {
            await sleep(delay)
        }
        if (startLoopTime > finishTime) {
            break
        }
    }

    //send remaining sol to treasury
    const wallet = secretKey
    const txid = await sendAllTrx(wallet, tempStoreWalletAddress, tronWeb, fileName, threadNumber)
    printToFile(fileName, threadNumber, "sent all trx to treasury", txid?.txid)
    const sendTrxFee = await getTxFee(txid.txid, tronWeb)
    printToFile(fileName, threadNumber, "send trx fee", sendTrxFee)
    totalFee += sendTrxFee
    totalFailCount += txid?.count || 0;

    return { totalFailCount, totalFee, txCount: eachCount * 2 + 2 }
}