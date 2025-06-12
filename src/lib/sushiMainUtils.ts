import { web3Config } from "../config";
import { Chain } from "../types";
import { printToFile, sleep } from "./utils";
import { ethers, Wallet, JsonRpcProvider } from "ethers";


export const getProvider = (rpc: string) => {
    return new ethers.JsonRpcProvider(rpc);
}

export const getSwapTransactionwithSushi = async (inputCurrencyToken: string, outputCurrencyToken: string, address: string, amount: string, chainName: Chain, threadNumber: number, fileName: string, provider: JsonRpcProvider, preferSushi: string, pairAddress: string): Promise<any> => {
    while (true) {
        try {
            printToFile(fileName, threadNumber, "getSwapTransactionwithSushi", new Date().getTime())
            const evmConfig = web3Config[chainName];
            const SWAP_API_URL = new URL('https://api.sushi.com/swap/v5/' + evmConfig.chainId);


            const inputCurrency = inputCurrencyToken;
            const outputCurrency = outputCurrencyToken;

            // Max Slippage
            const maxSlippage = 0.5;

            // Gas Price
            // const feeData = await provider.getFeeData();
            // const gasPrice = feeData.gasPrice!

            // {"status":"Success","tokens":[{"address":"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE","symbol":"ETH","name":"Ether","decimals":18},{"address":"0x4200000000000000000000000000000000000006","symbol":"WETH","name":"Wrapped Ether","decimals":18},{"address":"0x7ED613AB8b2b4c6A781DDC97eA98a666c6437511","symbol":"AYB","name":"All Your Base","decimals":18}],"tokenFrom":0,"tokenTo":2,"swapPrice":4264615445.322449,"priceImpact":0.003000000000086822,"amountIn":"2450","assumedAmountOut":"10448307841040","gasSpent":110000,"route":[{"poolAddress":"0x4200000000000000000000000000000000000006","poolType":"Bridge","poolName":"Wrap","poolFee":0,"liquidityProvider":"NativeWrap","tokenFrom":0,"tokenTo":1,"share":1,"assumedAmountIn":"2450","assumedAmountOut":"2450"},{"poolAddress":"0x7cb15019aDFbce42BffBa0958E9901d0CEF5Ef69","poolType":"Classic","poolName":"SushiSwapV2 0.3%","poolFee":0.003,"liquidityProvider":"SushiSwapV2","tokenFrom":1,"tokenTo":2,"share":1,"assumedAmountIn":"2450","assumedAmountOut":"10448307841040"}],"routeProcessorAddr":"0xf2614A233c7C3e7f08b1F887Ba133a13f1eb2c55"}
            const { searchParams } = SWAP_API_URL;
            searchParams.set('tokenIn', inputCurrency);
            searchParams.set('tokenOut', outputCurrency);
            searchParams.set('amount', amount.toString());
            searchParams.set('maxSlippage', maxSlippage.toString());
           // searchParams.set('gasPrice', gasPrice.toString());
            searchParams.set('preferSushi', preferSushi);
            searchParams.set('to', address)
            searchParams.set('includeTransaction', 'true')

            //https://api.sushi.com/swap/v5/56?tokenIn=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&tokenOut=0x2d5F3B0722aCd35fbb749cB936dfdd93247BBC95&amount=37736460269327581&maxSlippage=2&preferSushi=false&to=0x550F6f00C16cfd2FA0Ebb7e363C1c47378a4f4B1&includeTransaction=true
            if(pairAddress && pairAddress !== "") {
               searchParams.set('onlyPools', pairAddress)
            }

            console.log(pairAddress);
            console.log(SWAP_API_URL.toString());

            // Make call to API
            const res = await fetch(SWAP_API_URL.toString());
            const data = await res.json();

            const { tx } = data;
            printToFile(fileName, threadNumber, "build swap getSwapTransactionwithSushi success");
            return tx;
        } catch (error) {
            await sleep(3000);
            printToFile(fileName, threadNumber, "build swap getSwapTransactionwithSushi error");
        }
    }
}

