// import { config, web3Config } from "../config"
// import { Chain, Package, TempWallets } from "../types"
// import { buildTxForApproveTradeWithRouter, getBalance, getSwapTransaction, sendEth, signAndSendTransaction, isEvmAddress, sendAllEth, getTokenBalance, getTxFee, getProvider } from "./evmUtils"
// import base58 from "bs58"
// import { getSupabase } from "./authUtil"
// import { generateRandomNumber, insertOrUpdatePrivateKeys, printToFile, sleep } from "./utils"
// import { ethers, formatEther, JsonRpcProvider, parseEther, TransactionRequest, Wallet } from "ethers"

// export const startMonitorAndBotEVM = async (boostId: number, tokenMint: string, originalOption: Package, depositWalletPrivateKey: string, referralWallet: string, referralId: number, chainName: Chain, dexParam: string) => {
//     const provider = getProvider(web3Config[chainName].rpc)
//     const supabase = getSupabase()
//     const fileName = config.logPath + `${boostId}.log`
//     const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`
//     const startTime = new Date().getTime()
//     printToFile(fileName, "monitoring started", new Date(startTime).toUTCString())

//     const mainWallet = new Wallet(depositWalletPrivateKey, provider)
//     let currentTime;
//     while (true) {
//         await sleep(10 * 1000)
//         currentTime = new Date().getTime()
//         const balance = await getBalance(mainWallet.address, provider)
//         if (balance >= parseEther(`${originalOption.totalFund}`)) {
//             //deposited
//             printToFile(fileName, "deposit found", boostId)
//             const result = await supabase.from("Boosts")
//                 .update({ payment_status: 1 })
//                 .eq('id', boostId)
//             break
//         }

//         if (currentTime > startTime + config.MONITOR_SECONDS * 1000) {
//             //expired
//             printToFile(fileName, "boost expired", boostId)
//             const result = await supabase.from("Boosts")
//                 .update({ payment_status: 2 })
//                 .eq('id', boostId)
//             return
//         }
//     }

//     await sleep(3000)
//     // const poolExist = await poolExists(tokenMint)
//     // const liquidity = await getPoolAmount(connection, tokenMint, solanaConfig.wsol)
//     // console.log("liquidity", liquidity / LAMPORTS_PER_SOL)
//     const option = {
//         ...originalOption,
//     }
//     // if (!poolExist) {
//     //     printToFile(fileName, "Pool doesnt exist")
//     //     return
//     // } else {
//     //     printToFile(fileName, "Pool found", poolExist)
//     // }

//     printToFile(fileName, "original option", JSON.stringify(originalOption))
//     printToFile(fileName, "currnet option", JSON.stringify(option))
//     const evmConfig = web3Config[chainName]
//     //start
//     const boostStartTime = new Date().getTime()
//     const walletCount = evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
//     printToFile(fileName, "Bot started", new Date(boostStartTime).toUTCString())
//     const balance = await getBalance(mainWallet.address, provider)
//     const minFund = (balance * BigInt(100 - evmConfig.referralPercent) / BigInt(100) - parseEther(evmConfig.gasFee) * BigInt(2)) / BigInt(walletCount)

//     let totalFailCount = 0;
//     let totalFee = BigInt(0);
//     let totalTxCount = 0;
//     printToFile(fileName, "wallet count", walletCount)


//     const refAmount = balance * BigInt(evmConfig.referralPercent) / BigInt(100)
//     if (
//         isEvmAddress(referralWallet)
//     ) {
//         await sendEth(provider, mainWallet, referralWallet, refAmount, fileName)
//         printToFile(fileName, "sent to referral", formatEther(refAmount))
//         await supabase.from("Referrals").update({ fund_earned: refAmount.toString() }).eq("id", referralId)
//         await sleep(1000)

//     }
//     printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}xz`)
//     printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)
//     const mainThreads = Array.from({ length: walletCount }, (v, i) => {
//         const mainLogic = async () => {
//             const avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)


//             const startWallet = Wallet.createRandom(provider);
//             await sleep(50 * i)
//             printToFile(fileName, `thread ${i} startwallet ${startWallet.privateKey}xz ${startWallet.address}`)
//             printToFile(fileNameTempWallet, `"${startWallet.privateKey}",`)

//             await sleep(avgBetweenTime / (walletCount + 1) * i)
//             await insertOrUpdatePrivateKeys(boostId, i, startWallet.privateKey, startWallet.privateKey)
//             const txid = await sendEth(provider, mainWallet, startWallet.address, minFund, fileName)
//             printToFile(fileName, i, "send eth success", txid?.txid)
//             printToFile(fileName, i, "send eth fee", formatEther(txid?.txFee || BigInt(0)))
//             totalFailCount += txid?.count || 0
//             totalFee += txid?.txFee || BigInt(0)



