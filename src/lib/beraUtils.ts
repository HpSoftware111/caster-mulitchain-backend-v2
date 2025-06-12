import { web3Config } from "../config";
import { Chain } from "../types";
import { printToFile, sleep } from "./utils";
import {
  Contract,
  ethers,
  Wallet,
  FixedNumber,
  JsonRpcProvider,
  TransactionResponse,
  parseEther,
  formatEther,
  Transaction,
} from "ethers";
import WBERA_ABI from "./abis/WBERA.json";
export const MAX_FEE_PER_GAS = 100000000000;
export const MAX_PRIORITY_FEE_PER_GAS = 100000000000;
export const TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER = 10000;

// https://documentation.kodiak.finance/developers/quotes
export const SWAPROUTER02_ADDRESS =
  "0xe301E48F77963D3F7DbD2a4796962Bd7f3867Fb4";
export const UNISWAPV2ROUTER02_ADDRESS =
  "0xd91dd58387Ccd9B66B390ae2d7c66dBD46BC6022";
export enum TransactionState {
  Failed = "Failed",
  New = "New",
  Rejected = "Rejected",
  Sending = "Sending",
  Sent = "Sent",
}

export const getProvider = (rpc: string) => {
  return new ethers.JsonRpcProvider(rpc);
};

export const poolExistsBera = async (
  tokenMint: string,
  chainName: Chain,
  poolType: string,
  provider: JsonRpcProvider
) => {
  const evmConfig = web3Config[chainName];
  const chainId = evmConfig.chainId;
  const SWAP_API_URL = new URL(
    process.env.KODIAK_API_URL || "https://api.kodiak.finance/quote"
  );

  // TokenA & TokenB
  const inputCurrency = tokenMint;
  const outputCurrency = evmConfig.eth;

  // Params
  const protocol = "v2"; // v2,v3,mixed
  const tokenInChainId = chainId;
  const tokenOutChainId = chainId;
  const type = "exactIn";
  const deadline = 1000;
  const slippageTolerance = 5;

  // Amount
  const amount = 100000000000000000;

  // Gas Price
  try {
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice!;

    const { searchParams } = SWAP_API_URL;

    searchParams.set("protocols", protocol);
    searchParams.set("tokenInAddress", inputCurrency);
    searchParams.set("tokenInChainId", tokenInChainId.toString());
    searchParams.set("tokenOutAddress", outputCurrency);
    searchParams.set("tokenOutChainId", tokenOutChainId.toString());
    searchParams.set("amount", amount.toString());
    searchParams.set("type", type);
    searchParams.set("recipient", evmConfig.treasuryPubkey);
    searchParams.set("deadline", deadline.toString());
    searchParams.set("slippageTolerance", slippageTolerance.toString());

    // Make call to API
    console.log(SWAP_API_URL.toString());
    const res = await fetch(SWAP_API_URL.toString());
    const data = await res.json();
    console.log(data);

    // const { tx } = data;

    if (data && data.blockNumber) {
      console.log("pool exists ==================");
      return true;
    } else {
      return false;
    }
  } catch (e) {
    console.log("Bera quote error: ", e);
    return false;
  }
};

export const getBalance = async (
  address: string,
  provider: JsonRpcProvider
) => {
  while (true) {
    try {
      const balanceWei = await provider.getBalance(address);
      return balanceWei;
    } catch (error) {
      await sleep(1000);
    }
  }
};

export const getSwapTransactionWithBera = async (
  inputCurrencyToken: string,
  outputCurrencyToken: string,
  address: string,
  amount: string,
  chainName: Chain,
  threadNumber: number,
  fileName: string,
  provider: JsonRpcProvider
): Promise<any> => {
  while (true) {
    try {
      printToFile(
        fileName,
        threadNumber,
        "getSwapTransactionWithBera",
        new Date().getTime()
      );

      const evmConfig = web3Config[chainName];
      const SWAP_API_URL = new URL(
        process.env.KODIAK_API_URL || "https://api.kodiak.finance/quote"
      );

      const inputCurrency = inputCurrencyToken;
      const outputCurrency = outputCurrencyToken;

      // Params
      const protocol = "v2"; // v2,v3,mixed
      const tokenInChainId = evmConfig.chainId;
      const tokenOutChainId = evmConfig.chainId;
      const type = "exactIn";
      const deadline = 1000;
      const slippageTolerance = 3;

      // Gas Price
      // const feeData = await provider.getFeeData();
      // const gasPrice = feeData.gasPrice!;

      const { searchParams } = SWAP_API_URL;

      searchParams.set("protocols", protocol);
      searchParams.set("tokenInAddress", inputCurrency);
      searchParams.set("tokenInChainId", tokenInChainId.toString());
      searchParams.set("tokenOutAddress", outputCurrency);
      searchParams.set("tokenOutChainId", tokenOutChainId.toString());
      searchParams.set("amount", amount.toString());
      searchParams.set("type", type);
      searchParams.set("recipient", address);
      searchParams.set("deadline", deadline.toString());
      searchParams.set("slippageTolerance", slippageTolerance.toString());

      //console.log(SWAP_API_URL.toString());

      // Make call to API
      const res = await fetch(SWAP_API_URL.toString());
      const data = await res.json();
      printToFile(
        fileName,
        threadNumber,
        "build swap getSwapTransactionWithBera success"
      );
      return data;
    } catch (error) {
      await sleep(3000);
      printToFile(
        fileName,
        threadNumber,
        "build swap getSwapTransactionWithBera" + error
      );
    }
  }
};