export const poolExistsSushi = async (tokenMint: string, chainName: Chain, provider: JsonRpcProvider, preferSushi: string) => {
    const evmConfig = web3Config[chainName];
    const chainId = evmConfig.chainId;
    const SWAP_API_URL = new URL('https://api.sushi.com/swap/v5/' + chainId);


    // TokenA & TokenB
    const inputCurrency = tokenMint;
    const outputCurrency = evmConfig.eth;

    // Amount
    const amount = 100000000000000000;

    // Max Slippage
    const maxSlippage = 0.005;

    // Gas Price
    try {
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice!;

        // {"status":"Success","tokens":[{"address":"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE","symbol":"ETH","name":"Ether","decimals":18},{"address":"0x4200000000000000000000000000000000000006","symbol":"WETH","name":"Wrapped Ether","decimals":18},{"address":"0x7ED613AB8b2b4c6A781DDC97eA98a666c6437511","symbol":"AYB","name":"All Your Base","decimals":18}],"tokenFrom":0,"tokenTo":2,"swapPrice":4264615445.322449,"priceImpact":0.003000000000086822,"amountIn":"2450","assumedAmountOut":"10448307841040","gasSpent":110000,"route":[{"poolAddress":"0x4200000000000000000000000000000000000006","poolType":"Bridge","poolName":"Wrap","poolFee":0,"liquidityProvider":"NativeWrap","tokenFrom":0,"tokenTo":1,"share":1,"assumedAmountIn":"2450","assumedAmountOut":"2450"},{"poolAddress":"0x7cb15019aDFbce42BffBa0958E9901d0CEF5Ef69","poolType":"Classic","poolName":"SushiSwapV2 0.3%","poolFee":0.003,"liquidityProvider":"SushiSwapV2","tokenFrom":1,"tokenTo":2,"share":1,"assumedAmountIn":"2450","assumedAmountOut":"10448307841040"}],"routeProcessorAddr":"0xf2614A233c7C3e7f08b1F887Ba133a13f1eb2c55"}
        const { searchParams } = SWAP_API_URL;
        searchParams.set('tokenIn', inputCurrency);
        searchParams.set('tokenOut', outputCurrency);
        searchParams.set('amount', amount.toString());
        searchParams.set('maxSlippage', maxSlippage.toString());
        searchParams.set('gasPrice', gasPrice.toString());
        searchParams.set('preferSushi', preferSushi);

        // Make call to API
        console.log(SWAP_API_URL.toString());
        const res = await fetch(SWAP_API_URL.toString());
        const data = await res.json();

        console.log(data);

        const { tx } = data;

        if (data && data.status === 'Success') {
            return true;
        }
        else {
            return false;
        }
    }
    catch (e) {
        console.log("Sushi quote error: ", e);
        return false;
    }
}


export function isEvmAddress(address: string) {
    try {
        const addr = ethers.getAddress(address.toLowerCase())
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


// Sign and post a transaction, return its hash
export async function signAndSendSushTransaction(transaction: any, wallet: Wallet, threadNumber: number, fileName: string, provider: ethers.JsonRpcProvider) {
    let failCount = 0
    while (true) {
        try {

            const gasLimit = await provider.estimateGas({
                ...transaction,
                from: wallet.address,
            });


            console.log("are we getting here------------------------- " + wallet.address);

            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice!;

            console.log("are we getting here also?------------------------- " + wallet.address);
            printToFile(fileName, threadNumber, "signAndSendSushTransaction info", "gasLimit: " + gasLimit.toString() + " value: " + transaction.value.toString() +  " maxFeePerGas: " + feeData?.maxFeePerGas?.toString() + " maxPriorityFeePerGas: " +  feeData?.maxPriorityFeePerGas?.toString());

            const tx = await wallet.sendTransaction({
                // account: transaction.from,
                data: transaction.data,
                to: transaction.to,
                value: transaction.value,
                from: wallet.address,
               // gasPrice: gasPrice,
                gasLimit: gasLimit,
                maxFeePerGas: feeData?.maxFeePerGas,
                maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas,
                //maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),  // Tip to miners
                //     maxFeePerGas: ethers.parseUnits('50', 'gwei'),  // Maximum total fee
               // nonce: nonce,
                type: 2
            });
 
            const receipt = await tx.wait();

            const txFee = receipt?.gasUsed || BigInt(0);
            
            return {
                txid: tx.hash,
                txFee,
                count: failCount
            }
        } catch (error) {
            console.log(error);
            await sleep(1000)
            printToFile(fileName, threadNumber, "signAndSendSushTransaction error", error)
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

export const MAX_FEE_PER_GAS = 100000000000
export const MAX_PRIORITY_FEE_PER_GAS = 100000000000
export const TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER = 10000

//https://docs.uniswap.org/contracts/v2/reference/smart-contracts/v2-deployments
const V2_FACTORY = '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6';
const BASE_V2_UNIVERSAL_ROUTER = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';
export const V3_SWAP_ROUTER_ADDRESS =
    '0x2626664c2603336E57B271c5C0b26F421741e481'

export enum TransactionState {
    Failed = 'Failed',
    New = 'New',
    Rejected = 'Rejected',
    Sending = 'Sending',
    Sent = 'Sent',
}

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