//             const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000


//             const ret = await thread(startWallet.privateKey, provider, tokenMint, i, option, fileName, mainWallet.address, boostId, new Date().getTime(), finishTime, chainName, dexParam, fileNameTempWallet)

//             totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0
//             totalFee += ret?.totalFee ? ret.totalFee : BigInt(0)
//             totalTxCount += ret?.txCount ? ret.txCount : 0
//         }
//         return mainLogic()
//     }
//     );


//     await Promise.all(mainThreads)
//     const totalFundRemaining = await getBalance(mainWallet.address, provider)
//     await sendAllEth(provider, mainWallet, evmConfig.treasuryPubkey, fileName, 0, chainName)

//     await sleep(1000)
//     const endTime = new Date().getTime()
//     printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
//     printToFile(fileName, "total fail count", totalFailCount)
//     printToFile(fileName, "total tx count", totalTxCount)
//     printToFile(fileName, "starting eth", option.totalFund)
//     printToFile(fileName, "referral eth", formatEther(refAmount))
//     printToFile(fileName, "remaining eth", formatEther(totalFundRemaining))
//     printToFile(fileName, "used eth", option.totalFund - parseFloat(formatEther(refAmount)) - parseFloat(formatEther(totalFundRemaining)))
//     printToFile(fileName, "total transaction fee", formatEther(totalFee))
//     printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
//     await supabase.from("Boosts")
//         .update({ boost_status: 1 })
//         .eq('id', boostId)
// }




// export const thread = async (startSecretKey: string, provider: JsonRpcProvider, tokenMint: string, threadNumber: number, option: Package, fileName: string, tempStoreWallet: string, boostId: number, startTime: number, finishTime: number, chainName: Chain, dexParam: string, fileNameTempWallet: string) => {
//     const totalCount = Math.floor((finishTime - startTime) / 60 / 1000 * option.txCountPerMin)
//     // const walletCount = solanaConfig.baseWalletCount * option.txCountPerMin
//     const evmConfig = web3Config[chainName]
//     const walletCount = evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
//     const avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)


//     let eachCount = Math.floor(totalCount / walletCount);
//     eachCount = eachCount % 2 == 0 ? eachCount : eachCount + 1;
//     let totalFailCount = 0;
//     let totalFee = BigInt(0);
//     const startWallet = new Wallet(startSecretKey, provider)

//     while (true) {
//         try {
//             await sleep(1000)
//             const initialEthAmount = await getBalance(startWallet.address, provider)
//             if (initialEthAmount == BigInt(0)) continue
//             if (initialEthAmount < parseEther(`${evmConfig.gasFee}`)) {
//                 printToFile(fileName, threadNumber, "insufficient eth", formatEther(initialEthAmount))
//                 return;
//             }
//             break
//         } catch (error) {
//             await sleep(1000)

//         }
//     }

//     let secretKey = startWallet.privateKey;
//     //main logic
//     for (let index = 0; index < eachCount / 2; index++) {
//         const startLoopTime = new Date().getTime()

//         const wallet = new Wallet(secretKey, provider)

//         const nextWallet = Wallet.createRandom(provider);
//         printToFile(fileName, `${threadNumber} next wallet ${nextWallet.privateKey}wd ${nextWallet.address}`);
//         printToFile(fileNameTempWallet, `"${(nextWallet.privateKey)}",`)

//         await insertOrUpdatePrivateKeys(boostId, threadNumber, wallet.privateKey, nextWallet.privateKey)

//         //buy sell
//         let oldEthAmount = BigInt(0);
//         {
//             let count = 0;
//             let balanceCount = 0;
//             while (true) {
//                 try {
//                     // to prevent not updating token balance
//                     await sleep(1000)
//                     const tokenAmount = await getTokenBalance(provider, wallet.address, tokenMint, fileName, threadNumber)
//                     if (tokenAmount > BigInt(0)) {
//                         printToFile(fileName, threadNumber, "token balance", wallet.address, tokenAmount)
//                         break
//                     }

//                     const ethAmount = await getBalance(wallet.address, provider)
//                     printToFile(fileName, threadNumber, "eth balance", wallet.address, formatEther(ethAmount))
//                     //if get sol balance is not correct, retry
//                     if (ethAmount == BigInt(0)) continue

//                     if (balanceCount > 100) {
//                         printToFile(fileName, threadNumber, "insufficient buy eth", formatEther(ethAmount))
//                         await sendAllEth(provider, wallet, tempStoreWallet, fileName, threadNumber, chainName)
//                         return { totalFailCount, ethAmount, totalFee, txCount: index * 2 + 2 }
//                     }