export const sendAllBera = async (
  provider: JsonRpcProvider,
  from: Wallet,
  to: string,
  fileName: string,
  threadNumber: number,
  chainName: Chain
) => {
  const evmConfig = web3Config[chainName];
  let count = evmConfig.sendAllEthCount;
  while (true) {
    try {
      const gasLimit = await provider.estimateGas({});
      // Get the balance of the sender's address
      const balanceBera = await getBalance(from.address, provider);
      printToFile(
        fileName,
        threadNumber,
        "Bera balance",
        from.address,
        balanceBera
      );
      if (balanceBera == BigInt(0)) {
        printToFile(fileName, "insufficient balance 0 bera error");
        return;
      }
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice!;

      // Calculate the total transaction cost
      // let gasCost = BigInt(0)
      // if (chainName == "base") {
      //     gasCost = gasPrice * gasLimit * BigInt(count * 100) / BigInt(100);
      // }
      // else {
      //     gasCost = gasPrice * gasLimit * BigInt(count * 100) / BigInt(100);
      // }

      let gasCost = parseEther(
        (evmConfig.sendAllEthGasFee * count).toFixed(18)
      );
      if (balanceBera <= gasCost) {
        printToFile(
          fileName,
          threadNumber,
          "insufficient bera",
          balanceBera,
          gasCost
        );
        return;
      }

      // Calculate the amount of ETH to send so balance is zero after the transaction
      const amountToSend = balanceBera - gasCost;
      printToFile(
        fileName,
        threadNumber,
        "send bera balanceBera",
        formatEther(amountToSend.toString())
      );

      printToFile(fileName, threadNumber, "send bera gasCost", gasCost);

      const txParams = {
        from: from.address,
        to: to,
        value: amountToSend,
        gasPrice: gasPrice,
        gasLimit: gasLimit,
      };

      // Send the transaction and wait for confirmation
      const tx = await from.sendTransaction(txParams);
      // Wait for the transaction to be confirmed
      printToFile(fileName, threadNumber, "build tx", tx.hash);
      const receipt = await tx.wait(1, 60000);
      // The transaction has been confirmed
      printToFile(fileName, threadNumber, "send all bera success", tx.hash);
      return { txid: tx.hash, count, txFee: receipt?.fee || BigInt(0) };
    } catch (error) {
      await sleep(1000);
      const balanceWei = await getBalance(from.address, provider);
      printToFile(
        fileName,
        threadNumber,
        "send all bera error",
        from.address,
        balanceWei.toString(),
        error
      );
      if (count < 11) {
        count++;
      }
      continue;
    }
  }
};

export const sendBera = async (
  provider: JsonRpcProvider,
  from: Wallet,
  to: string,
  amount: bigint,
  fileName: string
) => {
  let count = 0;
  while (true) {
    try {
      const gasLimit = await provider.estimateGas({});
      // Get the balance of the sender's address
      const balanceWei = await getBalance(from.address, provider);
      if (balanceWei == BigInt(0)) {
        printToFile(fileName, "insufficient balance 0 eth error");
        return;
      }
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice!;

      // Calculate the total transaction cost
      //const gasCost = gasPrice * BigInt(gasLimit) * BigInt(200) / BigInt(100);

      //const gasCost = gasPrice * gasLimit * BigInt(count + 1);

      const gasCost = parseEther(web3Config.base.gasFee);

      if (balanceWei < gasCost + amount) {
        printToFile(
          fileName,
          "insufficient balance eth error",
          balanceWei,
          feeData,
          amount
        );
        return;
      }

      // Create a transaction object
      const txParams = {
        from: from.address,
        to: to,
        value: amount,
        //gasPrice: gasPrice,
        gas: gasCost,
      };

      // Send the transaction and wait for confirmation
      const tx = await from.sendTransaction(txParams);

      // Wait for the transaction to be confirmed
      const receipt = await tx.wait(1, 60000);
      // The transaction has been confirmed
      return { txid: tx.hash, count, txFee: receipt?.fee || BigInt(0) };
    } catch (error) {
      await sleep(1000);
      printToFile(fileName, "send eth error", error);
      if (count < 3) {
        count++;
      }
      continue;
    }
  }
};

