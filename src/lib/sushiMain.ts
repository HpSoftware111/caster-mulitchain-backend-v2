import { config, web3Config } from "../config"
import { Chain, Package, TempWallets } from "../types"
import { getBalance, sendEth, isEvmAddress, sendAllEth, getTokenBalance, getProvider, signAndSendTransaction, approve } from "./evmUtils"
import { getSupabase } from "./authUtil"
import { generateRandomNumber, insertOrUpdatePrivateKeys, printToFile, sleep, getRandomAmountForJito } from "./utils"
import { ethers, parseEther, Wallet } from "ethers"
import { getSwapTransactionwithSushi } from "./sushiMainUtils"

export const startMonitorAndBotSushi = async (botName: string, boostId: number, tokenMint: string, originalOption: Package, depositWalletPrivateKey: string, referralWallet: string, referralId: number, chainName: Chain, dexParam: string, preferSushi: string, isTrending: boolean, isCustom: boolean, buyOnly: boolean, isRent: boolean, treasuryWallet: string) => {

    const provider = getProvider(web3Config[chainName].rpc)
    const supabase = getSupabase()

    let boost: any = await supabase
        .from("Boosts")
        .select("*")
        .eq("id", boostId)
        .single();

    const fileName = config.logPath + `${boostId}.log`
    const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`
    const startTime = new Date().getTime();
    let _preferSushi = preferSushi;
    printToFile(fileName, "startMonitorAndBotSushi", new Date(startTime).toUTCString())

    const mainWallet = new Wallet(depositWalletPrivateKey, provider)
    let currentTime;

    // calculate deposit funds
    let totalFund = originalOption.totalFund;
    if (isCustom) {
        if(chainName.toLowerCase() === "bsc") {
            totalFund = boost.data.swap_amount * (3 * Math.floor(originalOption.txCountPerMin / 3) || 3)
            totalFund = totalFund * 1.3; //add 30% on BNB because transactions fees are high
            totalFund = Math.ceil((totalFund * 10 / 8) * 100) / 100;
            if(originalOption.txCountPerMin === 3) {
             totalFund = (totalFund * 1.60) * 100 / 100;
            }
        } else {
            totalFund = boost.data.swap_amount * (web3Config[chainName].baseWalletCount * Math.floor(originalOption.txCountPerMin / 3) || 3)
            totalFund = Math.ceil((totalFund * 10 / 7) * 100) / 100;
        }
    }

    while (true) {
        await sleep(10 * 1000)
        currentTime = new Date().getTime()

        const balance = await getBalance(mainWallet.address, provider);

        console.log("chainName", chainName);
        console.log("wallet", mainWallet.address);
        console.log("check payment");
        console.log("balance", balance);
        console.log("ethers.parseEther(`${totalFund}`)", ethers.parseEther(`${totalFund}`))

        if (balance >= (ethers.parseEther(`${totalFund}`))) {
            //deposited
            printToFile(fileName, "deposit found", boostId, "bot name:", botName, "rental", isRent, "CA", tokenMint)
            boost = await supabase.from("Boosts")
                .update({ payment_status: 1, deposit_amount: Number(ethers.formatEther(balance)), start_time: new Date().toISOString() })
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
    printToFile(fileName, "current option", JSON.stringify(option))
    const evmConfig = web3Config[chainName]
    //start
    const boostStartTime = new Date().getTime()

    let walletCount = 1;

    if (isTrending) {
        if (buyOnly)
            walletCount = Math.floor(option.txCountPerMin / evmConfig.txnPerMinuteTrending) || 1
        else walletCount = Math.floor(option.txCountPerMin / (evmConfig.txnPerMinuteTrending * 2)) || 1
    } else {
        walletCount = evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
    }

    printToFile(fileName, "Bot started", new Date(boostStartTime).toUTCString())
    const balance = await getBalance(mainWallet.address, provider);

    const minFund = (balance * BigInt(100 - evmConfig.referralPercent) / BigInt(100) - (ethers.parseEther(evmConfig.gasFee)) * BigInt(2)) / BigInt(walletCount)
    let totalFailCount = 0;
    let totalFee = BigInt(0);
    let totalTxCount = 0;
    printToFile(fileName, "wallet count", walletCount)


    const refAmount = balance * BigInt(evmConfig.referralPercent) / BigInt(100)

    if (
        isEvmAddress(referralWallet) && !isRent
    ) {
        const sendTx = await sendEth(provider, mainWallet, referralWallet, refAmount, fileName)
        printToFile(fileName, "sent to referral", ethers.formatEther(refAmount), sendTx?.txid)
        await supabase.from("Referrals").update({ fund_earned: refAmount.toString() }).eq("id", referralId)
        await sleep(1000)
    }
    printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}xz`)
    printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)
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

            const startWallet = Wallet.createRandom(provider);
            //await sleep(50 * i)
            await sleep(3000 * i)
            printToFile(fileName, `thread ${i} startwallet ${startWallet.privateKey}xz ${startWallet.address}`)
            printToFile(fileNameTempWallet, `"${startWallet.privateKey}",`)

            await sleep(avgBetweenTime / (walletCount + 1) * i)
            await insertOrUpdatePrivateKeys(boostId, i, startWallet.privateKey, startWallet.privateKey)
            const txid = await sendEth(provider, mainWallet, startWallet.address, minFund, fileName)
            printToFile(fileName, i, "send eth success", txid?.txid)
            printToFile(fileName, i, "send eth fee", ethers.formatEther(txid?.txFee || BigInt(0)))
            totalFailCount += txid?.count || 0
            totalFee += txid?.txFee || BigInt(0)

            const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000

            const ret = await thread(startWallet.privateKey, provider, tokenMint, i, option, fileName, mainWallet.address, boostId, new Date().getTime(), finishTime, chainName, dexParam, fileNameTempWallet, _preferSushi, boost.data.swap_amount, boost.data.deposit_amount, isTrending, isCustom, buyOnly)

            totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0
            totalFee += ret?.totalFee ? ret.totalFee : BigInt(0)
            totalTxCount += ret?.txCount ? ret.txCount : 0
        }
        return mainLogic()
    }
    );


    await Promise.all(mainThreads)
    const totalFundRemaining = await getBalance(mainWallet.address, provider)
    
    const sendResObj = await sendAllEth(provider, mainWallet, treasuryWallet, fileName, 0, chainName);
    printToFile(fileName, "sent all BASE to treasury wallet", sendResObj?.txid || '')

    await sleep(1000)
    const endTime = new Date().getTime()
    printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
    printToFile(fileName, "total fail count", totalFailCount)
    printToFile(fileName, "total tx count", totalTxCount)
    printToFile(fileName, "starting eth", parseFloat(ethers.formatEther(balance)))
    printToFile(fileName, "referral eth", ethers.formatEther(refAmount))
    printToFile(fileName, "remaining eth", ethers.formatEther(totalFundRemaining))
    printToFile(fileName, "used eth", parseFloat(ethers.formatEther(balance)) - parseFloat(ethers.formatEther(refAmount)) - parseFloat(ethers.formatEther(totalFundRemaining)))
    printToFile(fileName, "total transaction fee", ethers.formatEther(totalFee))
    printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
    await supabase.from("Boosts")
        .update({ boost_status: 1, finish_time: new Date().toISOString(), remaining_amount: parseFloat(ethers.formatEther(totalFundRemaining)) })
        .eq('id', boostId)
}


