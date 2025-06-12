import { config } from "dotenv";
import { web3Config } from "../config";
import { Chain } from "../types";
import { printToFile, sleep } from "./utils";
import { Contract, formatEther, getAddress, JsonRpcProvider, TransactionResponse, Wallet, parseEther, ethers, parseUnits } from "ethers";
import { BigNumber } from "tronweb";
export const getProvider = (rpc: string) => new JsonRpcProvider(rpc);


export const sendAllAvax = async (
    provider: JsonRpcProvider,
    from: Wallet,
    to: string,
    fileName: string,
    threadNumber: number,
    chainName: Chain
) => {
    const evmConfig = web3Config[chainName]
    let count = evmConfig.sendAllEthCount;
    while (true) {
        try {
            const gasLimit = await provider.estimateGas({});
            // Get the balance of the sender's address
            const balanceAvax = await getBalance(from.address, provider);
            printToFile(fileName, threadNumber, "Avax balance", from.address, balanceAvax);
            if (balanceAvax == BigInt(0)) {
                printToFile(fileName, "insufficient balance 0 avax error");
                return
            }
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice!
            
            // Calculate the total transaction cost
            // let gasCost = BigInt(0)
            // if (chainName == "base") {
            //     gasCost = gasPrice * gasLimit * BigInt(count * 100) / BigInt(100);
            // }
            // else {
            //     gasCost = gasPrice * gasLimit * BigInt(count * 100) / BigInt(100);
            // }

            let gasCost = parseEther((evmConfig.sendAllEthGasFee * count).toFixed(18));
            if (balanceAvax <= gasCost) {
                printToFile(fileName, threadNumber, "insufficient avax", balanceAvax, gasCost);
                return
            }

            // Calculate the amount of ETH to send so balance is zero after the transaction
            const amountToSend = balanceAvax - gasCost;
            printToFile(fileName, threadNumber, "send avax balanceAvax", formatEther(amountToSend.toString()));
            printToFile(fileName, threadNumber, "send avax balanceAvax2", amountToSend.toString());
            printToFile(fileName, threadNumber, "send avax gasCost", gasCost);
            const txParams = {
                from: from.address,
                to: to,
                value: amountToSend,
                gasPrice: gasPrice,
                gasLimit: gasLimit
            };

            // Send the transaction and wait for confirmation
            const tx = await from.sendTransaction(txParams);
            // Wait for the transaction to be confirmed
            printToFile(fileName, threadNumber, "build tx", tx.hash);
            const receipt = await tx.wait(1, 60000);
            // The transaction has been confirmed
            printToFile(fileName, threadNumber, "send all avax success", tx.hash);
            return { txid: tx.hash, count, txFee: receipt?.fee || BigInt(0) }
        } catch (error) {
            await sleep(1000);
            const balanceWei = await getBalance(from.address, provider);
            printToFile(fileName, threadNumber, "send all avax error", from.address, balanceWei.toString(), error);
            if (count < 11) {
                count++;
            }
            continue;
        }
    }
};

