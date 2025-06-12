import { config, suiConfig } from "../config"
import { Package, TempWallets } from "../types"
import { getSupabase } from "./authUtil"
import { generateRandomNumber, insertOrUpdatePrivateKeys, printToFile, sleep, getRandomAmountForJito } from "./utils"
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getClient, getBalance, getTokenBalance, sendSui, sendAllSui, signAndSendTransaction, getSwapTransactionWith7K, exchangeSuiBalance, sendSuiDivideWallt } from "../lib/suiUtils"
import { setSuiClient, } from "@7kprotocol/sdk-ts";
import { MIST_PER_SUI } from '@mysten/sui/utils';

const main = async () => {
    const client = await getClient();
    setSuiClient(client);
}

export const startMonitorAndBotSui = async (botName: string, boostId: number, tokenMint: string, originalOption: Package, depositWalletPrivateKey: string, referralWallet: string, referralId: number, dexParam: string, isTrending: boolean, isCustom: boolean, buyOnly: boolean, isHolders: boolean, isRent: boolean, treasuryWallet: string) => {
    const client = await getClient();
    const supabase = getSupabase()
    const fileName = config.logPath + `${boostId}.log`
    const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`

    let boost: any = await supabase
        .from("Boosts")
        .select("*")
        .eq("id", boostId)
        .single();


    const startTime = new Date().getTime()
    printToFile(fileName, "monitoring started", new Date(startTime).toUTCString())
    const mainWallet = Ed25519Keypair.fromSecretKey(depositWalletPrivateKey);
    let currentTime;

    // calculate deposit funds
    let totalFund = originalOption.totalFund;
    if (isCustom) {
        totalFund = boost.data.swap_amount * (suiConfig.baseWalletCount * Math.floor(originalOption.txCountPerMin / 3) || 3)
        totalFund = Math.ceil(totalFund * 10 / 70) * 10;
    }

    while (true) {
        await sleep(10 * 1000)
        currentTime = new Date().getTime()
        const balance = await getBalance(mainWallet.toSuiAddress(), client)

        if (balance >= BigInt(totalFund * Number(MIST_PER_SUI))) {
            //deposited
            printToFile(fileName, "deposit found", boostId, "bot name:", botName, "rental", isRent)
            boost = await supabase.from("Boosts")
                .update({ payment_status: 1, deposit_amount: Number(balance) / Number(MIST_PER_SUI), start_time: new Date().toISOString() })
                .eq('id', boostId)
                .select("*")
                .single();
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

    //start
    const boostStartTime = new Date().getTime()

    let walletCount = 1;

    if (isTrending) {
        if (buyOnly)
            walletCount = Math.floor(option.txCountPerMin / suiConfig.txnPerMinuteTrending) || 1
        else walletCount = Math.floor(option.txCountPerMin / (suiConfig.txnPerMinuteTrending * 2)) || 1
    } else {
        walletCount = suiConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
    }


    printToFile(fileName, "Bot started", new Date(boostStartTime).toUTCString())
    const balance = await getBalance(mainWallet.toSuiAddress(), client)
    const minFund = (balance * BigInt(100 - suiConfig.referralPercent) / BigInt(100)) / BigInt(walletCount) - BigInt(2 * suiConfig.gasFee * Number(MIST_PER_SUI))

    let totalFailCount = 0;
    let totalFee = BigInt(0);
    let totalTxCount = 0;
    printToFile(fileName, "wallet count", walletCount)

    const refAmount = balance * BigInt(suiConfig.referralPercent) / BigInt(100)

    if (!isRent) {
        const sendTx = await sendSui(client, mainWallet, referralWallet, refAmount, fileName)
        printToFile(fileName, "sent to referral", Number(refAmount) / Number(MIST_PER_SUI), sendTx?.txid)
        await supabase.from("Referrals").update({ fund_earned: refAmount.toString() }).eq("id", referralId)
        await sleep(1000)
    }

    printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}xz`)
    printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)

    let transfers: any[] = [];
    let wallets: any[] = [];
    for (let i = 0; i < walletCount; i++) {
        const wallet = new Ed25519Keypair();
        wallets.push(wallet);
        transfers.push({
            to: wallet.toSuiAddress(),
            amount: minFund
        })

        printToFile(fileName, `thread ${i} startWallet ${wallet.getSecretKey()}xz ${wallet.toSuiAddress()}`)
        printToFile(fileNameTempWallet, `"${wallet.getSecretKey()}",`)
    }

    const txid = await sendSuiDivideWallt(client, mainWallet, transfers, fileName)
    printToFile(fileName, "send sui divide success", txid?.txid)
    const mainThreads = Array.from({ length: walletCount }, (v, i) => {
        const mainLogic = async () => {
            let avgBetweenTime = 0;
            if (isTrending) {
                avgBetweenTime = Math.floor((60 * 1000 * 3) * walletCount / option.txCountPerMin)
                await sleep(avgBetweenTime / walletCount * i)
            } else {
                avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)
                await sleep(avgBetweenTime / (walletCount + 1) * i)
            }

            const startWallet = wallets[i];
            await insertOrUpdatePrivateKeys(boostId, i, startWallet.getSecretKey(), startWallet.getSecretKey())
            const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000

            const ret = await thread(startWallet.getSecretKey(), client, tokenMint, i, option, fileName, mainWallet.toSuiAddress(), boostId, new Date().getTime(), finishTime, dexParam, fileNameTempWallet, boost.data.swap_amount, boost.data.deposit_amount, isTrending, isCustom, buyOnly, isHolders)

            totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0
            totalFee += ret?.totalFee ? ret.totalFee : BigInt(0)

        }
        return mainLogic()
    }
    );


    await Promise.all(mainThreads)

    const totalFundRemaining = await getBalance(mainWallet.toSuiAddress(), client)

    const sendResObj = await sendAllSui(client, mainWallet, treasuryWallet, fileName, 0)
    printToFile(fileName, "sent all SUI to treasury wallet", sendResObj?.txid || '')

    await sleep(1000)
    const endTime = new Date().getTime()
    printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
    printToFile(fileName, "total fail count", totalFailCount)
    printToFile(fileName, "total tx count", totalTxCount)
    printToFile(fileName, "starting sui", exchangeSuiBalance(balance))
    printToFile(fileName, "referral sui", exchangeSuiBalance(refAmount))
    printToFile(fileName, "remaining sui", exchangeSuiBalance(totalFundRemaining))
    printToFile(fileName, "used sui", exchangeSuiBalance(balance) - exchangeSuiBalance(refAmount) - exchangeSuiBalance(totalFundRemaining))
    printToFile(fileName, "total transaction fee", exchangeSuiBalance(totalFee))
    printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
    await supabase.from("Boosts")
        .update({ boost_status: 1, finish_time: new Date().toISOString(), remaining_amount: exchangeSuiBalance(totalFundRemaining) })
        .eq('id', boostId)
}