export const thread = async (startSecretKey: string, provider: ethers.JsonRpcProvider, tokenMint: string, threadNumber: number, option: Package, fileName: string, tempStoreWallet: string, boostId: number, startTime: number, finishTime: number, chainName: Chain, dexParam: string, fileNameTempWallet: string, preferSushi: string, swapAmount: number, depositAmount: number, isTrending: boolean, isCustom: boolean, buyOnly: boolean) => {
    const totalCount = Math.floor((finishTime - startTime) / 60 / 1000 * option.txCountPerMin)
    const supabase = getSupabase()

    let walletCount = 1;
    let sendTxCount = 0;
    let swapTxCount = 0;

    const evmConfig = web3Config[chainName];

    if (isTrending) {
        if (buyOnly)
            walletCount = Math.floor(option.txCountPerMin / evmConfig.txnPerMinuteTrending) || 1
        else walletCount = Math.floor(option.txCountPerMin / (evmConfig.txnPerMinuteTrending * 2)) || 1
    } else {
        walletCount = evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
    }
    const avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin);

    let eachCount = Math.floor(totalCount / walletCount);
    eachCount = eachCount % 2 == 0 ? eachCount : eachCount + 1;
    let totalFailCount = 0;
    let totalFee = BigInt(0);
    const startWallet = new Wallet(startSecretKey, provider)

    /*
    while (true) {
        try {
            await sleep(1000)
            const initialEthAmount = await getBalance(startWallet.address, provider)
            if (initialEthAmount == BigInt(0)) continue
            if (initialEthAmount < (ethers.parseEther(`${evmConfig.gasFee}`))) {
                printToFile(fileName, threadNumber, "insufficient eth", ethers.formatEther(initialEthAmount))
                return;
            }
            break
        } catch (error) {
            await sleep(1000)

        }
    }
    */

    let secretKey = startWallet.privateKey;
    eachCount = 1000000000000;
    //main logic

    if (isTrending) {
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
            const startRoundDate = new Date();
            const startMilliseconds = performance.now();
            const delayTime = 60000;
            let loopTxnCount = 0;

            for (let i = 0; i < evmConfig.txnPerMinuteTrending; i++) {
                const wallet = new Wallet(secretKey, provider)
                const nextWallet = Wallet.createRandom(provider);
                printToFile(fileName, `${threadNumber} next wallet ${nextWallet.privateKey}wd ${nextWallet.address}`);
                printToFile(fileNameTempWallet, `"${(nextWallet.privateKey)}",`)
                await insertOrUpdatePrivateKeys(boostId, threadNumber, wallet.privateKey, nextWallet.privateKey)

                let count = 0;
                let balanceCount = 0;
                const evmConfig = web3Config[chainName];

                while (true) {
                    try {
                        // to prevent not updating token balance
                        await sleep(1000)

                        const ethAmount = await getBalance(wallet.address, provider);
                        const threadDepositAmount = ethers.parseEther((depositAmount / walletCount).toFixed(18));
                        printToFile(fileName, threadNumber, index, "round, remaining base", wallet.address, ethers.formatEther(ethAmount), `${(Number(ethAmount) / Number(threadDepositAmount) * 100).toFixed()}%`)

                        const tokenAmount = await getTokenBalance(provider, wallet.address, tokenMint, fileName, threadNumber);
                        if (tokenAmount > BigInt(0)) {
                            printToFile(fileName, threadNumber, "token balance", wallet.address, tokenAmount)
                            break
                        }

                        if (balanceCount > 10) {
                            printToFile(fileName, threadNumber, "insufficient buy eth", ethers.formatEther(ethAmount))
                            endLoop = true;
                            break;
                        }

                        if (ethAmount < (ethers.parseEther(evmConfig.gasFee)) * BigInt(2) && ethAmount > (ethers.parseEther(evmConfig.gasFee))) {
                            balanceCount++
                            continue
                        }
                        if (ethAmount <= (ethers.parseEther(evmConfig.gasFee))) {
                            balanceCount++
                            continue
                        }

                        if (ethAmount <= BigInt(Math.floor(Number(threadDepositAmount) * evmConfig.profitTrendingPercent / 100))) {
                            endLoop = true;
                            break;
                        }

                        const swapResult: any = await getSwapTransactionwithSushi(evmConfig.eth, tokenMint, wallet.address, parseEther(option.maxSwap.toFixed(18)).toString(), chainName, threadNumber, fileName, provider, preferSushi,activeBoost.data.pool_address);
                        const swapTxHash = await signAndSendTransaction(provider, swapResult, wallet, threadNumber, fileName);
                        if (swapTxHash.txid == "unknown") {
                            continue;
                        }
                        printToFile(fileName, threadNumber, "buy token success", swapTxHash.txid);
                        loopTxnCount++;
                        swapTxCount++;

                        break
                    } catch (error) {
                        await sleep(1000);
                        totalFailCount += count;
                        printToFile(fileName, threadNumber, "buy token error", error)
                        count++
                        continue
                    }
                }

                await sleep(1000)

                const tokenAmount = await getTokenBalance(provider, wallet.address, tokenMint, fileName, threadNumber)
                printToFile(fileName, threadNumber, "token balance", (tokenAmount.toString()))

                // send token to treasury wallet
                if (tokenAmount > BigInt(0)) {
                    if (!buyOnly) {
                        try {
                            await approve(wallet, web3Config.suShiContract, tokenMint, tokenAmount, fileName, threadNumber, dexParam);
                            const transaction: any = await getSwapTransactionwithSushi(tokenMint, evmConfig.eth, wallet.address, tokenAmount.toString(), chainName, threadNumber, fileName, provider, preferSushi,activeBoost.data.pool_address);
                            await signAndSendTransaction(provider, transaction, wallet, threadNumber, fileName);
                            printToFile(fileName, threadNumber, "sell token success")
                        } catch (error) {

                            printToFile(fileName, threadNumber, "sell token error", error);
                        }

                    } else {

                    }
                }

                if (endLoop) break;

                while (true) {
                    await sleep(2000)
                    const txid = await sendAllEth(provider, wallet, nextWallet.address, fileName, threadNumber, chainName)
                    printToFile(fileName, threadNumber, "sent all eth", txid?.txid)
                    totalFee += txid?.txFee || BigInt(0)
                    sendTxCount++;
                    break
                }

                secretKey = nextWallet.privateKey
            }

            const endRoundDate = new Date()
            await sleep(startRoundDate.getTime() + delayTime - endRoundDate.getTime())
            printToFile(fileName, threadNumber, `${index} round txn count ${loopTxnCount} per minute`);
            printToFile(fileName, threadNumber, `${index} round time ${performance.now() - startMilliseconds} milliseconds.`);

            if (endLoop) break;

            const boost: any = await supabase
                .from("Boosts")
                .select("*")
                .eq("id", boostId)
                .single();

            if (boost.data.boost_status == 1) {
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

            const wallet = new Wallet(secretKey, provider)
            const nextWallet = Wallet.createRandom(provider);
            printToFile(fileName, `${threadNumber} next wallet ${nextWallet.privateKey}wd ${nextWallet.address}`);
            printToFile(fileNameTempWallet, `"${(nextWallet.privateKey)}",`)

            await insertOrUpdatePrivateKeys(boostId, threadNumber, wallet.privateKey, nextWallet.privateKey)

            //buy sell
            let oldEthAmount = BigInt(0);
            {
                let count = 0;
                let balanceCount = 0;
                const evmConfig = web3Config[chainName];

                while (true) {
                    try {
                        // to prevent not updating token balance
                        await sleep(1000)
                        const tokenAmount = await getTokenBalance(provider, wallet.address, tokenMint, fileName, threadNumber);
                        if (tokenAmount > BigInt(0)) {
                            printToFile(fileName, threadNumber, "token balance", wallet.address, tokenAmount)
                            break
                        }

                        const ethAmount = await getBalance(wallet.address, provider);
                        const threadDepositAmount = ethers.parseEther((depositAmount / walletCount).toFixed(18));
                        printToFile(fileName, threadNumber, index, "round, remaining base", wallet.address, ethers.formatEther(ethAmount), `${(Number(ethAmount) / Number(threadDepositAmount) * 100).toFixed()}%`)

                        if (balanceCount > 10) {
                            printToFile(fileName, threadNumber, "insufficient buy eth", ethers.formatEther(ethAmount))
                            return { totalFailCount, ethAmount, totalFee, txCount: index * 2 + 2 }
                        }

                        if (ethAmount < (ethers.parseEther(evmConfig.gasFee)) * BigInt(2) && ethAmount > (ethers.parseEther(evmConfig.gasFee))) {
                            balanceCount++
                            continue
                        }
                        if (ethAmount <= (ethers.parseEther(evmConfig.gasFee))) {
                            balanceCount++
                            continue
                        }

                        if (isCustom && ethAmount <= BigInt(Math.floor(Number(threadDepositAmount) * evmConfig.profitVolumePercent / 100))) {
                            endLoop = true;
                            break;
                        }

                        oldEthAmount = ethAmount;

                        let randomBuyAmount = 0;

                        if (isCustom)
                            randomBuyAmount = getRandomAmountForJito(swapAmount)
                        else randomBuyAmount = generateRandomNumber(option.minSwap, option.maxSwap)

                        const minBuyAmount = ethAmount - ethers.parseEther(evmConfig.gasFee) * BigInt(2)

                        const buyethAmount = buyOnly ? ethers.parseEther(option.maxSwap.toFixed(18)) : (ethers.parseEther(randomBuyAmount.toFixed(18)) > minBuyAmount ? minBuyAmount : ethers.parseEther(randomBuyAmount.toFixed(18)))

                        if (buyethAmount < BigInt(0)) {
                            endLoop = true;
                            break;
                        }

                        const swapResult: any = await getSwapTransactionwithSushi(evmConfig.eth, tokenMint, wallet.address, buyethAmount.toString(), chainName, threadNumber, fileName, provider, preferSushi, activeBoost.data.pool_address);
                        const swapTxHash = await signAndSendTransaction(provider, swapResult, wallet, threadNumber, fileName);
                        if (swapTxHash.txid == "unknown") {
                            continue;
                        }
                        printToFile(fileName, threadNumber, "buy token success", swapTxHash.txid);
                        printToFile(fileName, threadNumber, "buy token fee", ethers.formatEther(swapTxHash.txFee))

                        // totalFee += result.data.txFee
                        break
                    } catch (error) {
                        await sleep(1000);
                        totalFailCount += count;
                        printToFile(fileName, threadNumber, "buy token error", error)
                        count++
                        continue
                    }
                }

                if (endLoop) break;

                const curTime = new Date().getTime()
                const ellapsedTime = curTime - startLoopTime
                const delayTime = (avgBetweenTime / walletCount - ellapsedTime) > 0 ? (avgBetweenTime / 3 - ellapsedTime) : 1
                await sleep(delayTime)
                //sell token
                count = 0;
                // buyOnly is a setting in the package table.  When true we skip the sell logic

                let tokenBalanceCount = 0
                let compareAmountCount = 0
                while (true) {
                    try {

                        await sleep(1000)
                        const newethAmount = await getBalance(wallet.address, provider);
                        // if (newSuiAmount == oldSuiAmount && oldSuiAmount > 0 && compareAmountCount < 5) {
                        //     compareAmountCount++;
                        //     continue
                        // }
                        const tokenAmount = await getTokenBalance(provider, wallet.address, tokenMint, fileName, threadNumber)
                        printToFile(fileName, threadNumber, "token balance", (tokenAmount.toString()))

                        if (tokenBalanceCount > 10) {
                            printToFile(fileName, threadNumber, "tokenBalanceCount exceed")
                            break
                        }
                        if (tokenAmount == BigInt(0)) {
                            tokenBalanceCount++
                            continue
                        }

                        if (newethAmount <= (ethers.parseEther(evmConfig.gasFee))) {
                            printToFile(fileName, threadNumber, "insufficient sell eth", ethers.formatEther(newethAmount))
                            tokenBalanceCount++
                            continue;
                        }
                        await approve(wallet, web3Config.suShiContract, tokenMint, tokenAmount, fileName, threadNumber, dexParam);
                        const swapResult: any = await getSwapTransactionwithSushi(tokenMint, evmConfig.eth, wallet.address, tokenAmount.toString(), chainName, threadNumber, fileName, provider, preferSushi, activeBoost.data.pool_address);
                        const swapTxHash = await signAndSendTransaction(provider, swapResult, wallet, threadNumber, fileName);
                        if (swapTxHash.txid == "unknown") {
                            continue;
                        }

                        oldEthAmount = newethAmount
                        printToFile(fileName, threadNumber, "sell token success", swapTxHash.txid);
                        loopTxnCount++;
                        swapTxCount++;

                        break;
                    } catch (error) {
                        await sleep(1000);
                        totalFailCount += count;
                        count++
                        printToFile(fileName, threadNumber, "sell token error", error);
                    }
                }
                if (endLoop) break;
            }

            while (true) {
                await sleep(2000)
                const txid = await sendAllEth(provider, wallet, nextWallet.address, fileName, threadNumber, chainName)
                printToFile(fileName, threadNumber, "sent all eth", txid?.txid)
                sendTxCount++;
                totalFee += txid?.txFee || BigInt(0)

                break
            }

            secretKey = nextWallet.privateKey

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

            if (!isCustom && startLoopTime > finishTime) {
                break
            }

            const boost: any = await supabase
                .from("Boosts")
                .select("*")
                .eq("id", boostId)
                .single();

            if (boost.data.boost_status == 1) {
                break;
            }
        }
    }

    //send remaining eth to treasury
    const wallet = new Wallet(secretKey, provider)

    const txid = await sendAllEth(provider, wallet, tempStoreWallet, fileName, threadNumber, chainName)
    printToFile(fileName, `sent ${threadNumber} thread ${chainName} to deposit wallet`, txid?.txid || '')

    totalFailCount += txid?.count || 0;
    totalFee += txid?.txFee || BigInt(0)

    return { totalFailCount, totalFee, swapTxCount, sendTxCount }
}