export function isEvmAddress(address: string) {
  try {
    const addr = ethers.getAddress(address.toLowerCase());
    return true;
  } catch (error) {
    return false;
  }
}

// function addTenPercent(bigIntValue: bigint) {
//   let percentageIncrease = 10n; // 10%
//   let newValue = (bigIntValue * (100n + percentageIncrease)) / 100n;
//   return newValue;
// }

// Sign and post a transaction, return its hash
export async function signAndSendBeraTransaction(
  transaction: any,
  wallet: Wallet,
  threadNumber: number,
  fileName: string,
  provider: JsonRpcProvider
) {
  let failCount = 0;
  console.log("signAndSendBeraTransaction");
  while (true) {
    try {
      const gasLimit = await provider.estimateGas({
        ...transaction,
        from: wallet.address,
      });

      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice!;
      //const gasCost = gasLimit * gasPrice;

      printToFile(
        fileName,
        threadNumber,
        "signAndSendBeraTransaction info",
        "gasLimit: " +
          gasLimit.toString() +
          " value: " +
          transaction.amount.toString() +
          " maxFeePerGas: " +
          feeData?.maxFeePerGas?.toString() +
          " maxPriorityFeePerGas: " +
          feeData?.maxPriorityFeePerGas?.toString() +
          " gasLmi: " +
          feeData?.maxPriorityFeePerGas?.toString()
      );


      const tx = await wallet.sendTransaction({
        data: transaction.methodParameters.calldata,
        to: SWAPROUTER02_ADDRESS,
        value: parseEther(transaction.amountDecimals).toString(),
        from: wallet.address,
        gasLimit: 200000, //Hard coding this,  the estimatess are way too low from provider. addTenPercent(gasLimit), //Gas Limit
        maxFeePerGas: feeData?.maxFeePerGas,
        maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas,
        // nonce: nonce2,
        type: 2,
      });

      const receipt = await tx.wait();

      const txFee = receipt?.gasUsed || BigInt(0);

      return {
        txid: tx.hash,
        txFee,
        count: failCount,
      };
    } catch (error) {

      await sleep(1000);
      printToFile(
        fileName,
        threadNumber,
        "signAndSendBeraTransaction error",
        error
      );
      if (failCount > 10) {
        return {
          txid: "unknown",
          txFee: BigInt(0),
          count: failCount,
        };
      }
      failCount++;
    }
  }
}

