import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction, sendAndConfirmRawTransaction, sendAndConfirmTransaction, SystemProgram, TransactionMessage, TransactionInstruction } from "@solana/web3.js"
import { config, solanaConfig } from "../config"
import { Package, TempWallets } from "../types"
import { closeTokenAccount, getBalance, getConnection, getPumpfunSwapTransaction, getSwapTransaction, getTokenBalance, getTxFee, isBase58SolanaWalletAddress, sendAllSol, sendSol, getSwapTransactionWithJito, sendAllSolToSignWallet, generateRandomValues, swapAllToken, fetchMarketAccounts, formatAmmKeysById, getRaydiumSwapTransaction, getOwnerTokenAccounts, createTokenAccount, getPumpfunSwapTransactionWithSDK, sendToken } from "./solanaUtils"
import base58 from "bs58"
import { getSupabase } from "./authUtil"
import { generateRandomNumber, insertOrUpdatePrivateKeys, printToFile, sleep, getRandomAmountForJito } from "./utils"
import { Account, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createAssociatedTokenAccountInstruction, createCloseAccountInstruction, createTransferInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token"
import { checkBundleStatus, createTipInstruction, sendBundle, getJitoTip } from "./solana/jito"
import { transactionSenderAndConfirmationWaiter } from "./solana//sender"
import { jsonInfo2PoolKeys, LiquidityPoolKeys, WSOL } from "@raydium-io/raydium-sdk"

export const startMonitorAndBotSol = async (botName: string, boostId: number, tokenMint: string, originalOption: Package, depositWalletPrivateKey: string, referralWallet: string, referralId: number, poolType: string, isTrending: boolean, isAdmin: boolean, isJito: boolean, isHolders: boolean, isRent: boolean, treasuryWallet: string) => {
    const connection = await getConnection()
    const fileName = solanaConfig.logPath + `${boostId}.log`
    const fileNameTempWallet = solanaConfig.logPath + `tempwallet_${boostId}.log`
    const supabase = getSupabase()

    let boost: any = await supabase
        .from("Boosts")
        .select("*")
        .eq("id", boostId)
        .single();

    const startTime = new Date().getTime()
    printToFile(fileName, "monitoring started", new Date(startTime).toUTCString())

    const mainWallet = Keypair.fromSecretKey(base58.decode(depositWalletPrivateKey))
    let currentTime;

    let poolInfo: any;
    if (poolType == 'Raydium,Raydium CLMM,Raydium CP') {
        const poolId = await fetchMarketAccounts(connection, solanaConfig.wsol, tokenMint, "confirmed")
        if (!poolId) {
            printToFile(fileName, "Raydium Pool doesnt exist")
        } else {
            const poolData = await formatAmmKeysById(connection, poolId)
            poolInfo = jsonInfo2PoolKeys(poolData) as LiquidityPoolKeys
            printToFile(fileName, "Raydium Pool found", poolId)
        }
    }

    // calculate deposit funds
    let totalFund = originalOption.totalFund;
    if (isJito && !isTrending && !isHolders && poolType != "pump") {
        totalFund = boost.data.swap_amount * (Math.floor(originalOption.txCountPerMin / solanaConfig.txnPerMinute) || 1);
        totalFund = Math.ceil(totalFund * 10 / 9);
        if (originalOption.txCountPerMin / solanaConfig.txnPerMinute == 1) {
            totalFund = totalFund > 3 ? totalFund : 3;
        }
        if (originalOption.txCountPerMin / solanaConfig.txnPerMinute >= 2) {
            totalFund = totalFund > 4 ? totalFund : 4;
        }
    }
    printToFile(fileName, "totalFund", totalFund, "isJito", isJito, "isTrending", isTrending, "isHolders", isHolders, "poolType", poolType);
    while (true) {
        await sleep(10 * 1000)
        currentTime = new Date().getTime()
        const balance = await getBalance(mainWallet.publicKey, connection)
        if (balance >= totalFund * LAMPORTS_PER_SOL || (isAdmin && balance > 0)) {
            //deposited
            printToFile(fileName, "deposit found", boostId, "bot name:", botName, "rental", isRent, "token address", tokenMint, `${balance / LAMPORTS_PER_SOL} SOL`)
            boost = await supabase.from("Boosts")
                .update({ payment_status: 1, deposit_amount: balance / LAMPORTS_PER_SOL, start_time: new Date().toISOString() })
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

    let option = {
        ...originalOption,
    }


    printToFile(fileName, "original option", JSON.stringify(originalOption))
    printToFile(fileName, "currnet option", JSON.stringify(option))
    const boostStartTime = new Date().getTime()

    //start
    let walletCount = 1;

    if (isJito) {
        walletCount = Math.floor(option.txCountPerMin / solanaConfig.txnPerMinute) || 1
    } else walletCount = solanaConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3


    printToFile(fileName, "Bot started", new Date(boostStartTime).toUTCString())
    const depositAmount = await getBalance(mainWallet.publicKey, connection);
    const balance = depositAmount / LAMPORTS_PER_SOL;
    let subtractAmount = solanaConfig.gasFee * 2
    if (option.txCountPerMin >= 50) subtractAmount = 0.1
    let minSolFund = parseFloat(((balance * (100 - solanaConfig.referralPercent) / 100 - subtractAmount) / walletCount).toFixed(4))
    if (isAdmin) {
        minSolFund = parseFloat(((balance - subtractAmount) / walletCount).toFixed(4))
    }

    printToFile(fileName, "wallet divide amount", minSolFund)

    let totalFailCount = 0;
    let totalFee = 0;
    let totalFundRemaining = 0;
    let totalTxCount = 0;
    let jitoSuccessCount = 0;
    let jitoFailCount = 0;
    printToFile(fileName, "wallet count", walletCount)


    let refAmount = Math.floor(balance * LAMPORTS_PER_SOL * solanaConfig.referralPercent / 100)
    if (
        isBase58SolanaWalletAddress(referralWallet) && !isAdmin && !isRent
    ) {
        const txn = await sendSol(connection, mainWallet, new PublicKey(referralWallet), refAmount / LAMPORTS_PER_SOL, fileName, 0)
        printToFile(fileName, "sent to referral", refAmount / LAMPORTS_PER_SOL, txn?.txid)
        totalFundRemaining += refAmount
        await supabase.from("Referrals").update({ fund_earned: `${refAmount}` }).eq("id", referralId)
        await sleep(1000)
    } else {
        printToFile(fileName, "Did not send to referral " + referralWallet);
    }
    printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}w`)
    printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)

    const mainThreads = Array.from({ length: walletCount }, (v, i) => {
        const mainLogic = async () => {
            let avgBetweenTime = 0
            if (!isJito) {
                avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin);
                await sleep(avgBetweenTime / (walletCount + 1) * i)
            } else {
                avgBetweenTime = Math.floor((60 * 1000 * 3) * walletCount / option.txCountPerMin)
                await sleep(avgBetweenTime / walletCount * i)
            }

            const startWallet = Keypair.generate();
            await insertOrUpdatePrivateKeys(boostId, i, base58.encode(startWallet.secretKey), base58.encode(startWallet.secretKey))
            printToFile(fileName, `thread ${i} startwallet ${base58.encode(startWallet.secretKey)}s ${startWallet.publicKey.toBase58()}`)
            printToFile(fileNameTempWallet, `"${base58.encode(startWallet.secretKey)}",`)
            const txid = await sendSol(connection, mainWallet, startWallet.publicKey, minSolFund, fileName, i)
            printToFile(fileName, i, "send sol success", txid?.txid)

            const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000
            const ret = await thread(base58.encode(startWallet.secretKey), connection, tokenMint, i, option, fileName, mainWallet.publicKey, poolType, boostId, isTrending, new Date().getTime(), finishTime, fileNameTempWallet, boost.data.swap_amount, boost.data.deposit_amount, isJito, poolInfo, isHolders)
            totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0
            totalFundRemaining += ret?.lastBalance || 0
            totalFee += ret?.totalFee ? ret.totalFee : 0
            totalTxCount += ret?.txCount ? ret.txCount : 0
            jitoSuccessCount += ret?.jitoSuccessCount ? ret.jitoSuccessCount : 0
            jitoFailCount += ret?.jitoFailCount ? ret.jitoFailCount : 0
        }
        return mainLogic()
    }
    );

    await Promise.all(mainThreads)
    totalFundRemaining = await getBalance(mainWallet.publicKey, connection)

    const txid = await sendAllSol(connection, mainWallet, new PublicKey(treasuryWallet), fileName)
    printToFile(fileName, "sent all SOL to treasury wallet", txid?.txid || '')

    await sleep(1000)
    const endTime = new Date().getTime()
    printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
    printToFile(fileName, "total fail count", totalFailCount)
    printToFile(fileName, "total tx count", totalTxCount)
    printToFile(fileName, "starting sol", balance)
    printToFile(fileName, "referral sol", refAmount / LAMPORTS_PER_SOL)
    printToFile(fileName, "remaining sol", totalFundRemaining / LAMPORTS_PER_SOL)
    printToFile(fileName, "used sol", balance - totalFundRemaining / LAMPORTS_PER_SOL - refAmount / LAMPORTS_PER_SOL)
    printToFile(fileName, "total transaction fee", totalFee / LAMPORTS_PER_SOL)
    printToFile(fileName, "jito success count", jitoSuccessCount)
    printToFile(fileName, "jito fail count", jitoFailCount)
    printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
    await supabase.from("Boosts")
        .update({ boost_status: 1, finish_time: new Date().toISOString(), remaining_amount: totalFundRemaining / LAMPORTS_PER_SOL })
        .eq('id', boostId)
}

export const thread = async (startSecretKey: string, connection: Connection, tokenMint: string, threadNumber: number, option: Package, fileName: string, tempStoreWallet: PublicKey, poolType: string, boostId: number, isTrending: boolean, startTime: number, finishTime: number, fileNameTempWallet: string, swapAmount: number, depositAmount: number, isJito: boolean, poolInfo: LiquidityPoolKeys, isHolders: boolean) => {

    const supabase = getSupabase()

    const totalCount = Math.floor((finishTime - startTime) / 60 / 1000 * option.txCountPerMin)
    // const walletCount = solanaConfig.baseWalletCount * option.txCountPerMin
    let walletCount = 1;
    let avgBetweenTime = 0;

    if (isJito) {
        walletCount = Math.floor(option.txCountPerMin / solanaConfig.txnPerMinute) || 1
        avgBetweenTime = Math.floor((60 * 1000 * 3) * walletCount / option.txCountPerMin)
    } else {
        walletCount = solanaConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3
        avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)
    }

    let eachCount = Math.floor(totalCount / walletCount);
    eachCount = eachCount % 2 == 0 ? eachCount : eachCount + 1;
    let totalFailCount = 0;
    let totalFee = 0;
    let jitoSuccessCount = 0;
    let jitoFailCount = 0;
    const startWallet = Keypair.fromSecretKey(base58.decode(startSecretKey))

    let initialSolCount = 0
    let initialSolAmount = 0;

    /*
    while (true) {
        try {
            await sleep(1000)
            if (initialSolCount > 20) {
                printToFile(fileName, threadNumber, "insufficient sol", 0)
                return;
            }
            initialSolAmount = await connection.getBalance(startWallet.publicKey, "confirmed")
            if (initialSolAmount == 0) {
                initialSolCount++
                continue
            }
            if (initialSolAmount < solanaConfig.gasFee * LAMPORTS_PER_SOL) {
                printToFile(fileName, threadNumber, "insufficient sol", initialSolAmount / LAMPORTS_PER_SOL)
                return;
            }
            break
        } catch (error) {
            await sleep(1000)

        }
    }
    */
    let secretKey = startWallet.secretKey;
    eachCount = 1000000000000;
    //main logic
    if (isJito) {
        let delayTime = 60000 / solanaConfig.txnPerMinute * 3;
        if (option.txCountPerMin / solanaConfig.txnPerMinute < 1) {
            if (option.txCountPerMin / 3 == 1)
                delayTime = 60000;
            if (option.txCountPerMin / 3 == 2)
                delayTime = 30000;
        }
        // create token account for start wallet
        if (config.IS_RAYDIUM && poolInfo) {
            for (let i = 0; i < 2; i++) {
                let raydiumResCount = 0;
                while (true) {
                    try {
                        const latestBlockhash = await connection.getLatestBlockhash();
                        const raydiumRes: any = await getRaydiumSwapTransaction(
                            connection,
                            startWallet.publicKey,
                            startWallet.publicKey,
                            tokenMint,
                            solanaConfig.wsol,
                            0.000001,
                            poolInfo,
                            0,
                            solanaConfig.maxLamportsNormal,
                            true,
                            "in"
                        );

                        raydiumRes.transaction.sign([startWallet]);
                        const rawTransaction = raydiumRes.transaction.serialize()
                        const recentBlockhash = latestBlockhash.blockhash;
                        const lastValidBlockHeight = latestBlockhash.lastValidBlockHeight
                        const sig = await sendAndConfirmRawTransaction(connection, Buffer.from(rawTransaction), {
                            signature: base58.encode(raydiumRes.transaction.signatures[0]),
                            blockhash: recentBlockhash,
                            lastValidBlockHeight: lastValidBlockHeight
                        }
                            , {
                                skipPreflight: true,
                                commitment: 'confirmed',
                                maxRetries: solanaConfig.maxRetries
                            })
                        console.log(sig);
                        break;
                    } catch (error) {
                        await sleep(1000);
                        raydiumResCount++;

                        if (raydiumResCount > 60) {
                            break;
                        }
                    }
                }
            }
        }

        let solanaGasFee = solanaConfig.gasFee;
        let profitPercent = solanaConfig.profitVolumePercent;
        if (isHolders) {
            profitPercent = solanaConfig.profitHolderPercent;
        } else if (isTrending) {
            solanaGasFee = 0.0005;
            profitPercent = solanaConfig.profitTrendingPercent;
        }

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

            if(activeBoost.data.deposit_amount >= 20) {
                profitPercent = solanaConfig.profitVolumePercent20;
            }

            if(activeBoost.data.deposit_amount >= 40) {
                profitPercent = solanaConfig.profitVolumePercent40;
            }

            if(activeBoost.data.package_id === 53) {
                profitPercent = solanaConfig.profitVolumePercent21Pacakage;
            }

            // start logic
            const startLoopTime = new Date().getTime()
            const startRoundDate = new Date();
            const startMilliseconds = performance.now();
            let count = 0;
            let balanceCount = 0;
            let endLoop = false;

            let maxLamports = solanaConfig.maxLamportsNormal;

            while (true) {
                try {
                    await sleep(1000)
                    const solAmount = await connection.getBalance(startWallet.publicKey, "confirmed")
                    const threadDepositAmount = Math.floor((depositAmount / walletCount) * LAMPORTS_PER_SOL)
                    printToFile(fileName, threadNumber, index, "round, remaining sol", solAmount / LAMPORTS_PER_SOL, `${(solAmount / threadDepositAmount * 100).toFixed()}%`)

                    if (balanceCount > 10) {
                        printToFile(fileName, threadNumber, "insufficient buy sol", solAmount / LAMPORTS_PER_SOL)
                        endLoop = true;
                        break;
                    }

                    if (solAmount < (solanaGasFee * 2 + solanaConfig.signerTxnFee * 3) * LAMPORTS_PER_SOL && solAmount > (solanaGasFee + solanaConfig.signerTxnFee * 3) * LAMPORTS_PER_SOL) {
                        balanceCount++
                        continue
                    }
                    if (solAmount <= (solanaGasFee + solanaConfig.signerTxnFee * 3) * LAMPORTS_PER_SOL) {
                        balanceCount++
                        continue
                    }

                    if (poolType != "pump" && solAmount <= (threadDepositAmount * profitPercent) / 100) {
                        endLoop = true;
                        break;
                    }

                    if (poolType == "pump" && startLoopTime > finishTime) {
                        endLoop = true;
                        break
                    }

                    const nextWallet = Keypair.generate();
                    printToFile(fileName, `${threadNumber} next wallet ${base58.encode(nextWallet.secretKey)}w ${nextWallet.publicKey.toBase58()}`);
                    printToFile(fileNameTempWallet, `"${base58.encode(nextWallet.secretKey)}",`)

                    const nextWallet1 = Keypair.generate();
                    printToFile(fileName, `${threadNumber} next wallet1 ${base58.encode(nextWallet1.secretKey)}w ${nextWallet1.publicKey.toBase58()}`);
                    printToFile(fileNameTempWallet, `"${base58.encode(nextWallet1.secretKey)}",`)

                    const nextWallet2 = Keypair.generate();
                    printToFile(fileName, `${threadNumber} next wallet2 ${base58.encode(nextWallet2.secretKey)}w ${nextWallet2.publicKey.toBase58()}`);
                    printToFile(fileNameTempWallet, `"${base58.encode(nextWallet2.secretKey)}",`)

                    const nextWallet3 = Keypair.generate();
                    printToFile(fileName, `${threadNumber} next wallet3 ${base58.encode(nextWallet3.secretKey)}w ${nextWallet3.publicKey.toBase58()}`);
                    printToFile(fileNameTempWallet, `"${base58.encode(nextWallet3.secretKey)}",`)

                    let jitoTip = solanaConfig.jitoTip;
                    if (!isTrending && config.USE_JITO_API) {
                        jitoTip = await getJitoTip();
                    }

                    printToFile(fileName, `${threadNumber} jito tip ${jitoTip}`);

                    const sendJitoTip = new Transaction().add(createTipInstruction(startWallet.publicKey, jitoTip))

                    let sendSolTx;

                    if (poolType == 'pump') {
                        sendSolTx = new Transaction().add(
                            SystemProgram.transfer({
                                fromPubkey: startWallet.publicKey,
                                toPubkey: nextWallet.publicKey,
                                lamports: 0.0111 * LAMPORTS_PER_SOL
                            })
                        )
                            .add(
                                SystemProgram.transfer({
                                    fromPubkey: startWallet.publicKey,
                                    toPubkey: nextWallet1.publicKey,
                                    lamports: 0.0111 * LAMPORTS_PER_SOL
                                })
                            )
                            .add(
                                SystemProgram.transfer({
                                    fromPubkey: startWallet.publicKey,
                                    toPubkey: nextWallet2.publicKey,
                                    lamports: 0.0111 * LAMPORTS_PER_SOL
                                })
                            );
                    } else {
                        if (isTrending) {
                            sendSolTx = new Transaction().add(createTipInstruction(startWallet.publicKey, jitoTip))
                                .add(
                                    SystemProgram.transfer({
                                        fromPubkey: startWallet.publicKey,
                                        toPubkey: nextWallet.publicKey,
                                        lamports: 0.001 * LAMPORTS_PER_SOL
                                    })
                                )
                                .add(
                                    SystemProgram.transfer({
                                        fromPubkey: startWallet.publicKey,
                                        toPubkey: nextWallet1.publicKey,
                                        lamports: 0.001 * LAMPORTS_PER_SOL
                                    })
                                ).add(
                                    SystemProgram.transfer({
                                        fromPubkey: startWallet.publicKey,
                                        toPubkey: nextWallet2.publicKey,
                                        lamports: 0.001 * LAMPORTS_PER_SOL
                                    })
                                ).add(
                                    SystemProgram.transfer({
                                        fromPubkey: startWallet.publicKey,
                                        toPubkey: nextWallet3.publicKey,
                                        lamports: 0.001 * LAMPORTS_PER_SOL
                                    })
                                );
                        } else {
                            sendSolTx = new Transaction().add(
                                SystemProgram.transfer({
                                    fromPubkey: startWallet.publicKey,
                                    toPubkey: nextWallet.publicKey,
                                    lamports: 0.001 * LAMPORTS_PER_SOL
                                })
                            )
                                .add(
                                    SystemProgram.transfer({
                                        fromPubkey: startWallet.publicKey,
                                        toPubkey: nextWallet1.publicKey,
                                        lamports: 0.001 * LAMPORTS_PER_SOL
                                    })
                                ).add(
                                    SystemProgram.transfer({
                                        fromPubkey: startWallet.publicKey,
                                        toPubkey: nextWallet2.publicKey,
                                        lamports: 0.001 * LAMPORTS_PER_SOL
                                    })
                                );
                        }

                    }


                    const bundleTxns = []
                    const latestBlockhash = await connection.getLatestBlockhash()
                    const recentBlockhash = latestBlockhash.blockhash;
                    const lastValidBlockHeight = latestBlockhash.lastValidBlockHeight


                    sendJitoTip.recentBlockhash = recentBlockhash
                    sendJitoTip.lastValidBlockHeight = lastValidBlockHeight
                    sendJitoTip.sign(startWallet)
                    if (!isTrending)
                        bundleTxns.push(base58.encode(sendJitoTip.serialize()));

                    sendSolTx.recentBlockhash = recentBlockhash
                    sendSolTx.lastValidBlockHeight = lastValidBlockHeight
                    sendSolTx.sign(startWallet)
                    bundleTxns.push(base58.encode(sendSolTx.serialize()));

                    const sendSolInstruction0 = SystemProgram.transfer({
                        fromPubkey: nextWallet.publicKey,
                        toPubkey: startWallet.publicKey,
                        lamports: 980000
                    })
                    const sendSolInstruction1 = SystemProgram.transfer({
                        fromPubkey: nextWallet1.publicKey,
                        toPubkey: startWallet.publicKey,
                        lamports: 980000
                    })
                    const sendSolInstruction2 = SystemProgram.transfer({
                        fromPubkey: nextWallet2.publicKey,
                        toPubkey: startWallet.publicKey,
                        lamports: 980000
                    })
                    const sendSolInstruction3 = SystemProgram.transfer({
                        fromPubkey: nextWallet3.publicKey,
                        toPubkey: startWallet.publicKey,
                        lamports: 980000
                    })


                    let tokenAmount = 0, tokenAmount1 = 0, tokenAmount2 = 0;
                    if (!isTrending) {
                        let buyAmount0 = 0, buyAmount1 = 0, buyAmount2 = 0;
                        if (isHolders) {
                            buyAmount0 = generateRandomNumber(option.minSwap, option.maxSwap)
                            buyAmount1 = generateRandomNumber(option.minSwap, option.maxSwap)
                            buyAmount2 = generateRandomNumber(option.minSwap, option.maxSwap)
                        } else {
                            const randomBuyAmount = getRandomAmountForJito(swapAmount)
                            const maxBuyAmount = (solAmount / LAMPORTS_PER_SOL - solanaGasFee * 2 - solanaConfig.signerTxnFee * 3) * 0.995;
                            const buySolAmount = randomBuyAmount > maxBuyAmount ? maxBuyAmount : randomBuyAmount
                            printToFile(fileName, threadNumber, "buy sol amount", buySolAmount)

                            const buyAmounts = generateRandomValues(buySolAmount, 2);
                            buyAmount0 = buyAmounts[0];
                            buyAmount1 = buyAmounts[1];
                        }


                        let buyTx0: any;

                        if (poolType == "pump") {
                            buyTx0 = await getPumpfunSwapTransactionWithSDK(connection, nextWallet.publicKey, startWallet, tokenMint, true, solanaConfig.pumpFunBumpAmount, maxLamports, latestBlockhash.blockhash, false, true, fileName, threadNumber);
                            tokenAmount = buyTx0.buyAmountToken;
                            if (!buyTx0.transaction) {
                                endLoop = true;
                                break
                            }
                        } else {
                            if (config.IS_RAYDIUM && poolInfo) {
                                buyTx0 = await getRaydiumSwapTransaction(connection, nextWallet.publicKey, startWallet.publicKey, tokenMint, solanaConfig.wsol, Number(buyAmount0.toFixed(8)), poolInfo, 0, maxLamports, true, "in")
                                tokenAmount = buyTx0.buyAmountToken;
                            } else {
                                buyTx0 = await getSwapTransactionWithJito(connection, nextWallet.publicKey, startWallet.publicKey, solanaConfig.wsol, tokenMint, Math.floor(buyAmount0 * LAMPORTS_PER_SOL), solanaConfig.jupiterFeeVolme, fileName, threadNumber, recentBlockhash, poolType, "ExactIn", undefined)
                                tokenAmount = parseInt(buyTx0.quoteResponse.otherAmountThreshold)
                            }

                        }
                        buyTx0.transaction.sign([nextWallet, startWallet])
                        const rawBuyTx0 = base58.encode(buyTx0.transaction.serialize())
                        bundleTxns.push(rawBuyTx0)

                        let buyTx1: any;
                        if (poolType == "pump") {
                            buyTx1 = await getPumpfunSwapTransactionWithSDK(connection, nextWallet1.publicKey, startWallet, tokenMint, true, solanaConfig.pumpFunBumpAmount, maxLamports, latestBlockhash.blockhash, false, false, fileName, threadNumber);
                            tokenAmount1 = buyTx1.buyAmountToken;
                            if (!buyTx1.transaction) {
                                endLoop = true;
                                break
                            }
                        } else {
                            if (config.IS_RAYDIUM && poolInfo) {
                                buyTx1 = await getRaydiumSwapTransaction(connection, nextWallet1.publicKey, startWallet.publicKey, tokenMint, solanaConfig.wsol, Number(buyAmount1.toFixed(8)), poolInfo, 0, maxLamports, true, "in")
                                tokenAmount1 = buyTx1.buyAmountToken;
                            } else {
                                buyTx1 = await getSwapTransactionWithJito(connection, nextWallet1.publicKey, startWallet.publicKey, solanaConfig.wsol, tokenMint, Math.floor(buyAmount1 * LAMPORTS_PER_SOL), solanaConfig.jupiterFeeVolme, fileName, threadNumber, recentBlockhash, poolType, "ExactIn", undefined)
                                tokenAmount1 = parseInt(buyTx1.quoteResponse.otherAmountThreshold)
                            }


                        }
                        buyTx1.transaction.sign([nextWallet1, startWallet])
                        const rawBuyTx1 = base58.encode(buyTx1.transaction.serialize())
                        bundleTxns.push(rawBuyTx1)

                        if (!isHolders) {
                            const allTokenAmount = tokenAmount + tokenAmount1;
                            console.log('tokenAmount', tokenAmount);
                            let sellTx0: any;
                            if (poolType == "pump") {
                                sellTx0 = await getPumpfunSwapTransactionWithSDK(connection, nextWallet2.publicKey, startWallet, tokenMint, false, allTokenAmount, maxLamports, latestBlockhash.blockhash, false, false, fileName, threadNumber);
                                if (!sellTx0.transaction) {
                                    endLoop = true;
                                    break
                                }
                            } else {
                                if (config.IS_RAYDIUM && poolInfo) {
                                    sellTx0 = await getRaydiumSwapTransaction(connection, nextWallet2.publicKey, startWallet.publicKey, solanaConfig.wsol, tokenMint, allTokenAmount, poolInfo, 0, maxLamports, true, "out")
                                } else {
                                    sellTx0 = await getSwapTransactionWithJito(connection, nextWallet2.publicKey, startWallet.publicKey, tokenMint, solanaConfig.wsol, allTokenAmount, solanaConfig.jupiterFeeVolme, fileName, threadNumber, recentBlockhash, poolType, "ExactIn", undefined)
                                }
                            }
                            sellTx0.transaction.sign([nextWallet2, startWallet])
                            const rawSellTx0 = base58.encode(sellTx0.transaction.serialize())
                            bundleTxns.push(rawSellTx0)
                        } else {
                            let buyTx2: any;
                            if (poolType == "pump") {
                                buyTx2 = await getPumpfunSwapTransactionWithSDK(connection, nextWallet2.publicKey, startWallet, tokenMint, true, solanaConfig.pumpFunBumpAmount, maxLamports, latestBlockhash.blockhash, false, false, fileName, threadNumber);
                                tokenAmount2 = buyTx2.buyAmountToken;
                                if (!buyTx2.transaction) {
                                    endLoop = true;
                                    break
                                }
                            } else {
                                if (config.IS_RAYDIUM && poolInfo) {
                                    buyTx2 = await getRaydiumSwapTransaction(connection, nextWallet2.publicKey, startWallet.publicKey, tokenMint, solanaConfig.wsol, Number(buyAmount2.toFixed(8)), poolInfo, 0, maxLamports, true, "in")
                                    tokenAmount2 = buyTx2.buyAmountToken;
                                } else {
                                    buyTx2 = await getSwapTransactionWithJito(connection, nextWallet2.publicKey, startWallet.publicKey, solanaConfig.wsol, tokenMint, Math.floor(buyAmount2 * LAMPORTS_PER_SOL), solanaConfig.jupiterFeeVolme, fileName, threadNumber, recentBlockhash, poolType, "ExactIn", undefined)
                                    tokenAmount2 = parseInt(buyTx2.quoteResponse.otherAmountThreshold)
                                }
                            }
                            buyTx2.transaction.sign([nextWallet2, startWallet])
                            const rawBuyTx2 = base58.encode(buyTx2.transaction.serialize())
                            bundleTxns.push(rawBuyTx2)
                        }


                    } else {
                        for (let i = 0; i < 4; i++) {
                            let signWallet: Keypair;
                            let sendSolInstruction: TransactionInstruction;
                            switch (i) {
                                case 0:
                                    signWallet = nextWallet;
                                    sendSolInstruction = sendSolInstruction0;
                                    break;
                                case 1:
                                    signWallet = nextWallet1;
                                    sendSolInstruction = sendSolInstruction1;
                                    break;
                                case 2:
                                    signWallet = nextWallet2;
                                    sendSolInstruction = sendSolInstruction2;
                                    break;
                                case 3:
                                    signWallet = nextWallet3;
                                    sendSolInstruction = sendSolInstruction3;
                                    break;
                                default:
                                    signWallet = nextWallet;
                                    sendSolInstruction = sendSolInstruction0;
                                    break;
                            }
                            if (config.IS_RAYDIUM && poolInfo) {
                                const buyTx: any = await getRaydiumSwapTransaction(
                                    connection,
                                    signWallet.publicKey,
                                    startWallet.publicKey,
                                    tokenMint,
                                    solanaConfig.wsol,
                                    0.000001,
                                    poolInfo,
                                    0,
                                    solanaConfig.maxLamportsNormal,
                                    true,
                                    "in"
                                );

                                buyTx.transaction.sign([signWallet, startWallet])
                                const rawBuyTx = base58.encode(buyTx.transaction.serialize())
                                bundleTxns.push(rawBuyTx)
                            } else {
                                const buyTx = await getSwapTransactionWithJito(connection, signWallet.publicKey, startWallet.publicKey, solanaConfig.wsol, tokenMint, 1000, solanaConfig.jupiterFeeTrending, fileName, threadNumber, recentBlockhash, poolType, "ExactIn", undefined)
                                buyTx.transaction.sign([signWallet, startWallet])
                                const rawBuyTx = base58.encode(buyTx.transaction.serialize())
                                bundleTxns.push(rawBuyTx)
                            }
                        }
                    }

                    const response = await sendBundle(bundleTxns);

                    if (response.result) {
                        const bundleId = response.result;
                        if (isTrending) {
                            sendAllSolToSignWallet(connection, nextWallet, startWallet.publicKey, fileName, threadNumber)
                            sendAllSolToSignWallet(connection, nextWallet1, startWallet.publicKey, fileName, threadNumber)
                            sendAllSolToSignWallet(connection, nextWallet2, startWallet.publicKey, fileName, threadNumber)
                            sendAllSolToSignWallet(connection, nextWallet3, startWallet.publicKey, fileName, threadNumber)
                            printToFile(fileName, threadNumber, "send bundle success", startWallet.publicKey.toBase58(), response.result)
                        } else {
                            const reslut = await checkBundleStatus(bundleId, 5, 'confirmed', 1000);
                            if (reslut == 'success') {
                                sendAllSolToSignWallet(connection, nextWallet, startWallet.publicKey, fileName, threadNumber)
                                sendAllSolToSignWallet(connection, nextWallet1, startWallet.publicKey, fileName, threadNumber)
                                sendAllSolToSignWallet(connection, nextWallet2, startWallet.publicKey, fileName, threadNumber)

                                if (isHolders) {
                                    await sendToken(connection, startWallet, nextWallet.publicKey, tokenMint, tokenAmount, fileName, threadNumber)
                                    await sendToken(connection, startWallet, nextWallet1.publicKey, tokenMint, tokenAmount1, fileName, threadNumber)
                                    await sendToken(connection, startWallet, nextWallet2.publicKey, tokenMint, tokenAmount2, fileName, threadNumber)
                                }
                                jitoSuccessCount++;
                                printToFile(fileName, threadNumber, "send bundle success", startWallet.publicKey.toBase58(), response.result)
                            }
                            else {
                                jitoFailCount++;
                                printToFile(fileName, threadNumber, "send bundle failed", startWallet.publicKey.toBase58(), response.result)
                            }
                        }
                    }

                    break;

                } catch (error) {
                    count++
                    if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh
                    printToFile(fileName, threadNumber, "send bundle error", error)
                    continue
                }

            }

            // swap remaining token by loop
            if (poolType != "pump") {
                if (!isTrending) {
                    if (index != 0 && (index % solanaConfig.swapLoopCount) == 0) {
                        swapAllToken(connection, tokenMint, startWallet, poolType, fileName, threadNumber);
                    }
                } else {
                    if (index != 0 && (index % 100) == 0) {
                        swapAllToken(connection, tokenMint, startWallet, poolType, fileName, threadNumber);
                    }
                }
            }

            const endRoundDate = new Date()

            await sleep(startRoundDate.getTime() + delayTime - endRoundDate.getTime())

            printToFile(fileName, threadNumber, `${index} round time ${performance.now() - startMilliseconds} milliseconds.`);

            if (endLoop) break;

            const boost: any = await supabase
                .from("Boosts")
                .select("*")
                .eq("id", boostId)
                .single();

            if (boost.data.boost_status == 1) break;
        }

        await swapAllToken(connection, tokenMint, startWallet, poolType, fileName, threadNumber);

        await sleep(5000);
        const lastBalance = await getBalance(startWallet.publicKey, connection)
        const txid = await sendAllSol(connection, startWallet, tempStoreWallet, fileName)

        printToFile(fileName, `sent ${threadNumber} thread SOL to deposit wallet`, txid?.txid || '')

        totalFailCount += txid?.count || 0;

        return { totalFailCount, lastBalance, totalFee, txCount: eachCount * 3 / 2 + 2 }

    } else {
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

            let endLoop = false;
            const startLoopTime = new Date().getTime()
            const wallet = Keypair.fromSecretKey(secretKey);

            const nextWallet = Keypair.generate();
            printToFile(fileName, `${threadNumber} next wallet ${base58.encode(nextWallet.secretKey)}w ${nextWallet.publicKey.toBase58()}`);
            printToFile(fileNameTempWallet, `"${base58.encode(nextWallet.secretKey)}",`)

            const startRoundDate = new Date()
            printToFile(fileName, threadNumber, "start round", startRoundDate.toUTCString())

            await insertOrUpdatePrivateKeys(boostId, threadNumber, base58.encode(wallet.secretKey), base58.encode(nextWallet.secretKey))

            const thisAta = getAssociatedTokenAddressSync(new PublicKey(tokenMint), wallet.publicKey, true)
            //buy sell
            let oldSolAmount = 0;
            {
                // buy token
                let maxLamports = solanaConfig.maxLamportsNormal
                let count = 0;
                let balanceCount = 0;
                while (true) {
                    try {
                        // to prevent not updating token balance
                        await sleep(1000)
                        const tokenAmount = await getTokenBalance(thisAta, connection)
                        if (tokenAmount > 0) {
                            printToFile(fileName, threadNumber, "buy token balance", wallet.publicKey.toBase58(), tokenAmount)
                            break
                        }

                        const solAmount = await connection.getBalance(wallet.publicKey, "confirmed")
                        const threadDepositAmount = Math.floor((depositAmount / walletCount) * LAMPORTS_PER_SOL)
                        printToFile(fileName, threadNumber, index, "round, remaining sol", solAmount / LAMPORTS_PER_SOL, `${(solAmount / threadDepositAmount * 100).toFixed()}%`)

                        if (balanceCount > 10) {
                            printToFile(fileName, threadNumber, "insufficient buy sol", solAmount / LAMPORTS_PER_SOL)
                            endLoop = true;
                            break;
                        }

                        if (solAmount < solanaConfig.gasFee * 2 * LAMPORTS_PER_SOL && solAmount > solanaConfig.gasFee * LAMPORTS_PER_SOL) {
                            balanceCount++
                            continue
                        }
                        if (solAmount <= solanaConfig.gasFee * LAMPORTS_PER_SOL) {
                            balanceCount++
                            continue
                        }

                        if (isHolders && solAmount <= (threadDepositAmount * solanaConfig.profitHolderPercent) / 100) {
                            endLoop = true;
                            break;
                        }

                        oldSolAmount = solAmount
                        const randomBuyAmount = generateRandomNumber(option.minSwap, option.maxSwap)
                        const maxBuyAmount = (solAmount / LAMPORTS_PER_SOL - solanaConfig.gasFee * 2) * 0.995
                        const buySolAmount = randomBuyAmount > maxBuyAmount ? maxBuyAmount : randomBuyAmount;

                        printToFile(fileName, threadNumber, "buy sol amount", buySolAmount)

                        ///jupiter
                        const latestBlockhash = await connection.getLatestBlockhash("confirmed");
                        let transaction: VersionedTransaction

                        if (poolType == "pump") {
                            // swap with pumpfun portal
                            // transaction = await getPumpfunSwapTransaction(wallet.publicKey, tokenMint, true, buySolAmount, "pump", fileName, threadNumber, latestBlockhash.blockhash)

                            // swap with pumpfun sdk
                            const pumpFunRes: any = await getPumpfunSwapTransactionWithSDK(connection, wallet.publicKey, wallet, tokenMint, true, buySolAmount, maxLamports, latestBlockhash.blockhash, false, true, fileName, threadNumber);
                            transaction = pumpFunRes.transaction;
                            if (!transaction) {
                                endLoop = true;
                                break
                            }

                        } else {
                            if (config.IS_RAYDIUM && poolInfo) {
                                const raydiumRes: any = await getRaydiumSwapTransaction(connection, wallet.publicKey, wallet.publicKey, tokenMint, solanaConfig.wsol, Number(buySolAmount.toFixed(8)), poolInfo, 0, maxLamports, true, "in")
                                transaction = raydiumRes.transaction;

                            } else {
                                transaction = await getSwapTransaction(connection, wallet.publicKey, solanaConfig.wsol, tokenMint, Math.floor(buySolAmount * LAMPORTS_PER_SOL), maxLamports, fileName, threadNumber, latestBlockhash.blockhash, poolType, undefined)
                            }

                        }

                        // sign the transaction
                        transaction.sign([wallet]);
                        // Execute the transaction
                        const rawTransaction = transaction.serialize()

                        const recentBlockhash = latestBlockhash.blockhash;
                        const lastValidBlockHeight = latestBlockhash.lastValidBlockHeight
                        const txid = await sendAndConfirmRawTransaction(connection, Buffer.from(rawTransaction), {
                            signature: base58.encode(transaction.signatures[0]),
                            blockhash: recentBlockhash,
                            lastValidBlockHeight: lastValidBlockHeight
                        }
                            , {
                                skipPreflight: true,
                                commitment: 'confirmed',
                                maxRetries: solanaConfig.maxRetries
                            })
                        ///jupiter end
                        printToFile(fileName, threadNumber, "buy token success", txid);
                        const txFee = await getTxFee(connection, txid)

                        printToFile(fileName, "buy token fee", txFee)
                        totalFailCount += count;
                        totalFee += txFee

                        break
                    } catch (error) {
                        await sleep(1000)
                        printToFile(fileName, threadNumber, "buy token error2", error)
                        count++
                        if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh
                        continue
                    }
                }

                const curTime = new Date().getTime()
                const ellapsedTime = curTime - startLoopTime
                const delayTime = (avgBetweenTime / walletCount - ellapsedTime) > 0 ? (avgBetweenTime / 3 - ellapsedTime) : 1
                await sleep(delayTime)

                //sell token
                if (!isHolders) {
                    maxLamports = solanaConfig.maxLamportsNormal
                    count = 0;
                    let tokenBalanceCount = 0
                    let compareAmountCount = 0
                    while (true) {
                        await sleep(600)
                        let tokenAmount = 0;
                        let newSolAmount = 0;

                        try {
                            tokenAmount = await getTokenBalance(thisAta, connection)

                            printToFile(fileName, threadNumber, "sell token balance", wallet.publicKey.toBase58(), tokenAmount)


                            if (tokenBalanceCount > 10) {
                                printToFile(fileName, threadNumber, "tokenBalanceCount exceed")
                                break
                            }
                            if (tokenAmount == 0) {
                                tokenBalanceCount++
                                continue
                            }

                            newSolAmount = await getBalance(wallet.publicKey, connection)

                            //>= for avoid from phishing attack, > for resume boost,
                            // if (newSolAmount >= oldSolAmount && oldSolAmount > 0 && compareAmountCount < 5) {
                            //     printToFile(fileName, threadNumber, "new sol amount", newSolAmount / LAMPORTS_PER_SOL)
                            //     printToFile(fileName, threadNumber, "old sol amount", oldSolAmount / LAMPORTS_PER_SOL)
                            //     compareAmountCount++;
                            //     continue
                            // }

                            if (newSolAmount <= solanaConfig.gasFee * LAMPORTS_PER_SOL) {
                                printToFile(fileName, threadNumber, "insufficient sell sol", newSolAmount / LAMPORTS_PER_SOL)
                                endLoop = true;
                                break;
                            }

                        } catch (error) {
                            printToFile(fileName, threadNumber, "no reason issue", error)
                            break;
                        }

                        try {
                            const closeInstruction = createCloseAccountInstruction(thisAta, wallet.publicKey, wallet.publicKey)
                            ///jupiter

                            const latestBlockhash = await connection.getLatestBlockhash();
                            let transaction: any
                            if (poolType == "pump") {
                                // swap with pumpfun portal
                                // transaction = await getPumpfunSwapTransaction(wallet.publicKey, tokenMint, false, "100%", "pump", fileName, threadNumber, latestBlockhash.blockhash)

                                // swap with pumpfun sdk
                                const pumpFunRes = await getPumpfunSwapTransactionWithSDK(connection, wallet.publicKey, wallet, tokenMint, false, tokenAmount, maxLamports, latestBlockhash.blockhash, false, true, fileName, threadNumber);
                                transaction = pumpFunRes.transaction;
                                if (!transaction) {
                                    endLoop = true;
                                    break
                                }

                            } else {

                                if (config.IS_RAYDIUM && poolInfo) {
                                    const raydiumRes: any = await getRaydiumSwapTransaction(connection, wallet.publicKey, wallet.publicKey, solanaConfig.wsol, tokenMint, Math.floor(tokenAmount), poolInfo, 0, maxLamports, true, "out")
                                    transaction = raydiumRes.transaction;
                                } else {
                                    transaction = await getSwapTransaction(connection, wallet.publicKey, tokenMint, solanaConfig.wsol, Math.floor(tokenAmount), maxLamports, fileName, threadNumber, latestBlockhash.blockhash, poolType, closeInstruction)
                                }

                            }

                            transaction.sign([wallet]);
                            const rawTransaction = transaction.serialize()
                            const recentBlockhash = latestBlockhash.blockhash;
                            const lastValidBlockHeight = latestBlockhash.lastValidBlockHeight
                            const txid = await sendAndConfirmRawTransaction(connection, Buffer.from(rawTransaction), {
                                signature: base58.encode(transaction.signatures[0]),
                                blockhash: recentBlockhash,
                                lastValidBlockHeight: lastValidBlockHeight
                            }
                                , {
                                    skipPreflight: true,
                                    commitment: 'confirmed',
                                    maxRetries: solanaConfig.maxRetries
                                })

                            oldSolAmount = newSolAmount

                            printToFile(fileName, threadNumber, "sell token success", txid);
                            const txFee = await getTxFee(connection, txid)

                            printToFile(fileName, "sell token fee", txFee)

                            totalFailCount += count
                            totalFee += txFee

                            break
                        } catch (error) {
                            await sleep(1000)
                            count++
                            if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh
                            printToFile(fileName, threadNumber, "sell token error2", error)
                            continue
                        }
                    }
                }
            }

            await sendAllSol(connection, wallet, nextWallet.publicKey, fileName)
            await sendAllSol(connection, wallet, nextWallet.publicKey, fileName)
            await sendAllSol(connection, wallet, nextWallet.publicKey, fileName)

            printToFile(fileName, threadNumber, "sent all SOL")

            secretKey = nextWallet.secretKey

            const endTime = new Date().getTime()
            const totalTimeElapsed = endTime - startTime;
            const loopTimeEstimated = avgBetweenTime * (index + 1) + generateRandomNumber(0, 20 * 1000) - 10000
            const delayMs = loopTimeEstimated >= totalTimeElapsed ? (loopTimeEstimated - totalTimeElapsed) : 1
            const delay = Math.floor(delayMs)
            printToFile(fileName, threadNumber, index, "round ended in ", endTime - startLoopTime, delayMs)
            if (index != eachCount - 1) {
                await sleep(delay)
            }

            const boost: any = await supabase
                .from("Boosts")
                .select("*")
                .eq("id", boostId)
                .single();

            if (boost.data.boost_status == 1) {
                break;
            }

            if (endLoop || (!isHolders && startLoopTime > finishTime)) {
                break
            }

        }

        //send remaining sol to treasury
        const wallet = Keypair.fromSecretKey(secretKey);
        const lastBalance = await getBalance(wallet.publicKey, connection)

        const txid = await sendAllSol(connection, wallet, tempStoreWallet, fileName)
        printToFile(fileName, `sent ${threadNumber} thread SOL to deposit wallet`, txid?.txid || '')

        totalFailCount += txid?.count || 0;

        return { totalFailCount, lastBalance, totalFee, txCount: eachCount * 3 / 2 + 2, jitoSuccessCount, jitoFailCount }
    }
}



export const resumeBoostSolana = async (boostId: number, tokenMint: string, option: Package, depositWalletPrivateKey: string, poolType: string, walletsArray: TempWallets[], isTrending: boolean, boostStartTime: number, isJito: boolean, isHolders: boolean, treasuryWallet: string) => {
    const supabase = getSupabase()
    const connection = await getConnection()
    const fileName = solanaConfig.logPath + `${boostId}.log`
    const fileNameTempWallet = solanaConfig.logPath + `tempwallet_${boostId}.log`

    printToFile(fileName, "boost resumed", new Date().toUTCString())

    const mainWallet = Keypair.fromSecretKey(base58.decode(depositWalletPrivateKey))
    printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}w`)
    printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`)

    let poolInfo: any;
    if (poolType == '') {
        const poolId = await fetchMarketAccounts(connection, solanaConfig.wsol, tokenMint, "confirmed")
        if (!poolId) {
            printToFile(fileName, "Raydium Pool doesnt exist")
        } else {
            const poolData = await formatAmmKeysById(connection, poolId)
            poolInfo = jsonInfo2PoolKeys(poolData) as LiquidityPoolKeys
            printToFile(fileName, "Raydium Pool found", poolId)
        }
        return;
    }

    let walletCount = 1;

    if (isJito) {
        walletCount = Math.floor(option.txCountPerMin / solanaConfig.txnPerMinute) || 1
    }
    else walletCount = solanaConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3

    let totalFailCount = 0;
    let totalFee = 0;
    let totalSolRemaining = 0;
    let totalTxCount = 0;
    let jitoSuccessCount = 0;
    let jitoFailCount = 0;

    const boost: any = await supabase
        .from("Boosts")
        .select("*")
        .eq("id", boostId)
        .single();
    const mainThreads = walletsArray.map((wallets, i) => {
        const mainLogic = async () => {
            let avgBetweenTime = Math.floor((60 * 1000 * 2) * walletCount / option.txCountPerMin)
            if (isJito)
                avgBetweenTime = Math.floor((60 * 1000 * 3) * walletCount / option.txCountPerMin)

            await sleep(50 * i)
            const startWallet = Keypair.fromSecretKey(base58.decode(wallets.currentWallet));
            const nextWallet = Keypair.fromSecretKey(base58.decode(wallets.nextWallet));
            printToFile(fileName, `thread ${i} startwallet ${base58.encode(startWallet.secretKey)}s ${startWallet.publicKey.toBase58()}`)
            printToFile(fileNameTempWallet, `"${base58.encode(startWallet.secretKey)}",`)
            await insertOrUpdatePrivateKeys(boostId, i, base58.encode(startWallet.secretKey), base58.encode(nextWallet.secretKey))

            await sleep(avgBetweenTime / (walletCount + 1) * i)
            await sendAllSol(connection, nextWallet, startWallet.publicKey, fileName)

            const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000
            const resumeStartTime = new Date().getTime()
            const ret = await thread(base58.encode(startWallet.secretKey), connection, tokenMint, i, option, fileName, mainWallet.publicKey, poolType, boostId, isTrending, resumeStartTime, finishTime, fileNameTempWallet, boost.data.swap_amount, boost.data.deposit_amount, isJito, poolInfo, isHolders)
            totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0
            totalSolRemaining += ret?.lastBalance || 0
            totalFee += ret?.totalFee ? ret.totalFee : 0
            totalTxCount += ret?.txCount ? ret.txCount : 0
            jitoSuccessCount += ret?.jitoSuccessCount ? ret.jitoSuccessCount : 0
            jitoFailCount += ret?.jitoFailCount ? ret.jitoFailCount : 0
        }
        return mainLogic()
    });
    await Promise.all(mainThreads)

    const txid = await sendAllSol(connection, mainWallet, new PublicKey(treasuryWallet), fileName)
    printToFile(fileName, "sent all SOL to treasury wallet", txid?.txid || '')

    await sleep(1000)
    const endTime = new Date().getTime()
    printToFile(fileName, "time ellapsed", (endTime - boostStartTime) / 60 / 1000, "minute")
    printToFile(fileName, "total fail count", totalFailCount)
    printToFile(fileName, "total tx count", totalTxCount)
    printToFile(fileName, "starting sol", boost.data.deposit_amount)
    printToFile(fileName, "remaining sol", totalSolRemaining / LAMPORTS_PER_SOL)
    printToFile(fileName, "used sol", boost.data.deposit_amount - totalSolRemaining / LAMPORTS_PER_SOL)
    printToFile(fileName, "total transaction fee", totalFee / LAMPORTS_PER_SOL)
    printToFile(fileName, "jito success count", jitoSuccessCount)
    printToFile(fileName, "jito fail count", jitoFailCount)
    printToFile(fileName, "Bot finished", new Date(endTime).toUTCString())
    await supabase.from("Boosts")
        .update({ boost_status: 1 })
        .eq('id', boostId)
}