import { config, web3Config } from "../config";
import { Chain, Package, TempWallets } from "../types";
import {
  getBalance,
  isEvmAddress,
  getTokenBalance,
  getProvider,
  approve,
} from "./evmUtils";
import { getSupabase } from "./authUtil";
import {
  generateRandomNumber,
  insertOrUpdatePrivateKeys,
  printToFile,
  sleep,
  getRandomAmountForJito,
} from "./utils";
import { ethers, parseEther, parseUnits, Wallet } from "ethers";
import {
  getSwapTransactionWithBera,
  sendAllBera,
  sendBera,
  signAndSendBeraSwapTransactionV2,
  signAndSendBeraTransaction,
  SWAPROUTER02_ADDRESS,
} from "./beraUtils";

export const startMonitorAndBotBera = async (
  botName: string,
  boostId: number,
  tokenMint: string,
  originalOption: Package,
  depositWalletPrivateKey: string,
  referralWallet: string,
  referralId: number,
  chainName: Chain,
  dexParam: string,
  isTrending: boolean,
  isCustom: boolean,
  buyOnly: boolean,
  isRent: boolean,
  treasuryWallet: string
) => {
  const provider = getProvider(web3Config[chainName].rpc);
  const supabase = getSupabase();

  let boost: any = await supabase
    .from("Boosts")
    .select("*")
    .eq("id", boostId)
    .single();

  const fileName = config.logPath + `${boostId}.log`;
  const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`;
  const startTime = new Date().getTime();

  printToFile(
    fileName,
    "startMonitorAndBotBera",
    new Date(startTime).toUTCString()
  );

  const mainWallet = new Wallet(depositWalletPrivateKey, provider);
  let currentTime;

  // calculate deposit funds
  let totalFund = originalOption.totalFund;
  if (isCustom) {
    totalFund =
      boost.data.swap_amount *
      (web3Config[chainName].baseWalletCount *
        Math.floor(originalOption.txCountPerMin / 3) || 3);
    totalFund = Math.ceil((totalFund * 10) / 70) * 10;

    if(originalOption.txCountPerMin === 3) {
      totalFund = totalFund * 1.4;
    }
  }

  while (true) {
    await sleep(10 * 1000);
    currentTime = new Date().getTime();
    const balance = await getBalance(mainWallet.address, provider);

    if (balance >= ethers.parseEther(`${totalFund}`)) {
      //deposited
      printToFile(
        fileName,
        "deposit found",
        boostId,
        "deposit amount",
        balance,
        "bot name:",
        botName,
        "rental",
        isRent,
        "CA",
        tokenMint
      );
      boost = await supabase
        .from("Boosts")
        .update({
          payment_status: 1,
          deposit_amount: Number(ethers.formatEther(balance)),
          start_time: new Date().toISOString(),
        })
        .eq("id", boostId)
        .select("*")
        .single();
      break;
    }

    if (currentTime > startTime + config.MONITOR_SECONDS * 1000) {
      //expired
      printToFile(fileName, "boost expired", boostId);
      const result = await supabase
        .from("Boosts")
        .update({ payment_status: 2 })
        .eq("id", boostId);
      return;
    }
  }

  await sleep(3000);

  const option = {
    ...originalOption,
  };

  printToFile(fileName, "original option", JSON.stringify(originalOption));
  printToFile(fileName, "currnet option", JSON.stringify(option));
  const evmConfig = web3Config[chainName];
  //start
  const boostStartTime = new Date().getTime();

  let walletCount = 1;

  if (isTrending) {
    if (buyOnly)
      walletCount =
        Math.floor(option.txCountPerMin / evmConfig.txnPerMinuteTrending) || 1;
    else
      walletCount =
        Math.floor(
          option.txCountPerMin / (evmConfig.txnPerMinuteTrending * 2)
        ) || 1;
  } else {
    walletCount =
      evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3;
  }

  printToFile(fileName, "Bot started", new Date(boostStartTime).toUTCString());
  const balance = await getBalance(mainWallet.address, provider);

  const minFund =
    ((balance * BigInt(100 - evmConfig.referralPercent)) / BigInt(100) -
      ethers.parseEther(evmConfig.gasFee) * BigInt(2)) /
    BigInt(walletCount);
  let totalFailCount = 0;
  let totalFee = BigInt(0);
  let totalTxCount = 0;
  printToFile(fileName, "wallet count", walletCount);

  const refAmount = (balance * BigInt(evmConfig.referralPercent)) / BigInt(100);

  if (isEvmAddress(referralWallet) && !isRent) {
    const sendTx = await sendBera(
      provider,
      mainWallet,
      referralWallet,
      refAmount,
      fileName
    );
    printToFile(
      fileName,
      "sent to referral",
      ethers.formatEther(refAmount),
      sendTx?.txid
    );
    await supabase
      .from("Referrals")
      .update({ fund_earned: refAmount.toString() })
      .eq("id", referralId);
    await sleep(1000);
  }
  printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}xz`);
  printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`);
  const mainThreads = Array.from({ length: walletCount }, (v, i) => {
    const mainLogic = async () => {
      let avgBetweenTime = 0;
      if (isTrending) {
        avgBetweenTime = Math.floor(
          (60 * 1000 * 3 * walletCount) / option.txCountPerMin
        );
        await sleep((avgBetweenTime / walletCount) * i);
      } else {
        avgBetweenTime = Math.floor(
          (60 * 1000 * 2 * walletCount) / option.txCountPerMin
        );

        console.log("sleep time");
        console.log((avgBetweenTime / (walletCount + 1)) * i);
        await sleep((avgBetweenTime / (walletCount + 1)) * i);
      }

      const startWallet = Wallet.createRandom(provider);
      //await sleep(50 * i)
      await sleep(3000 * i);
      printToFile(
        fileName,
        `thread ${i} startwallet ${startWallet.privateKey}xz ${startWallet.address}`
      );
      printToFile(fileNameTempWallet, `"${startWallet.privateKey}",`);

      await sleep((avgBetweenTime / (walletCount + 1)) * i);
      await insertOrUpdatePrivateKeys(
        boostId,
        i,
        startWallet.privateKey,
        startWallet.privateKey
      );
      const txid = await sendBera(
        provider,
        mainWallet,
        startWallet.address,
        minFund,
        fileName
      );
      printToFile(fileName, i, "send bera success", txid?.txid);
      printToFile(
        fileName,
        i,
        "send bera fee",
        ethers.formatEther(txid?.txFee || BigInt(0))
      );
      totalFailCount += txid?.count || 0;
      totalFee += txid?.txFee || BigInt(0);

      const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000;

      const ret = await thread(
        startWallet.privateKey,
        provider,
        tokenMint,
        i,
        option,
        fileName,
        mainWallet.address,
        boostId,
        new Date().getTime(),
        finishTime,
        chainName,
        dexParam,
        fileNameTempWallet,
        boost.data.swap_amount,
        boost.data.deposit_amount,
        isTrending,
        isCustom,
        buyOnly
      );

      totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0;
      totalFee += ret?.totalFee ? ret.totalFee : BigInt(0);
      totalTxCount += ret?.txCount ? ret.txCount : 0;
    };
    return mainLogic();
  });

  await Promise.all(mainThreads);
  const totalFundRemaining = await getBalance(mainWallet.address, provider);

  const sendResObj = await sendAllBera(
    provider,
    mainWallet,
    treasuryWallet,
    fileName,
    0,
    chainName
  );
  printToFile(
    fileName,
    "sent all BASE to treasury wallet",
    sendResObj?.txid || ""
  );

  await sleep(1000);
  const endTime = new Date().getTime();
  printToFile(
    fileName,
    "time ellapsed",
    (endTime - boostStartTime) / 60 / 1000,
    "minute"
  );
  printToFile(fileName, "total fail count", totalFailCount);
  printToFile(fileName, "total tx count", totalTxCount);
  printToFile(
    fileName,
    "starting bera",
    parseFloat(ethers.formatEther(balance))
  );
  printToFile(fileName, "referral bera", ethers.formatEther(refAmount));
  printToFile(
    fileName,
    "remaining bera",
    ethers.formatEther(totalFundRemaining)
  );
  printToFile(
    fileName,
    "used bera",
    parseFloat(ethers.formatEther(balance)) -
      parseFloat(ethers.formatEther(refAmount)) -
      parseFloat(ethers.formatEther(totalFundRemaining))
  );
  printToFile(fileName, "total transaction fee", ethers.formatEther(totalFee));
  printToFile(fileName, "Bot finished", new Date(endTime).toUTCString());
  await supabase
    .from("Boosts")
    .update({
      boost_status: 1,
      finish_time: new Date().toISOString(),
      remaining_amount: parseFloat(ethers.formatEther(totalFundRemaining)),
    })
    .eq("id", boostId);
};

export const thread = async (
  startSecretKey: string,
  provider: ethers.JsonRpcProvider,
  tokenMint: string,
  threadNumber: number,
  option: Package,
  fileName: string,
  tempStoreWallet: string,
  boostId: number,
  startTime: number,
  finishTime: number,
  chainName: Chain,
  dexParam: string,
  fileNameTempWallet: string,
  swapAmount: number,
  depositAmount: number,
  isTrending: boolean,
  isCustom: boolean,
  buyOnly: boolean
) => {
  const totalCount = Math.floor(
    ((finishTime - startTime) / 60 / 1000) * option.txCountPerMin
  );
  const supabase = getSupabase();

  let walletCount = 1;
  let sendTxCount = 0;
  let swapTxCount = 0;

  const evmConfig = web3Config[chainName];

  if (isTrending) {
    if (buyOnly)
      walletCount =
        Math.floor(option.txCountPerMin / evmConfig.txnPerMinuteTrending) || 1;
    else
      walletCount =
        Math.floor(
          option.txCountPerMin / (evmConfig.txnPerMinuteTrending * 2)
        ) || 1;
  } else {
    walletCount =
      evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3;
  }
  const avgBetweenTime = Math.floor(
    (60 * 1000 * 2 * walletCount) / option.txCountPerMin
  );

  let eachCount = Math.floor(totalCount / walletCount);
  eachCount = eachCount % 2 == 0 ? eachCount : eachCount + 1;
  let totalFailCount = 0;
  let totalFee = BigInt(0);
  const startWallet = new Wallet(startSecretKey, provider);

  /*
  while (true) {
      try {
          await sleep(1000)
          const initialBeraAmount = await getBalance(startWallet.address, provider)
          if (initialBeraAmount == BigInt(0)) continue
          if (initialBeraAmount < (ethers.parseEther(`${evmConfig.gasFee}`))) {
              printToFile(fileName, threadNumber, "insufficient eth", ethers.formatEther(initialBeraAmount))
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
        const wallet = new Wallet(secretKey, provider);
        const nextWallet = Wallet.createRandom(provider);
        printToFile(
          fileName,
          `${threadNumber} next wallet ${nextWallet.privateKey}wd ${nextWallet.address}`
        );
        printToFile(fileNameTempWallet, `"${nextWallet.privateKey}",`);
        await insertOrUpdatePrivateKeys(
          boostId,
          threadNumber,
          wallet.privateKey,
          nextWallet.privateKey
        );

        let count = 0;
        let balanceCount = 0;
        const evmConfig = web3Config[chainName];

        while (true) {
          try {
            // to prevent not updating token balance
            await sleep(1000);

            const beraAmount = await getBalance(wallet.address, provider);
            const threadDepositAmount = ethers.parseEther(
              (depositAmount / walletCount).toFixed(18)
            );
            printToFile(
              fileName,
              threadNumber,
              index,
              "round, remaining bera",
              wallet.address,
              ethers.formatEther(beraAmount),
              `${(
                (Number(beraAmount) / Number(threadDepositAmount)) *
                100
              ).toFixed()}%`
            );

            const tokenAmount = await getTokenBalance(
              provider,
              wallet.address,
              tokenMint,
              fileName,
              threadNumber
            );
            if (tokenAmount > BigInt(0)) {
              printToFile(
                fileName,
                threadNumber,
                "token balance",
                wallet.address,
                tokenAmount
              );
              break;
            }

            if (balanceCount > 10) {
              printToFile(
                fileName,
                threadNumber,
                "insufficient buy eth",
                ethers.formatEther(beraAmount)
              );
              endLoop = true;
              break;
            }

            if (
              beraAmount < ethers.parseEther(evmConfig.gasFee) * BigInt(2) &&
              beraAmount > ethers.parseEther(evmConfig.gasFee)
            ) {
              balanceCount++;
              continue;
            }
            if (beraAmount <= ethers.parseEther(evmConfig.gasFee)) {
              balanceCount++;
              continue;
            }

            if (
              beraAmount <=
              BigInt(
                Math.floor(
                  (Number(threadDepositAmount) *
                    evmConfig.profitTrendingPercent) /
                    100
                )
              )
            ) {
              endLoop = true;
              break;
            }
            
            // console.log(
            //   fileName,
            //   threadNumber,
            //   "token amount tracking",
            //   parseEther(option.maxSwap.toFixed(18)).toString()
            // );
            // printToFile(
            //   fileName,
            //   threadNumber,
            //   "token amount tracking",
            //   parseEther(option.maxSwap.toFixed(18)).toString()
            // );

            const swapResult: any = await getSwapTransactionWithBera(
              evmConfig.eth,
              tokenMint,
              wallet.address,
              parseEther(option.maxSwap.toFixed(18)).toString(),
              chainName,
              threadNumber,
              fileName,
              provider
            );

            const swapTxHash = await signAndSendBeraTransaction(
              swapResult,
              wallet,
              threadNumber,
              fileName,
              provider
            );
            if (swapTxHash.txid == "unknown") {
              continue;
            }
            printToFile(
              fileName,
              threadNumber,
              "buy token success",
              swapTxHash.txid
            );
            loopTxnCount++;
            swapTxCount++;

            break;
          } catch (error) {
            await sleep(1000);
            totalFailCount += count;
            printToFile(fileName, threadNumber, "buy token error", error);
            count++;
            continue;
          }
        }

        await sleep(1000);

        const tokenAmount = await getTokenBalance(
          provider,
          wallet.address,
          tokenMint,
          fileName,
          threadNumber
        );
        printToFile(
          fileName,
          threadNumber,
          "token balance",
          tokenAmount.toString()
        );

        // send token to treasury wallet
        if (tokenAmount > BigInt(0)) {
          if (!buyOnly) {
            try {
              await approve(
                wallet,
                SWAPROUTER02_ADDRESS,
                tokenMint,
                tokenAmount,
                fileName,
                threadNumber
              );

              // console.log(
              //   fileName,
              //   threadNumber,
              //   "token amount tracking 2",
              //   tokenAmount.toString()
              // );
              // printToFile(
              //   fileName,
              //   threadNumber,
              //   "token amount tracking 2",
              //   tokenAmount.toString()
              // );

              const transaction: any = await getSwapTransactionWithBera(
                tokenMint,
                evmConfig.eth,
                wallet.address,
                tokenAmount.toString(),
                chainName,
                threadNumber,
                fileName,
                provider
              );
              const swapTxHash = await signAndSendBeraTransaction(
                transaction,
                wallet,
                threadNumber,
                fileName,
                provider
              );
              printToFile(fileName, threadNumber, "sell token success");
            } catch (error) {
              printToFile(fileName, threadNumber, "sell token error", error);
            }
          } else {
          }
        }

        if (endLoop) break;

        while (true) {
          await sleep(2000);
          const txid = await sendAllBera(
            provider,
            wallet,
            nextWallet.address,
            fileName,
            threadNumber,
            chainName
          );
          printToFile(fileName, threadNumber, "sent all eth", txid?.txid);
          totalFee += txid?.txFee || BigInt(0);
          sendTxCount++;
          break;
        }

        secretKey = nextWallet.privateKey;
      }

      const endRoundDate = new Date();
      await sleep(
        startRoundDate.getTime() + delayTime - endRoundDate.getTime()
      );
      printToFile(
        fileName,
        threadNumber,
        `${index} round txn count ${loopTxnCount} per minute`
      );
      printToFile(
        fileName,
        threadNumber,
        `${index} round time ${
          performance.now() - startMilliseconds
        } milliseconds.`
      );

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
      const startLoopTime = new Date().getTime();
      const startMilliseconds = performance.now();
      let loopTxnCount = 0;

      const wallet = new Wallet(secretKey, provider);
      const nextWallet = Wallet.createRandom(provider);
      printToFile(
        fileName,
        `${threadNumber} next wallet ${nextWallet.privateKey}wd ${nextWallet.address}`
      );
      printToFile(fileNameTempWallet, `"${nextWallet.privateKey}",`);

      await insertOrUpdatePrivateKeys(
        boostId,
        threadNumber,
        wallet.privateKey,
        nextWallet.privateKey
      );

      //buy sell
      let oldBeraAmount = BigInt(0);
      {
        let count = 0;
        let balanceCount = 0;
        const evmConfig = web3Config[chainName];

        while (true) {
          try {
            // to prevent not updating token balance
            await sleep(1000);
            const tokenAmount = await getTokenBalance(
              provider,
              wallet.address,
              tokenMint,
              fileName,
              threadNumber
            );
            if (tokenAmount > BigInt(0)) {
              printToFile(
                fileName,
                threadNumber,
                "token balance",
                wallet.address,
                tokenAmount
              );
              break;
            }

            const beraAmount = await getBalance(wallet.address, provider);
            const threadDepositAmount = ethers.parseEther(
              (depositAmount / walletCount).toFixed(18)
            );
            printToFile(
              fileName,
              threadNumber,
              index,
              "round, remaining bera",
              wallet.address,
              ethers.formatEther(beraAmount),
              `${(
                (Number(beraAmount) / Number(threadDepositAmount)) *
                100
              ).toFixed()}%`
            );

            if (balanceCount > 10) {
              printToFile(
                fileName,
                threadNumber,
                "insufficient buy eth",
                ethers.formatEther(beraAmount)
              );
              return {
                totalFailCount,
                beraAmount,
                totalFee,
                txCount: index * 2 + 2,
              };
            }

            if (
              beraAmount < ethers.parseEther(evmConfig.gasFee) * BigInt(2) &&
              beraAmount > ethers.parseEther(evmConfig.gasFee)
            ) {
              balanceCount++;
              continue;
            }
            if (beraAmount <= ethers.parseEther(evmConfig.gasFee)) {
              balanceCount++;
              continue;
            }

            if (
              isCustom &&
              beraAmount <=
                BigInt(
                  Math.floor(
                    (Number(threadDepositAmount) *
                      evmConfig.profitVolumePercent) /
                      100
                  )
                )
            ) {
              endLoop = true;
              break;
            }

            oldBeraAmount = beraAmount;

            let randomBuyAmount = 0;

            if (isCustom) randomBuyAmount = getRandomAmountForJito(swapAmount);
            else
              randomBuyAmount = generateRandomNumber(
                option.minSwap,
                option.maxSwap
              );

            const minBuyAmount =
            beraAmount - ethers.parseEther(evmConfig.gasFee) * BigInt(2);

            const buyBeraAmount = buyOnly
              ? ethers.parseEther(option.maxSwap.toFixed(18))
              : ethers.parseEther(randomBuyAmount.toFixed(18)) > minBuyAmount
              ? minBuyAmount
              : ethers.parseEther(randomBuyAmount.toFixed(18));

            if (buyBeraAmount < BigInt(0)) {
              endLoop = true;
              break;
            }
            
            // console.log(
            //   fileName,
            //   threadNumber,
            //   "token amount tracking 3",
            //   buyBeraAmount.toString()
            // );
            // printToFile(
            //   fileName,
            //   threadNumber,
            //   "token amount tracking 3",
            //   buyBeraAmount.toString()
            // );

            const swapResult: any = await getSwapTransactionWithBera(
              evmConfig.eth,
              tokenMint,
              wallet.address,
              buyBeraAmount.toString(),
              chainName,
              threadNumber,
              fileName,
              provider
            );
            const swapTxHash = await signAndSendBeraTransaction(
              swapResult,
              wallet,
              threadNumber,
              fileName,
              provider
            );
            if (swapTxHash.txid == "unknown") {
              continue;
            }
            printToFile(
              fileName,
              threadNumber,
              "buy token success",
              swapTxHash.txid
            );
            printToFile(
              fileName,
              threadNumber,
              "buy token fee",
              ethers.formatEther(swapTxHash.txFee)
            );

            // totalFee += result.data.txFee
            break;
          } catch (error) {
            await sleep(1000);
            totalFailCount += count;
            printToFile(fileName, threadNumber, "buy token error", error);
            count++;
            continue;
          }
        }

        if (endLoop) break;

        const curTime = new Date().getTime();
        const ellapsedTime = curTime - startLoopTime;
        const delayTime =
          avgBetweenTime / walletCount - ellapsedTime > 0
            ? avgBetweenTime / 3 - ellapsedTime
            : 1;
        await sleep(delayTime);
        //sell token
        count = 0;
        // buyOnly is a setting in the package table.  When true we skip the sell logic

        let tokenBalanceCount = 0;
        let compareAmountCount = 0;
        while (true) {
          try {
            await sleep(1000);
            const newBeraAmount = await getBalance(wallet.address, provider);
            // if (newSuiAmount == oldSuiAmount && oldSuiAmount > 0 && compareAmountCount < 5) {
            //     compareAmountCount++;
            //     continue
            // }
            const tokenAmount = await getTokenBalance(
              provider,
              wallet.address,
              tokenMint,
              fileName,
              threadNumber
            );
            printToFile(
              fileName,
              threadNumber,
              "token balance",
              tokenAmount.toString()
            );

            if (tokenBalanceCount > 10) {
              printToFile(fileName, threadNumber, "tokenBalanceCount exceed");
              break;
            }
            if (tokenAmount == BigInt(0)) {
              tokenBalanceCount++;
              continue;
            }

            if (newBeraAmount <= ethers.parseEther(evmConfig.gasFee)) {
              printToFile(
                fileName,
                threadNumber,
                "insufficient sell bera",
                ethers.formatEther(newBeraAmount)
              );
              tokenBalanceCount++;
              continue;
            }
            await approve(
              wallet,
              SWAPROUTER02_ADDRESS,
              tokenMint,
              tokenAmount,
              fileName,
              threadNumber
            );

            // console.log(
            //   fileName,
            //   threadNumber,
            //   "token amount tracking 4",
            //   tokenAmount.toString()
            // );
            // printToFile(
            //   fileName,
            //   threadNumber,
            //   "token amount tracking 4",
            //   tokenAmount.toString()
            // );
            console.log("aaaa");

            const swapResult: any = await getSwapTransactionWithBera(
              tokenMint,
              evmConfig.eth,
              wallet.address,
              tokenAmount.toString(),
              chainName,
              threadNumber,
              fileName,
              provider
            );

            const signTransaction: any = await signAndSendBeraSwapTransactionV2(
              swapResult.amount,
              tokenMint,
              swapResult.quote,
              evmConfig.eth,
              wallet,
              threadNumber,
              fileName,
              provider
            );
            
console.log(signTransaction);

            if (signTransaction.txid == "unknown") {
              continue;
            }

            oldBeraAmount = newBeraAmount;
            printToFile(
              fileName,
              threadNumber,
              "sell token success",
              signTransaction.txid
            );
            loopTxnCount++;
            swapTxCount++;

            break;
          } catch (error) {
            await sleep(1000);
            totalFailCount += count;
            count++;
            printToFile(fileName, threadNumber, "sell token error", error);
          }
        }
        if (endLoop) break;
      }

      while (true) {
        await sleep(2000);
        const txid = await sendAllBera(
          provider,
          wallet,
          nextWallet.address,
          fileName,
          threadNumber,
          chainName
        );
        printToFile(fileName, threadNumber, "sent all bera", txid?.txid);
        sendTxCount++;
        totalFee += txid?.txFee || BigInt(0);

        break;
      }

      secretKey = nextWallet.privateKey;

      const endTime = new Date().getTime();
      const totalTimeElapsed = endTime - startTime;
      const loopTimeEstimated =
        avgBetweenTime * (index + 1) +
        generateRandomNumber(0, 20 * 1000) -
        10000;
      const delayMs =
        loopTimeEstimated >= totalTimeElapsed
          ? loopTimeEstimated - totalTimeElapsed
          : 1;
      const delay = Math.floor(delayMs);

      printToFile(
        fileName,
        threadNumber,
        `${index} round txn count ${loopTxnCount} per minute`
      );
      printToFile(
        fileName,
        threadNumber,
        `${index} round time ${
          performance.now() - startMilliseconds
        } milliseconds.`
      );

      if (index != eachCount - 1) {
        await sleep(delay);
      }

      if (!isCustom && startLoopTime > finishTime) {
        break;
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

  //send remaining bera to treasury
  const wallet = new Wallet(secretKey, provider);

  const txid = await sendAllBera(
    provider,
    wallet,
    tempStoreWallet,
    fileName,
    threadNumber,
    chainName
  );
  printToFile(
    fileName,
    `sent ${threadNumber} thread BASE to deposit wallet`,
    txid?.txid || ""
  );

  totalFailCount += txid?.count || 0;
  totalFee += txid?.txFee || BigInt(0);

  return { totalFailCount, totalFee, swapTxCount, sendTxCount };
};

export const resumeBoostBera = async (
  boostId: number,
  tokenMint: string,
  option: Package,
  depositWalletPrivateKey: string,
  walletsArray: TempWallets[],
  boostStartTime: number,
  chainName: Chain,
  dexParam: string,
  isTrending: boolean,
  isCustom: boolean,
  buyOnly: boolean,
  treasuryWallet: string
) => {
  const evmConfig = web3Config[chainName];
  const supabase = getSupabase();
  const provider = getProvider(evmConfig.rpc);
  const fileName = config.logPath + `${boostId}.log`;
  const fileNameTempWallet = config.logPath + `tempwallet_${boostId}.log`;
  printToFile(fileName, "boost resumed", new Date().toUTCString());

  const mainWallet = new Wallet(depositWalletPrivateKey, provider);
  printToFile(fileName, "deposit wallet", `${depositWalletPrivateKey}w`);
  printToFile(fileNameTempWallet, `"${depositWalletPrivateKey}",`);

  let walletCount = 1;

  if (isTrending) {
    if (buyOnly)
      walletCount =
        Math.floor(option.txCountPerMin / evmConfig.txnPerMinuteTrending) || 1;
    else
      walletCount =
        Math.floor(
          option.txCountPerMin / (evmConfig.txnPerMinuteTrending * 2)
        ) || 1;
  } else {
    walletCount =
      evmConfig.baseWalletCount * Math.floor(option.txCountPerMin / 3) || 3;
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
        avgBetweenTime = Math.floor(
          (60 * 1000 * 3 * walletCount) / option.txCountPerMin
        );
        await sleep((avgBetweenTime / walletCount) * i);
      } else {
        avgBetweenTime = Math.floor(
          (60 * 1000 * 2 * walletCount) / option.txCountPerMin
        );
        await sleep((avgBetweenTime / (walletCount + 1)) * i);
      }
      const startWallet = new Wallet(wallets.currentWallet, provider);
      const nextWallet = new Wallet(wallets.nextWallet, provider);

      printToFile(
        fileName,
        `thread ${i} startwallet ${startWallet.privateKey}s ${startWallet.address}`
      );
      printToFile(fileNameTempWallet, `"${startWallet.privateKey}",`);
      await sleep((avgBetweenTime / walletCount) * i);
      await insertOrUpdatePrivateKeys(
        boostId,
        i,
        startWallet.privateKey,
        nextWallet.privateKey
      );

      await sendAllBera(
        provider,
        nextWallet,
        startWallet.address,
        fileName,
        i,
        chainName
      );

      const finishTime = boostStartTime + option.totalDay * 24 * 3600 * 1000;
      const resumeStartTime = new Date().getTime();
      const ret = await thread(
        startWallet.privateKey,
        provider,
        tokenMint,
        i,
        option,
        fileName,
        mainWallet.address,
        boostId,
        resumeStartTime,
        finishTime,
        chainName,
        dexParam,
        fileNameTempWallet,
        boost.data.swap_amount,
        boost.data.deposit_amount,
        isTrending,
        isCustom,
        buyOnly
      );

      (totalFailCount += ret?.totalFailCount ? ret.totalFailCount : 0),
        (totalFee += ret?.totalFee ? ret.totalFee : BigInt(0));
      totalTxCount += ret?.txCount ? ret.txCount : 0;
    };
    return mainLogic();
  });
  await Promise.all(mainThreads);
  const totalFundRemaining = await getBalance(mainWallet.address, provider);

  const sendResObj = await sendAllBera(
    provider,
    mainWallet,
    treasuryWallet,
    fileName,
    0,
    chainName
  );
  printToFile(
    fileName,
    "sent all Bera to treasury wallet",
    sendResObj?.txid || ""
  );

  await sleep(1000);
  const refAmount =
    (ethers.parseEther(`${option.totalFund}`) *
      BigInt(evmConfig.referralPercent)) /
    BigInt(100);

  const endTime = new Date().getTime();
  printToFile(
    fileName,
    "time ellapsed",
    (endTime - boostStartTime) / 60 / 1000,
    "minute"
  );
  printToFile(fileName, "total fail count", totalFailCount);
  printToFile(fileName, "total tx count", totalTxCount);
  printToFile(fileName, "starting bera", boost.data.deposit_amount);
  printToFile(fileName, "referral bera", ethers.formatEther(refAmount));
  printToFile(
    fileName,
    "remaining bera",
    ethers.formatEther(totalFundRemaining)
  );
  printToFile(
    fileName,
    "used bera",
    boost.data.deposit_amount -
      parseFloat(ethers.formatEther(refAmount)) -
      parseFloat(ethers.formatEther(totalFundRemaining))
  );
  printToFile(fileName, "total transaction fee", ethers.formatEther(totalFee));
  printToFile(fileName, "Bot finished", new Date(endTime).toUTCString());
  await supabase.from("Boosts").update({ boost_status: 1 }).eq("id", boostId);
};