export const sendAllEth = async (
    provider: JsonRpcProvider,
    from: Wallet,
    to: string,
    fileName: string,
    threadNumber: number,
    chainName: Chain
) => {
    const evmConfig = web3Config[chainName]
    let count = evmConfig.sendAllEthCount;
    while (true) {
        try {
            const gasLimit = await provider.estimateGas({});
            // Get the balance of the sender's address
            let balanceWei = await getBalance(from.address, provider);
           // balanceWei = parseUnits(balanceWei.toString(), 18)

            printToFile(fileName, threadNumber, "eth balance", from.address, formatEther(balanceWei.toString()));
            if (balanceWei == BigInt(0)) {
                printToFile(fileName, "insufficient balance 0 eth error");
                return
            }
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice!
            
            var gas = BigInt(21000);
            // You can use gasPrice=web3.eth.gasPrice or look up http://ethgasstation.info/
            var gasCost = gas * gasPrice;
            var amountToSend = balanceWei - gasCost;

            if (balanceWei <= gasCost) {
                printToFile(fileName, threadNumber, "insufficient native amount", balanceWei, gasCost);
                return
            }
            
            
           // console.log("evmConfig.sendAllEthGasFee ", evmConfig.sendAllEthGasFee);

            printToFile(fileName, threadNumber, "send native amount", amountToSend);

            const txParams = {
                from: from.address,
                to: to,
                value: amountToSend,
               // gasPrice: gasPrice,
               gas: gas, 
               gasPrice: gasPrice
             //   gasLimit: 21000
            };

            // Send the transaction and wait for confirmation
            const tx = await from.sendTransaction(txParams);
            // Wait for the transaction to be confirmed
            printToFile(fileName, threadNumber, "build tx", tx.hash);
            const receipt = await tx.wait(1, 60000);
            // The transaction has been confirmed
            printToFile(fileName, threadNumber, "send all eth success", tx.hash);
            return { txid: tx.hash, count, txFee: receipt?.fee || BigInt(0) }
        } catch (error) {
            await sleep(1000);
            const balanceWei = await getBalance(from.address, provider);
            printToFile(fileName, threadNumber, "send all eth error", from.address, formatEther(balanceWei.toString()), error);
            if (count < 11) {
                count++;
            }
            continue;
        }
    }
};
export const sendEth = async (
    provider: JsonRpcProvider,
    from: Wallet,
    to: string,
    amount: bigint,
    fileName: string
) => {
    let count = 0
    while (true) {
        try {
            const gasLimit = await provider.estimateGas({});
            // Get the balance of the sender's address
            const balanceWei = await getBalance(from.address, provider);
            if (balanceWei == BigInt(0)) {
                printToFile(fileName, "insufficient balance 0 eth error");
                return
            }
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice!

            // Calculate the total transaction cost
            //const gasCost = gasPrice * BigInt(gasLimit) * BigInt(200) / BigInt(100);

            //const gasCost = gasPrice * gasLimit * BigInt(count + 1);

            const gasCost = parseEther(web3Config.base.gasFee);

            if (balanceWei < gasCost + amount) {
                printToFile(fileName, "insufficient balance eth error", balanceWei, feeData, amount);
                return
            }

            // Create a transaction object
            const txParams = {
                from: from.address,
                to: to,
                value: amount,
                //gasPrice: gasPrice,
                gas: gasCost
            };

            // Send the transaction and wait for confirmation
            const tx = await from.sendTransaction(txParams);

            // Wait for the transaction to be confirmed
            const receipt = await tx.wait(1, 60000);
            // The transaction has been confirmed
            return { txid: tx.hash, count, txFee: receipt?.fee || BigInt(0) }
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

export const getBalance = async (
    address: string,
    provider: JsonRpcProvider
) => {
    while (true) {
        try {
            const balanceWei = await provider.getBalance(address);
            return balanceWei;
        } catch (error) {
            await sleep(1000)
        }
    }
};

export const getSwapTransaction = async (address: string, inputToken: string, outputToken: string, amount: bigint, chainName: Chain, dexParam: string, threadNumber: number, fileName: string) => {
    const evmConfig = web3Config[chainName]
    while (true) {
        try {
            const headers = { headers: { Authorization: `Bearer ${evmConfig.oneInchApikey}`, accept: "application/json" } };
            const swapParams = {
                src: inputToken,
                dst: outputToken,
                amount: amount.toString(),
                from: address,
                slippage: 5,
                disableEstimate: false, // Set to true to disable estimation of swap details
                allowPartialFill: false, // Set to true to allow partial filling of the swap order
                includeProtocols: true,
                includeTokensInfo: true,
                complexityLevel: 0,
                protocols: dexParam,
                compatibility: true
            };
            const url = apiRequestUrl("/swap", chainName, swapParams);
            printToFile(fileName, threadNumber, "1inchSwap request", new Date().getTime())

            const res = await fetch(url, headers);
            const resJson = await res.json()
            if (!resJson?.tx) {
                printToFile(fileName, threadNumber, "1inchSwap error", JSON.stringify(resJson))
                await sleep(3000)
                continue
            }
            printToFile(fileName, threadNumber, "got swap tx", resJson?.tx)
            return resJson.tx
        } catch (error) {
            await sleep(3000)
            printToFile(fileName, threadNumber, "get swap tx error", new Date().getTime(), error)
        }
    }
}


export function isEvmAddress(address: string) {
    try {
        const addr = getAddress(address.toLowerCase())
        return true
    } catch (error) {
        return false
    }
}
// Construct full API request URL
export function apiRequestUrl(methodName: string, chainName: Chain, queryParams: Record<string, any>) {
    const evmConfig = web3Config[chainName]
    return evmConfig.oneInchLink + methodName + "?" + new URLSearchParams(queryParams).toString();
}

function addTenPercent(bigIntValue: bigint) {
    let percentageIncrease = 10n; // 10%
    let newValue = (bigIntValue * (100n + percentageIncrease)) / 100n;
    return newValue;
  }

// Sign and post a transaction, return its hash
export async function signAndSendTransaction(provider: JsonRpcProvider, transaction: any, wallet: Wallet, threadNumber: number, fileName: string) {
    let failCount = 0
    while (true) {
        try {
            const gasLimit = await provider.estimateGas({
                ...transaction,
                from: wallet.address,
            });

            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice!;

            // You can use gasPrice=web3.eth.gasPrice or look up http://ethgasstation.info/
            var gasCost = gasLimit * gasPrice;

            //const gasCost = parseEther(web3Config.base.gasFee);
            const txParams = {
                from: transaction.address,
                to: transaction.to,
                value: transaction.value,
                data: transaction.data,
                // gasLimit: gasLimit,
                // maxFeePerGas: feeData?.maxFeePerGas,
                // maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas,
                gas: addTenPercent(gasCost),
                gasPrice: gasPrice
            };

            // console.log("txParams");
            // console.log(txParams);

            const tx = await wallet.sendTransaction(txParams)
            // printToFile(fileName, threadNumber, "send tx hash", tx.hash)

            const receipt = await tx.wait(1, 60000);

            // const txFee = BigInt(0)
            const txFee = receipt?.fee || BigInt(0)
            return {
                txid: tx.hash,
                txFee,
                count: failCount
            }
        } catch (error) {
            await sleep(1000)
            const balanceWei = await getBalance(wallet.address, provider);
            printToFile(fileName, threadNumber, "send tx error", wallet.address, formatEther(balanceWei.toString()), error)
            if (failCount > 10) {
                return {
                    txid: "unknown",
                    txFee: BigInt(0),
                    count: failCount
                }
            }
            failCount++
        }
    }
}

export async function buildTxForApproveTradeWithRouter(provider: JsonRpcProvider, chainName: Chain, walletAddress: string, tokenAddress: string, amount: bigint, fileName: string, threadNumber: number) {
    while (true) {
        try {

            const evmConfig = web3Config[chainName]
            const headers = { headers: { Authorization: `Bearer ${evmConfig.oneInchApikey}`, accept: "application/json" } };

            const url = apiRequestUrl("/approve/transaction", chainName, { tokenAddress, amount: amount.toString() });
            printToFile(fileName, threadNumber, "buildTxForApproveTradeWithRouter request", new Date().getTime())

            const transaction = await fetch(url, headers).then((res) => res.json());
            if (!transaction) {
                await sleep(1000)
                continue
            }
            const gasLimit = await provider.estimateGas({
                ...transaction,
                from: walletAddress
            });


            return {
                ...transaction,
                gas: gasLimit,
            };
        } catch (error) {
            await sleep(3000)
            printToFile(fileName, threadNumber, "buildTxForApproveTradeWithRouter error", new Date().getTime(), error)
        }
    }
}


export async function getTokenBalance(provider: JsonRpcProvider, address: string, token: string, fileName: string, threadNumber: number, dexParam?: string) {
    while (true) {
        try {

            if(dexParam === undefined) {
                dexParam = "v2";
            }

            const contract = new Contract(token, dexParam.toLowerCase() === "v3" ? erc20V3Abi : erc20Abi, provider);

            console.log(token);
            //console.log(erc20Abi);
            console.log(dexParam);
            console.log(address);

            const balance: bigint = await contract.balanceOf(address);
            return balance
        } catch (error) {
            await sleep(1000)
            printToFile(fileName, threadNumber, "token balance error", error);
        }
    }
}

export async function getTxFee(provider: JsonRpcProvider, txHash: string) {
    while (true) {
        try {
            const receipt = await provider.getTransactionReceipt(txHash);
            return receipt?.fee || BigInt(0)
        } catch (error) {
            return BigInt(0)
        }
    }
}

export async function sendToken(from: Wallet, to: string, token: string, amountToSend: bigint, fileName: string, threadNumber: number) {
    let count = 0
    while (true) {
        try {
            const contract = new Contract(token, erc20Abi, from);
            const tx: TransactionResponse = await contract.transfer(to, amountToSend.toString());
            printToFile(fileName, threadNumber, "send token hash", tx.hash);
            const receipt = await tx.wait();
            return { txid: tx.hash, count, txFee: BigInt(0) }
            // return { txid: tx.hash, count, txFee: tx.gasLimit * tx.gasPrice }
        } catch (error) {
            await sleep(1000)
            count++
            printToFile(fileName, threadNumber, "send token error", error);
        }
    }
}

export async function approve(signer: Wallet, spender: string, tokenAddress: string, amount: bigint, fileName: string, threadNumber: number, dexParam?: string) {
    while (true) {
        try {

            if(dexParam === undefined) {
                dexParam = "v2";
            }

            const token = new Contract(
                tokenAddress,
                dexParam.toLowerCase() === "v3" ? erc20V3Abi : erc20Abi,
                signer
            )
            const tx = await token.approve(spender, amount);
            const receipt = await tx.wait(1, 60000);
            printToFile(fileName, threadNumber, "approved token success", JSON.stringify(receipt));
            return { txid: tx.hash };
        } catch (ex) {
            await sleep(1000);
            printToFile(fileName, threadNumber, "approved token error", ex);
        }
    }
}



export const erc20V3Abi = [
    {"inputs":[{"internalType":"string","name":"name","type":"string"},{"internalType":"string","name":"symbol","type":"string"},{"internalType":"uint256","name":"totalSupply","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[],"name":"MODE_NORMAL","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MODE_TRANSFER_CONTROLLED","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MODE_TRANSFER_RESTRICTED","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"_mode","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"subtractedValue","type":"uint256"}],"name":"decreaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"addedValue","type":"uint256"}],"name":"increaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"v","type":"uint256"}],"name":"setMode","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

export const erc20Abi = [
    {
        "constant": true,
        "inputs": [],
        "name": "name",
        "outputs": [
            {
                "name": "",
                "type": "string"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_spender",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "name": "",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_from",
                "type": "address"
            },
            {
                "name": "_to",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "transferFrom",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [
            {
                "name": "",
                "type": "uint8"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            {
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "name": "balance",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [
            {
                "name": "",
                "type": "string"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_to",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "transfer",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            {
                "name": "_owner",
                "type": "address"
            },
            {
                "name": "_spender",
                "type": "address"
            }
        ],
        "name": "allowance",
        "outputs": [
            {
                "name": "",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "payable": true,
        "stateMutability": "payable",
        "type": "fallback"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "name": "spender",
                "type": "address"
            },
            {
                "indexed": false,
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Approval",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "name": "from",
                "type": "address"
            },
            {
                "indexed": true,
                "name": "to",
                "type": "address"
            },
            {
                "indexed": false,
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Transfer",
        "type": "event"
    }
]