export async function signAndSendBeraSwapTransactionV2(
  amountIn: bigint,
  inputToken: string,
  amountOutMin: bigint,
  outputToken: string,
  wallet: Wallet,
  threadNumber: number,
  fileName: string,
  provider: JsonRpcProvider
) {
  let failCount = 0;
  console.log("signAndSendBeraSwapTransactionV2");
  while (true) {
    try {
      const gasLimit = await provider.estimateGas({
        // ...transaction,
        from: wallet.address,
      });

      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice!;
      //const gasCost = gasLimit * gasPrice;
      //const deadline = 1000;
      const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
      new Transaction
      printToFile(
        fileName,
        threadNumber,
        "signAndSendBeraSwapTransactionV2 info",
        "gasLimit: " +
          gasLimit.toString() +
          " value: " +
          amountIn.toString() +
          " maxFeePerGas: " +
          feeData?.maxFeePerGas?.toString() +
          " maxPriorityFeePerGas: " +
          feeData?.maxPriorityFeePerGas?.toString()
      );
      console.log(wallet.address);

      const dexRouter: any = new ethers.Contract(
        UNISWAPV2ROUTER02_ADDRESS, // "0xd91dd58387Ccd9B66B390ae2d7c66dBD46BC6022" Uniswap router v2 on BeraChain
        [
          "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable",
          "function WETH() external view returns (address)",
        ],
        wallet
      );

      // const amount = "2683747497561000000000";
      
      await approve(
        wallet,
        UNISWAPV2ROUTER02_ADDRESS,
        inputToken,
        amountIn,
        fileName,
        threadNumber
      );

      const nonce2 = await provider.getTransactionCount(
        wallet.address,
        "pending"
      );
      const connectedWallet = wallet.connect(provider);

      const tx = await dexRouter
        .connect(connectedWallet)
        .swapExactTokensForETH(
          amountIn,
          amountOutMin,
          [inputToken, outputToken],
          wallet.address,
          deadline,
          {
            //value: "2683747497561000000000", //config.nativeTokenAmountForSwap,
            maxFeePerGas: feeData.maxFeePerGas, //w3.to_wei('0.008060389', 'gwei'),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas, // ethers.utils.parseEther("0.000000000001361294"), //w3.to_wei('0.001361294', 'gwei'),
            //gasPrice: config.gasPrice, //feedconfig.gasPrice,
            gasLimit: 200000,
            //gasPrice: feeData.gasPrice,
            nonce: nonce2,
            //gasPrice: config.gasPrice,
            type: 2,
          }
        );

      const receipt = await tx.wait();

      const txFee = receipt?.gasUsed || BigInt(0);

      return {
        txid: tx.hash,
        txFee,
        count: failCount,
      };
    } catch (error) {
      console.log("here");
      console.log(error);
      await sleep(1000);
      printToFile(
        fileName,
        threadNumber,
        "signAndSendBeraSwapTransactionV2 error",
        error
      );
      if (failCount > 10) {
        return {
          txid: "unknown",
          txFee: BigInt(0),
          count: failCount,
        };
      }
      failCount++;
    }
  }
}

export async function getTokenBalance(
  provider: JsonRpcProvider,
  address: string,
  token: string,
  fileName: string,
  threadNumber: number
) {
  while (true) {
    try {
      const contract = new Contract(token, wberaAbi, provider);
      const balance: bigint = await contract.balanceOf(address);
      return balance;
    } catch (error) {
      await sleep(1000);
      printToFile(fileName, threadNumber, "token balance error", error);
    }
  }
}

export async function getTxFee(provider: JsonRpcProvider, txHash: string) {
  while (true) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      return receipt?.fee || BigInt(0);
    } catch (error) {
      return BigInt(0);
    }
  }
}

export async function sendToken(
  from: Wallet,
  to: string,
  token: string,
  amountToSend: bigint,
  fileName: string,
  threadNumber: number
) {
  let count = 0;
  while (true) {
    try {
      const contract = new Contract(token, wberaAbi, from);
      const tx: TransactionResponse = await contract.transfer(
        to,
        amountToSend.toString()
      );
      printToFile(fileName, threadNumber, "send token hash", tx.hash);
      const receipt = await tx.wait();
      return { txid: tx.hash, count, txFee: BigInt(0) };
      // return { txid: tx.hash, count, txFee: tx.gasLimit * tx.gasPrice }
    } catch (error) {
      await sleep(1000);
      count++;
      printToFile(fileName, threadNumber, "send token error", error);
    }
  }
}

export async function approve(
  signer: Wallet,
  spender: string,
  tokenAddress: string,
  amount: bigint,
  fileName: string,
  threadNumber: number
) {
  while (true) {
    try {
      const token = new Contract(tokenAddress, wberaAbi, signer);
      const tx = await token.approve(spender, amount);
      const receipt = await tx.wait(1, 60000);
      printToFile(
        fileName,
        threadNumber,
        "approved token success",
        JSON.stringify(receipt)
      );
      return { txid: tx.hash };
    } catch (ex) {
      await sleep(1000);
      printToFile(fileName, threadNumber, "approved token error", ex);
    }
  }
}

export const wberaAbi = [
  {
    type: "receive",
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [
      {
        name: "result",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "spender",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "result",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "spender",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "result",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "nonces",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "result",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "permit",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "spender",
        type: "address",
        internalType: "address",
      },
      {
        name: "value",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "v",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "r",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "s",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [
      {
        name: "result",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "spender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Withdrawal",
    inputs: [
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "AllowanceOverflow",
    inputs: [],
  },
  {
    type: "error",
    name: "AllowanceUnderflow",
    inputs: [],
  },
  {
    type: "error",
    name: "ETHTransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientAllowance",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidPermit",
    inputs: [],
  },
  {
    type: "error",
    name: "PermitExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "TotalSupplyOverflow",
    inputs: [],
  },
];
