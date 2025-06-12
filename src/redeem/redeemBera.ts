import {
  getBalance,
  getProvider,
  getTokenBalance,
  sendAllEth,
  sendToken,
  sendEth,
  approve,
  signAndSendTransaction,
} from "../lib/evmUtils";
import wallets from "../../tempWalletsBera.json";
import base58 from "bs58";
import { config, web3Config } from "../config";
import { parseEther, Wallet } from "ethers";
import { Chain } from "../types";

import { startMonitorAndBotBera } from "../lib/beraMain";
import {
  getSwapTransactionWithBera,
  sendAllBera,
  signAndSendBeraSwapTransactionV2,
  signAndSendBeraTransaction,
  SWAPROUTER02_ADDRESS,
  UNISWAPV2ROUTER02_ADDRESS,
} from "../lib/beraUtils";

async function main() {
  const chainName: Chain = "bera";
  const evmConfig = web3Config[chainName];
  const provider: any = getProvider(evmConfig.rpc);
  const fileName = config.logPath + `redeemBera.log`;
  const tokenMintString = "0x8F06863DF59A042bCc2c86cC8cA1709ec1EE316b"; // BM Token

  const redeemWalletAddress = "0xCEfB1791df4008c44349aA6040453B2b5449D23E";
  const redeemPk = atob(
    "ODc5YzI4YTdmM2ExZjg0MTI5MDMzMjc2OThiYTdkOWZhMTdkZDU4M2I3MDEzYWQ3NGEwNzA5NWNlYzliNzY4Yw=="
  );

  const redeemWallet = new Wallet(redeemPk, provider);
  const testWalletAddress = "0xa083536028766c273DC143fC7BF2De48adf4BD65";
  const testWalletPk = atob(
    "ZThiOTgxYTVlNjM3ZTZkMTRiMWFiNDhhYTRmMzg4NjkyY2Q4YzU1NmM5ZDlhNGExMDIxM2I4NTg3N2NjNTc5NA=="
  );
  const testWallet = new Wallet(testWalletPk, provider);

  // startMonitorAndBotBera(
  //   "Bera",
  //   389,
  //   tokenMintString,
  //   {
  //     maxSwap: 1,
  //     minSwap: 1,
  //     totalDay: 1,
  //     totalFund: 100,
  //     txCountPerMin: 3,
  //   },
  //   redeemPk,
  //   testWalletAddress,
  //   1,
  //   "bera",
  //   "",
  //   false,
  //   true,
  //   false,
  //   false,
  //   evmConfig.treasuryPubkey
  // );

  // await sendEth(provider, redeemWallet, '0xAf735656b13703A1FA87C8efA272E91e4F767439', parseEther('0.0001'), fileName)

  // // redeem volume boost
  for (let index = 0; index < wallets.length; index++) {
      const element = wallets[index];
      const wallet = new Wallet(element, provider)
      const balance = await getBalance(wallet.address, provider)
      const tokenBalance = await getTokenBalance(provider, wallet.address, tokenMintString, fileName, index, "v2")
      console.log("index", index, element)
      console.log("tokenBalance", wallet.privateKey, wallet.address, tokenBalance.toString())
      console.log("balance", wallet.address, balance.toString())
      if (tokenBalance > BigInt(0)) {
          if (balance <= parseEther(evmConfig.gasFee)) {
              await sendAllEth(provider, redeemWallet, wallet.address, fileName, index, chainName)
          }
          await sendToken(wallet, redeemWalletAddress, tokenMintString, tokenBalance, fileName, index)
      }
      await sendAllEth(provider, wallet, redeemWalletAddress, fileName, index, chainName)
  }

 // redeem trending boost
  // for (let index = 0; index < wallets.length; index++) {
  //   const element = wallets[index];
  //   const wallet = new Wallet(element, provider);
  //   const balance = await getBalance(wallet.address, provider);

  //   if (balance > parseEther("0.00001")) {
  //     console.log("balance", wallet.address, balance.toString());
  //     await sendAllEth(
  //       provider,
  //       wallet,
  //       redeemWalletAddress,
  //       fileName,
  //       index,
  //       chainName
  //     );
  //   }
  // }

  for (let i = 0; i < 10; i++) {
    // await sendAllBera(
    //   provider,
    //   redeemWallet,
    //   testWalletAddress,
    //   fileName,
    //   0,
    //   "bera"
    // );
    // await sendAllBera(
    //   provider,
    //   testWallet,
    //   redeemWalletAddress,
    //   fileName,
    //   0,
    //   "bera"
    // );
    // const swapResult: any = await getSwapTransactionWithBera(
    //   tokenMintString,
    //   evmConfig.eth,
    //   redeemWalletAddress,
    //   parseEther("10").toString(),
    //   chainName,
    //   0,
    //   fileName,
    //   provider
    // );
   // console.log("swapResult", swapResult);
    // await approve(
    //   redeemWallet,
    //   SWAPROUTER02_ADDRESS,
    //   tokenMintString,
    //   parseEther("10"),
    //   fileName,
    //   0
    // );
    // const swapTxHash = await signAndSendBeraTransaction(
    //   swapResult,
    //   redeemWallet,
    //   0,
    //   fileName,
    //   provider
    // );
    // console.log(swapTxHash);
    // const swapTxHash = await signAndSendBeraSwapTransactionV2(
    //   swapResult.amount,
    //   tokenMintString,
    //   swapResult.quote,
    //   "0x6969696969696969696969696969696969696969",
    //   redeemWallet,
    //   0,
    //   fileName,
    //   provider
    // );
    // console.log(swapTxHash);
  }
}

main();