export const thread = async (startSecretKey: string, client: SuiClient, tokenMint: string, threadNumber: number, option: Package, fileName: string, tempStoreWallet: string, boostId: number, startTime: number, finishTime: number, dexParam: any, fileNameTempWallet: string, swapAmount: number, depositAmount: number, isTrending: boolean, isCustom: boolean, buyOnly: boolean, isHolders: boolean) => {
    const totalCount = Math.floor((finishTime - startTime) / 60 / 1000 * option.txCountPerMin)
    // const walletCount = solanaConfig.baseWalletCount * option.txCountPerMin
    const supabase = getSupabase()

    let walletCount = 1;
    let sendTxCount = 0;
    let swapTxCount = 0;

    if (isTrending) {
        if (buyOnly) {
            walletCount = Math.floor(option.txCountPerMin / suiConfig.txnPerMinuteTrending) || 1
        }
        else { 
            walletCount = Math.floor(option.txCountPerMin / (suiConfig.txnPerMinuteTrending * 2)) || 1
        }
    } else {
        walletCount = suiConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
    }

    const avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)

    let eachCount = Math.floor(totalCount / walletCount);
    eachCount = eachCount % 2 == 0 ? eachCount : eachCount + 1;
    let totalFailCount = 0;
    let totalFee = BigInt(0);

    const startWallet = Ed25519Keypair.fromSecretKey(startSecretKey);
    /*
    while (true) {
        try {
            await sleep(1000)
            const initialSuiAmount = await getBalance(startWallet.toSuiAddress(), client)
            if (initialSuiAmount == BigInt(0)) continue
            if (initialSuiAmount < BigInt(suiConfig.gasFee * Number(MIST_PER_SUI))) {
                printToFile(fileName, threadNumber, "insufficient sui", exchangeSuiBalance(initialSuiAmount))
                return;
            }
            break
        } catch (error) {
            await sleep(1000)

        }
    }
    */
    let secretKey = startWallet.getSecretKey();
    //main logic
    console.log('eachCount', eachCount);
    eachCount = 1000000000000;
    if (isTrending) {

        let endLoop = false;
        //eachCount = 1;
        for (let index = 0; index < eachCount; index++) {
            const activeBoost: any = await supabase
                .from("Boosts")
                .select("*")
                .eq("id", boostId)
                .single();

            if (activeBoost.data.pause == 1) {
                await sleep(60000);
                continue;
            }
            const startRoundDate = new Date();
            const startMilliseconds = performance.now();
            const delayTime = 60000;
            let loopTxnCount = 0;

            for (let i = 0; i < suiConfig.txnPerMinuteTrending; i++) {
                const wallet = Ed25519Keypair.fromSecretKey(secretKey);
                const nextWallet = new Ed25519Keypair();
                printToFile(fileName, `${threadNumber} ${index} next wallet ${nextWallet.getSecretKey()}wd ${nextWallet.toSuiAddress()}`);
                printToFile(fileNameTempWallet, `"${(nextWallet.getSecretKey())}",`)
                await insertOrUpdatePrivateKeys(boostId, threadNumber, wallet.getSecretKey(), nextWallet.getSecretKey())

                let count = 0;
                let balanceCount = 0;

                while (true) {
                    try {
                        await sleep(1000)

                        const suiAmount = await getBalance(wallet.toSuiAddress(), client)
                        const threadDepositAmount = (depositAmount / walletCount) * Number(MIST_PER_SUI)
                        printToFile(fileName, threadNumber, index, "round, remaining sui", wallet.toSuiAddress(), exchangeSuiBalance(suiAmount), `${(Number(suiAmount) / threadDepositAmount * 100).toFixed()}%`)

                        if (balanceCount > 10) {
                            printToFile(fileName, threadNumber, "insufficient buy sui", exchangeSuiBalance(suiAmount))
                            endLoop = true;
                            break;
                        }

                        if (suiAmount < BigInt(suiConfig.swapFee * Number(MIST_PER_SUI)) * BigInt(2) && suiAmount > BigInt(suiConfig.swapFee * Number(MIST_PER_SUI))) {
                            balanceCount++
                            continue
                        }
                        if (suiAmount <= BigInt(suiConfig.swapFee * Number(MIST_PER_SUI))) {
                            balanceCount++
                            continue
                        }

                        if (suiAmount <= BigInt(Math.floor(threadDepositAmount * suiConfig.profitTrendingPercent / 100))) {
                            endLoop = true;
                            break;
                        }

                        const transaction: any = await getSwapTransactionWith7K(wallet.toSuiAddress(), suiConfig.wsui, tokenMint, BigInt(1000), dexParam, activeBoost.data.pool_address, fileName, threadNumber)
                        const swapTxHash: any = await signAndSendTransaction(transaction, wallet, fileName, threadNumber);
                        if (swapTxHash.txid == "unknown") {
                            continue
                        }

                        printToFile(fileName, threadNumber, "buy token success", swapTxHash.txid);
                        loopTxnCount++;
                        swapTxCount++;
                        totalFailCount += count;
                        break
                    } catch (error) {
                        await sleep(1000)
                        printToFile(fileName, threadNumber, "buy token error", error)
                        count++
                        continue
                    }
                }

                await sleep(1000)

                const tokenAmount = await getTokenBalance(client, wallet.toSuiAddress(), tokenMint, fileName, index)
                printToFile(fileName, threadNumber, "token balance", wallet.toSuiAddress(), tokenAmount)
                // send token to treasury wallet
                if (tokenAmount > BigInt(0)) {
                    if (!buyOnly) {
                        try {
                            const transaction = await getSwapTransactionWith7K(wallet.toSuiAddress(), tokenMint, suiConfig.wsui, tokenAmount, dexParam, activeBoost.data.pool_address, fileName, threadNumber)
                            const swapTxHash: any = await signAndSendTransaction(transaction, wallet, fileName, threadNumber);
                            printToFile(fileName, threadNumber, "sell token success")
                        } catch (error) {
                            printToFile(fileName, threadNumber, "sell token error", error)
                        }
                    }
                    // else {
                    //     try {
                    //         await sendToken(client, wallet, suiConfig.treasuryPubkey, tokenMint, tokenAmount, fileName, index)
                    //         printToFile(fileName, threadNumber, "send token success")
                    //     } catch (error) {
                    //         printToFile(fileName, threadNumber, "send token error", error)
                    //     }
                    // }
                }

                if (endLoop) break;

                // send all sui to next wallet
                while (true) {
                    await sleep(2000)
                    const txid: any = await sendAllSui(client, wallet, nextWallet.toSuiAddress(), fileName, threadNumber)
                    printToFile(fileName, threadNumber, index, "sent all sui", txid?.txid)
                    sendTxCount++;
                    totalFee += txid?.txFee || BigInt(0)
                    break
                }

                secretKey = nextWallet.getSecretKey()
            }

            const endRoundDate = new Date()
            await sleep(startRoundDate.getTime() + delayTime - endRoundDate.getTime())
            printToFile(fileName, threadNumber, `${index} round txn count ${loopTxnCount} per minute`);
            printToFile(fileName, threadNumber, `${index} round time ${performance.now() - startMilliseconds} milliseconds.`);

            if (endLoop) {
                printToFile(fileName, threadNumber, `boost stopped by other reason`);
                break;
            }

            const boost: any = await supabase
                .from("Boosts")
                .select("*")
                .eq("id", boostId)
                .single();

            if (boost.data.boost_status == 1) {
                printToFile(fileName, threadNumber, `boost stopped by status`);
                break;
            }
        }

    } else {
        let endLoop = false;
        for (let index = 0; index < eachCount; index++) {
            const activeBoost: any = await supabase
                .from("Boosts")
                .select("*")
                .eq("id", boostId)
                .single();

            if (activeBoost.data.pause == 1) {
                await sleep(60000);
                continue;
            }
            const startLoopTime = new Date().getTime()
            const startMilliseconds = performance.now();
            let loopTxnCount = 0;

            const wallet = Ed25519Keypair.fromSecretKey(secretKey);
            const nextWallet = new Ed25519Keypair();
            printToFile(fileName, `${threadNumber} next wallet ${nextWallet.getSecretKey()}wd ${nextWallet.toSuiAddress()}`);
            printToFile(fileNameTempWallet, `"${(nextWallet.getSecretKey())}",`)

            await insertOrUpdatePrivateKeys(boostId, threadNumber, wallet.getSecretKey(), nextWallet.getSecretKey())

            //buy sell
            let oldSuiAmount = BigInt(0);
            {
                let count = 0;
                let balanceCount = 0;
                while (true) {
                    try {
                        // to prevent not updating token balance
                        await sleep(1000)
                        const tokenAmount = await getTokenBalance(client, wallet.toSuiAddress(), tokenMint, fileName, threadNumber)
                        if (tokenAmount > BigInt(0)) {
                            printToFile(fileName, threadNumber, "token balance", wallet.toSuiAddress(), tokenAmount)
                            break
                        }

                        const suiAmount = await getBalance(wallet.toSuiAddress(), client)
                        const threadDepositAmount = (depositAmount / walletCount) * Number(MIST_PER_SUI)
                        printToFile(fileName, threadNumber, index, "round, remaining sui", wallet.toSuiAddress(), exchangeSuiBalance(suiAmount), `${(Number(suiAmount) / threadDepositAmount * 100).toFixed()}%`)

                        if (balanceCount > 10) {
                            printToFile(fileName, threadNumber, "insufficient buy sui", exchangeSuiBalance(suiAmount))
                            endLoop = true;
                            break;
                        }

                        if (suiAmount < BigInt(suiConfig.swapFee * Number(MIST_PER_SUI)) * BigInt(2) && suiAmount > BigInt(suiConfig.swapFee * Number(MIST_PER_SUI))) {
                            balanceCount++
                            continue
                        }
                        if (suiAmount <= BigInt(suiConfig.swapFee * Number(MIST_PER_SUI))) {
                            balanceCount++
                            continue
                        }

                        if (isCustom && suiAmount <= BigInt(Math.floor(threadDepositAmount * suiConfig.profitVolumePercent / 100))) {
                            endLoop = true;
                            break;
                        }

                        if (isHolders && suiAmount <= BigInt(Math.floor(threadDepositAmount * suiConfig.profitHolderPercent / 100))) {
                            endLoop = true;
                            break;
                        }

                        oldSuiAmount = suiAmount

                        let randomBuyAmount = 0;
                        if (isCustom)
                            randomBuyAmount = getRandomAmountForJito(swapAmount)
                        else randomBuyAmount = generateRandomNumber(option.minSwap, option.maxSwap)

                        const minBuyAmount = suiAmount - BigInt(suiConfig.swapFee * Number(MIST_PER_SUI)) * BigInt(2)
                        const buysuiAmount = BigInt(Math.floor(randomBuyAmount * Number(MIST_PER_SUI))) > minBuyAmount ? minBuyAmount : BigInt(Math.floor(randomBuyAmount * Number(MIST_PER_SUI)))
                        printToFile(fileName, threadNumber, "buy sui amount", exchangeSuiBalance(buysuiAmount))

                        if (buysuiAmount < BigInt(0)) {
                            endLoop = true;
                            break;
                        }

                        const transaction: any = await getSwapTransactionWith7K(wallet.toSuiAddress(), suiConfig.wsui, tokenMint, buysuiAmount, dexParam, activeBoost.data.pool_address, fileName, threadNumber)
                        if (transaction) {
                            const swapTxHash: any = await signAndSendTransaction(transaction, wallet, fileName, threadNumber);
                            if (swapTxHash.txid == "unknown") {
                                continue
                            }

                            printToFile(fileName, threadNumber, "buy token success", swapTxHash.txid);
                            loopTxnCount++;
                            swapTxCount++;
                            totalFailCount += count;
                            totalFee += swapTxHash.txFee
                        }
                        break
                    } catch (error) {
                        await sleep(1000)
                        printToFile(fileName, threadNumber, "buy token error", error)
                        count++
                        continue
                    }
                }

                const curTime = new Date().getTime()
                const ellapsedTime = curTime - startLoopTime
                const delayTime = (avgBetweenTime / walletCount - ellapsedTime) > 0 ? (avgBetweenTime / 3 - ellapsedTime) : 1
                await sleep(delayTime)

                //sell token
                if (!isHolders) {
                    count = 0;
                    let tokenBalanceCount = 0
                    let compareAmountCount = 0
                    while (true) {
                        try {
                            await sleep(1000)
                            const newSuiAmount = await getBalance(wallet.toSuiAddress(), client)
                            // if (newSuiAmount == oldSuiAmount && oldSuiAmount > 0 && compareAmountCount < 5) {
                            //     compareAmountCount++;
                            //     continue
                            // }
                            const tokenAmount = await getTokenBalance(client, wallet.toSuiAddress(), tokenMint, fileName, threadNumber)
                            printToFile(fileName, threadNumber, "token balance", (tokenAmount.toString()))

                            if (tokenBalanceCount > 10) {
                                printToFile(fileName, threadNumber, "tokenBalanceCount exceed")
                                break;
                            }


                            if (tokenAmount <= BigInt(1)) {
                                tokenBalanceCount++
                                continue
                            }

                            if (newSuiAmount <= BigInt(suiConfig.gasFee * Number(MIST_PER_SUI))) {
                                printToFile(fileName, threadNumber, "insufficient sell sui", exchangeSuiBalance(newSuiAmount))
                                tokenBalanceCount++
                                continue;
                            }

                            const transaction = await getSwapTransactionWith7K(wallet.toSuiAddress(), tokenMint, suiConfig.wsui, tokenAmount, dexParam, activeBoost.data.pool_address, fileName, threadNumber)

                            if (transaction) {
                                const swapTxHash: any = await signAndSendTransaction(transaction, wallet, fileName, threadNumber);
                                if (swapTxHash.txid == "unknown") {
                                    continue
                                }
                                oldSuiAmount = newSuiAmount
                                printToFile(fileName, threadNumber, "sell token success", swapTxHash.txid);
                                loopTxnCount++;
                                swapTxCount++;
                                totalFee += swapTxHash.txFee
                            }
                            break
                        } catch (error) {
                            await sleep(1000)
                            totalFailCount += count
                            count++
                            printToFile(fileName, threadNumber, "sell token error", error)
                        }
                    }
                }
            }

            while (true) {
                await sleep(2000)
                const txid: any = await sendAllSui(client, wallet, nextWallet.toSuiAddress(), fileName, threadNumber)
                printToFile(fileName, threadNumber, "sent all sui", txid?.txid)
                sendTxCount++;
                totalFee += txid?.txFee || BigInt(0)
                break
            }

            secretKey = nextWallet.getSecretKey()
            const endTime = new Date().getTime()
            const totalTimeElapsed = endTime - startTime;
            const loopTimeEstimated = avgBetweenTime * (index + 1) + generateRandomNumber(0, 20 * 1000) - 10000
            const delayMs = loopTimeEstimated >= totalTimeElapsed ? (loopTimeEstimated - totalTimeElapsed) : 1
            const delay = Math.floor(delayMs)

            printToFile(fileName, threadNumber, `${index} round txn count ${loopTxnCount} per minute`);
            printToFile(fileName, threadNumber, `${index} round time ${performance.now() - startMilliseconds} milliseconds.`);

            if (index != eachCount - 1) {
                await sleep(delay)
            }

            if (!isHolders && !isCustom && startLoopTime > finishTime) {
                printToFile(fileName, threadNumber, `boost stopped by time`);
                break
            }

            if (endLoop) {
                printToFile(fileName, threadNumber, `boost stopped by other reason`);
                break;
            }

            const boost: any = await supabase
                .from("Boosts")
                .select("*")
                .eq("id", boostId)
                .single();

            if (boost.data.boost_status == 1) {
                printToFile(fileName, threadNumber, `boost stopped by status`);
                break;
            }
        }
    }


    //send remaining sol to treasury
    const wallet = Ed25519Keypair.fromSecretKey(secretKey);

    const txid = await sendAllSui(client, wallet, tempStoreWallet, fileName, threadNumber)
    printToFile(fileName, `sent ${threadNumber} thread SUI to deposit wallet`, txid?.txid || '')

    totalFailCount += txid?.count || 0;
    totalFee += txid?.txFee || BigInt(0)

    return { totalFailCount, totalFee, swapTxCount, sendTxCount }
}