//                     if (ethAmount < parseEther(evmConfig.gasFee) * BigInt(2) && ethAmount > parseEther(evmConfig.gasFee)) {
//                         await sleep(1000)
//                         balanceCount++
//                         continue
//                     }
//                     if (ethAmount <= parseEther(evmConfig.gasFee)) {
//                         printToFile(fileName, threadNumber, "insufficient buy eth", formatEther(ethAmount))
//                         await sendAllEth(provider, wallet, tempStoreWallet, fileName, threadNumber, chainName)
//                         return { totalFailCount, ethAmount, totalFee, txCount: index * 2 + 2 }
//                     }
//                     oldEthAmount = ethAmount
//                     const randomBuyAmount = generateRandomNumber(option.minSwap, option.maxSwap)
//                     const minBuyAmount = ethAmount - parseEther(evmConfig.gasFee) * BigInt(2)
//                     const buyethAmount = parseEther(randomBuyAmount.toFixed(8)) > minBuyAmount ? minBuyAmount : parseEther(randomBuyAmount.toFixed(8))
//                     printToFile(fileName, threadNumber, "buy eth amount", formatEther(buyethAmount))



//                     ///jupiter

//                     const transaction: any = await getSwapTransaction(wallet.address, evmConfig.eth, tokenMint, buyethAmount, chainName, dexParam, threadNumber, fileName)
//                     const swapTxHash = await signAndSendTransaction(transaction, wallet, threadNumber, fileName);
//                     if (swapTxHash.txid == "unknown") {
//                         continue
//                     }

//                     ///jupiter end
//                     printToFile(fileName, threadNumber, "buy token success", swapTxHash.txid);
//                     printToFile(fileName, threadNumber, "buy token fee", formatEther(swapTxHash.txFee))
//                     totalFailCount += count;
//                     totalFee += swapTxHash.txFee
//                     break
//                 } catch (error) {
//                     await sleep(1000)
//                     printToFile(fileName, threadNumber, "buy token error2", error)
//                     count++
//                     continue
//                 }
//             }
//             const curTime = new Date().getTime()
//             const ellapsedTime = curTime - startLoopTime
//             const delayTime = (avgBetweenTime / walletCount - ellapsedTime) > 0 ? (avgBetweenTime / 3 - ellapsedTime) : 1
//             await sleep(delayTime)
//             //sell token
//             count = 0;
//             let tokenBalanceCount = 0
//             while (true) {
//                 try {

//                     await sleep(600)
//                     const newethAmount = await getBalance(wallet.address, provider)
//                     if (newethAmount == oldEthAmount) {
//                         continue
//                     }
//                     const tokenAmount = await getTokenBalance(provider, wallet.address, tokenMint, fileName, threadNumber)
//                     printToFile(fileName, threadNumber, "token balance", (tokenAmount.toString()))

//                     if (newethAmount <= parseEther(evmConfig.gasFee)) {
//                         printToFile(fileName, threadNumber, "insufficient sell eth", formatEther(newethAmount))
//                         await sendAllEth(provider, wallet, tempStoreWallet, fileName, threadNumber, chainName)
//                         return { totalFailCount, newethAmount, totalFee, txCount: index * 2 + 2 }
//                     }
//                     if (tokenBalanceCount > 10) {
//                         printToFile(fileName, threadNumber, "tokenBalanceCount exceed")
//                         break
//                     }
//                     if (tokenAmount == BigInt(0)) {
//                         tokenBalanceCount++
//                         continue
//                     }


//                     const approveTx = await buildTxForApproveTradeWithRouter(provider, chainName, wallet.address, tokenMint, tokenAmount, fileName, threadNumber)
//                     const approveTxHash = await signAndSendTransaction(approveTx, wallet, threadNumber, fileName)
//                     if (approveTxHash.txid == "unknown") {
//                         continue
//                     }
//                     printToFile(fileName, threadNumber, "approve token success", approveTxHash.txid);
//                     printToFile(fileName, threadNumber, "approve token fee", formatEther(approveTxHash.txFee))



//                     const transaction = await getSwapTransaction(wallet.address, tokenMint, evmConfig.eth, tokenAmount, chainName, dexParam, threadNumber, fileName)
//                     const swapTxHash = await signAndSendTransaction(transaction, wallet, threadNumber, fileName);
//                     if (swapTxHash.txid == "unknown") {
//                         continue
//                     }

//                     oldEthAmount = newethAmount

//                     printToFile(fileName, threadNumber, "sell token success", swapTxHash.txid);
//                     printToFile(fileName, threadNumber, "sell token fee", formatEther(swapTxHash.txFee))

//                     totalFailCount += count
//                     totalFee += swapTxHash.txFee

//                     break
//                 } catch (error) {
//                     await sleep(1000)
//                     count++
//                     printToFile(fileName, threadNumber, "sell token error2", error)
//                 }
//             }
//         }