export const resumeBoostSushi = async (boostId: number, tokenMint: string, option: Package, depositWalletPrivateKey: string, walletsArray: TempWallets[], boostStartTime: number, chainName: Chain, dexParam: string, preferSushi: string, isTrending: boolean, isCustom: boolean, buyOnly: boolean, treasuryWallet: string) => {
    const evmConfig = web3Config[chainName]
    const supabase = getSupabase()
    const provider = getProvider(evmConfig.rpc)
    const fileName = config.logPath + `${boostId}.log`
    const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`
    printToFile(fileName, "boost resumed", new Date().toUTCString())

    const mainWallet = new Wallet(depositWalletPrivateKey, provider)
    printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}w`)
    printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)

    let walletCount = 1;

    if (isTrending) {
        if (buyOnly)
            walletCount = Math.floor(option.txCountPerMin / evmConfig.txnPerMinuteTrending) || 1
        else walletCount = Math.floor(option.txCountPerMin / (evmConfig.txnPerMinuteTrending * 2)) || 1
    } else {
        walletCount = evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
    }
    let totalFailCount = 0;
    let totalFee = BigInt(0);
    let totalTxCount = 0;

    const boost: any = await supabase
        .from("Boosts")
        .select("*")
        .eq("id", boostId)
        .single();

    const mainThreads = walletsArray.map((wallets, i) => {
        const mainLogic = async () => {
            let avgBetweenTime = 0;
            if (isTrending) {
                avgBetweenTime = Math.floor((60 * 1000 * 3) * walletCount / option.txCountPerMin)
                await sleep(avgBetweenTime / walletCount * i)
            } else {
                avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)
                await sleep(avgBetweenTime / (walletCount + 1) * i)
            }
            const startWallet = new Wallet(wallets.currentWallet, provider)
            const nextWallet = new Wallet(wallets.nextWallet, provider)

            printToFile(fileName, `thread ${i} startwallet ${(startWallet.privateKey)}s ${startWallet.address}`)
            printToFile(fileNameTempWallet, `"${(startWallet.privateKey)}",`)
            await sleep(avgBetweenTime / walletCount * i)
            await insertOrUpdatePrivateKeys(boostId, i, (startWallet.privateKey), (nextWallet.privateKey))

            await sendAllEth(provider, nextWallet, startWallet.address, fileName, i, chainName)

            const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000
            const resumeStartTime = new Date().getTime()
            const ret = await thread((startWallet.privateKey), provider, tokenMint, i, option, fileName, mainWallet.address, boostId, resumeStartTime, finishTime, chainName, dexParam, fileNameTempWallet, preferSushi, boost.data.swap_amount, boost.data.deposit_amount, isTrending, isCustom, buyOnly)


            totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0,
                totalFee += ret?.totalFee ? ret.totalFee : BigInt(0)
            totalTxCount += ret?.txCount ? ret.txCount : 0
        }
        return mainLogic()
    });
    await Promise.all(mainThreads)
    const totalFundRemaining = await getBalance(mainWallet.address, provider)

    const sendResObj = await sendAllEth(provider, mainWallet, treasuryWallet, fileName, 0, chainName);
    printToFile(fileName, "sent all BASE to treasury wallet", sendResObj?.txid || '')

    await sleep(1000)
    const refAmount = (ethers.parseEther(`${option.totalFund}`)) * BigInt(evmConfig.referralPercent) / BigInt(100)

    const endTime = new Date().getTime()
    printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
    printToFile(fileName, "total fail count", totalFailCount)
    printToFile(fileName, "total tx count", totalTxCount)
    printToFile(fileName, "starting eth", boost.data.deposit_amount)
    printToFile(fileName, "referral eth", ethers.formatEther(refAmount))
    printToFile(fileName, "remaining eth", ethers.formatEther(totalFundRemaining))
    printToFile(fileName, "used eth", boost.data.deposit_amount - parseFloat(ethers.formatEther(refAmount)) - parseFloat(ethers.formatEther(totalFundRemaining)))
    printToFile(fileName, "total transaction fee", ethers.formatEther(totalFee))
    printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
    await supabase.from("Boosts")
        .update({ boost_status: 1 })
        .eq('id', boostId)
}