export const resumeBoostSui = async (boostId: number, tokenMint: string, option: Package, depositWalletPrivateKey: string, walletsArray: TempWallets[], boostStartTime: number, dexParam: string, isTrending: boolean, isCustom: boolean, buyOnly: boolean, isHolders: boolean, treasuryWallet: string) => {
    const supabase = getSupabase()
    const client = await getClient();
    const fileName = config.logPath + `${boostId}.log`
    const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`
    printToFile(fileName, "boost resumed", new Date().toUTCString())

    const mainWallet = Ed25519Keypair.fromSecretKey(depositWalletPrivateKey);
    printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}w`)
    printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)

    let walletCount = 1;

    if (isTrending) {
        walletCount = Math.floor(option.txCountPerMin / suiConfig.txnPerMinuteTrending) || 1
    } else {
        walletCount = suiConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
    }

    let totalFailCount = 0;
    let totalFee = BigInt(0);
    let totalSendTxCount = 0;
    let totalSwapTxCount = 0;

    const boost: any = await supabase
        .from("Boosts")
        .select("*")
        .eq("id", boostId)
        .single();

    // calculate deposit funds
    let totalFund = option.totalFund;
    if (isCustom) {
        totalFund = boost.data.swap_amount * (suiConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3)
        totalFund = Math.ceil(totalFund * 10 / 70) * 10;
    }

    const mainThreads = walletsArray.map((wallets, i) => {
        const mainLogic = async () => {
            let avgBetweenTime = 0

            if (isTrending) {
                avgBetweenTime = Math.floor((60 * 1000 * 3) * walletCount / option.txCountPerMin)
                await sleep(avgBetweenTime / walletCount * i)
            } else {
                avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)
                await sleep(avgBetweenTime / (walletCount + 1) * i)
            }

            const startWallet = Ed25519Keypair.fromSecretKey(wallets.currentWallet)
            const nextWallet = Ed25519Keypair.fromSecretKey(wallets.nextWallet)

            printToFile(fileName, `thread ${i} startWallet ${(startWallet.getSecretKey())}s ${startWallet.toSuiAddress()}`)
            printToFile(fileNameTempWallet, `"${(startWallet.getSecretKey())}",`)

            await insertOrUpdatePrivateKeys(boostId, i, (startWallet.getSecretKey()), (nextWallet.getSecretKey()))

            await sendAllSui(client, nextWallet, startWallet.toSuiAddress(), fileName, i)

            const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000
            const resumeStartTime = new Date().getTime()
            const ret = await thread((startWallet.getSecretKey()), client, tokenMint, i, option, fileName, mainWallet.toSuiAddress(), boostId, resumeStartTime, finishTime, dexParam, fileNameTempWallet, boost.data.swap_amount, boost.data.deposit_amount, isTrending, isCustom, buyOnly, isHolders)

            totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0
            totalFee += ret?.totalFee ? ret.totalFee : BigInt(0)
            totalSendTxCount += ret?.sendTxCount ? ret.sendTxCount : 0,
                totalSwapTxCount += ret?.swapTxCount ? ret.sendTxCount : 0
        }
        return mainLogic()
    });
    await Promise.all(mainThreads)
    const totalFundRemaining = await getBalance(mainWallet.toSuiAddress(), client)

    const sendResObj = await sendAllSui(client, mainWallet, treasuryWallet, fileName, 0)
    printToFile(fileName, "sent all SUI to treasury wallet", sendResObj?.txid || '')

    await sleep(1000)
    const refAmount = BigInt(option.totalFund * Number(MIST_PER_SUI)) * BigInt(suiConfig.referralPercent) / BigInt(100)

    const endTime = new Date().getTime()
    printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
    printToFile(fileName, "total fail count", totalFailCount)
    printToFile(fileName, "total send tx count", totalSendTxCount)
    printToFile(fileName, "total swap tx count", totalSwapTxCount)
    printToFile(fileName, "starting sui", boost.data.deposit_amount)
    printToFile(fileName, "referral sui", exchangeSuiBalance(refAmount))
    printToFile(fileName, "remaining sui", exchangeSuiBalance(totalFundRemaining))
    printToFile(fileName, "used sui", boost.data.deposit_amount - exchangeSuiBalance(refAmount) - exchangeSuiBalance(totalFundRemaining))
    printToFile(fileName, "total transaction fee", exchangeSuiBalance(totalFee))
    printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
    await supabase.from("Boosts")
        .update({ boost_status: 1 })
        .eq('id', boostId)
}

main()