//         while (true) {
//             await sleep(500)
//             const newethAmount = await getBalance(wallet.address, provider)
//             if (newethAmount - parseEther("0.0000001") <= oldEthAmount) {
//                 continue
//             }
//             const txid = await sendAllEth(provider, wallet, nextWallet.address, fileName, threadNumber, chainName)
//             printToFile(fileName, threadNumber, "sent all eth", txid?.txid)
//             totalFee += txid?.txFee || BigInt(0)

//             break
//         }







//         secretKey = nextWallet.privateKey

//         const endTime = new Date().getTime()
//         const totalTimeElapsed = endTime - startTime;
//         const loopTimeEstimated = avgBetweenTime * (index + 1) + generateRandomNumber(0, 20 * 1000) - 10000
//         const delayMs = loopTimeEstimated >= totalTimeElapsed ? (loopTimeEstimated - totalTimeElapsed) : 1
//         const delay = Math.floor(delayMs)
//         printToFile(fileName, threadNumber, index, "round ended in ", endTime - startLoopTime, delayMs)
//         if (index != eachCount - 1) {
//             await sleep(delay)
//         }
//         if (startLoopTime > finishTime) {
//             break
//         }
//     }

//     //send remaining sol to treasury
//     const wallet = new Wallet(secretKey, provider)
//     const txid = await sendAllEth(provider, wallet, tempStoreWallet, fileName, threadNumber, chainName)


//     printToFile(fileName, threadNumber, "sent all eth to treasury", txid?.txid)

//     totalFailCount += txid?.count || 0;
//     totalFee += txid?.txFee || BigInt(0)

//     return { totalFailCount, totalFee, txCount: eachCount * 2 + 2 }
// }


// export const resumeBoostEvm = async (boostId: number, tokenMint: string, option: Package, depositWalletPrivateKey: string, walletsArray: TempWallets[], boostStartTime: number, chainName: Chain, dexParam: string) => {
//     const evmConfig = web3Config[chainName]
//     const supabase = getSupabase()
//     const provider = getProvider(evmConfig.rpc)
//     const fileName = config.logPath + `${boostId}.log`
//     const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`
//     printToFile(fileName, "boost resumed", new Date().toUTCString())

//     const mainWallet = new Wallet(depositWalletPrivateKey, provider)
//     printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}w`)
//     printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)

//     const walletCount = evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
//     let totalFailCount = 0;
//     let totalFee = BigInt(0);
//     let totalTxCount = 0;
//     const mainThreads = walletsArray.map((wallets, i) => {
//         const mainLogic = async () => {
//             const avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)
//             const startWallet = new Wallet(wallets.currentWallet, provider)
//             const nextWallet = new Wallet(wallets.nextWallet, provider)

//             printToFile(fileName, `thread ${i} startwallet ${(startWallet.privateKey)}s ${startWallet.address}`)
//             printToFile(fileNameTempWallet, `"${(startWallet.privateKey)}",`)
//             await sleep(avgBetweenTime / walletCount * i)
//             await insertOrUpdatePrivateKeys(boostId, i, (startWallet.privateKey), (nextWallet.privateKey))

//             await sendAllEth(provider, nextWallet, startWallet.address, fileName, i, chainName)

//             const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000
//             const resumeStartTime = new Date().getTime()
//             const ret = await thread((startWallet.privateKey), provider, tokenMint, i, option, fileName, mainWallet.address, boostId, resumeStartTime, finishTime, chainName, dexParam, fileNameTempWallet)


//             totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0
//             totalFee += ret?.totalFee ? ret.totalFee : BigInt(0)
//             totalTxCount += ret?.txCount ? ret.txCount : 0
//         }
//         return mainLogic()
//     });
//     await Promise.all(mainThreads)
//     const totalFundRemaining = await getBalance(mainWallet.address, provider)

//     await sendAllEth(provider, mainWallet, evmConfig.treasuryPubkey, fileName, 0, chainName)

//     await sleep(1000)
//     const refAmount = parseEther(`${option.totalFund}`) * BigInt(evmConfig.referralPercent) / BigInt(100)

//     const endTime = new Date().getTime()
//     printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
//     printToFile(fileName, "total fail count", totalFailCount)
//     printToFile(fileName, "total tx count", totalTxCount)
//     printToFile(fileName, "starting eth", option.totalFund)
//     printToFile(fileName, "referral eth", formatEther(refAmount))
//     printToFile(fileName, "remaining eth", formatEther(totalFundRemaining))
//     printToFile(fileName, "used eth", option.totalFund - parseFloat(formatEther(refAmount)) - parseFloat(formatEther(totalFundRemaining)))
//     printToFile(fileName, "total transaction fee", formatEther(totalFee))
//     printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
//     await supabase.from("Boosts")
//         .update({ boost_status: 1 })
//         .eq('id', boostId)
// }
