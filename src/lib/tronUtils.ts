import { TronWeb } from "tronweb";
import { TRON_EXAMPLE_TXID, SUNSWAP_FACTORY_ABI, SUNSWAP_FACTORY_ADDRESS, SUNSWAP_ROUTER_ADDRESS, TRC20_ABI, WTRX_ADDRESS } from "./tronConfig";
import { tronConfig } from "../config";
import { printToFile, sleep } from "./utils";
import { TriggerConstantContractOptions } from "tronweb/lib/esm/types";

export const SUN_PER_TRX = 1_000_000
export const poolExistsTron = async (tokenMint: string, tronWeb: TronWeb) => {
    const pairAddress = await getPairAddress(tokenMint, tronWeb)
    if (pairAddress) {
        return true
    } else {
        return false
    }
}

export const sendTrx = async (privateKey: string, toAddress: string, amountInSun: number, tronWeb: TronWeb, fileName: string) => {
    let count = 0
    while (true) {
        try {
            const fromAddress = tronWeb.address.fromPrivateKey(privateKey)
            const balanceInSun = await tronWeb.trx.getBalance(fromAddress);
            if (balanceInSun <= 1.1 * SUN_PER_TRX) {
                return { txid: TRON_EXAMPLE_TXID, count: count }
            }
            const txObj = await tronWeb.transactionBuilder.sendTrx(toAddress, amountInSun, fromAddress as string)
            const signedTxn = await tronWeb.trx.sign(txObj, privateKey);
            const receipt = await tronWeb.trx.sendRawTransaction(signedTxn);
            await waitForConfirmation(receipt.transaction.txID, tronWeb)
            return { txid: receipt.transaction.txID, count: count }
        } catch (error) {
            printToFile(fileName, 'An error occurred while sending TRX:', error);
            count++
            await sleep(900)
        }
    }
}

export const sendAllTrx = async (privateKey: string, toAddress: string, tronWeb: TronWeb, fileName: string, threadNumber: number) => {
    let count = 0
    while (true) {
        try {
            const fromAddress = tronWeb.address.fromPrivateKey(privateKey)
            const balanceInSun = await tronWeb.trx.getBalance(fromAddress);
            if (balanceInSun <= 1.1 * SUN_PER_TRX) {
                return { txid: TRON_EXAMPLE_TXID, count: count }
            }
            const txObj = await tronWeb.transactionBuilder.sendTrx(toAddress, balanceInSun - 1100000, fromAddress as string)
            const signedTxn = await tronWeb.trx.sign(txObj, privateKey);
            const receipt = await tronWeb.trx.sendRawTransaction(signedTxn);
            await waitForConfirmation(receipt.transaction.txID, tronWeb)
            return { txid: receipt.transaction.txID, count: count }
        } catch (error) {
            printToFile(fileName, threadNumber, 'An error occurred while sending TRX:', error);
            count++
            await sleep(900)
        }
    }
}

export function isTronAddress(address: string, tronWeb: TronWeb) {
    try {
        // Use TronWeb's built-in check for address validity
        if (tronWeb.isAddress(address)) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        return false;
    }
}

export function getAddressFromHex(hex: string, tronWeb: TronWeb) {
    return tronWeb.address.fromHex(hex);
}

export async function getBalance(tronWeb: TronWeb, privateKey: string) {
    while (true) {
        try {
            const balanceInSun = await tronWeb.trx.getBalance(tronWeb.address.fromPrivateKey(privateKey))
            return balanceInSun
        } catch (error) {
            console.log("get balance error", error)
            await sleep(1000)
        }
    }
}

export async function getTxFee(txId: string, tronWeb: TronWeb) {
    try {
        const receipt = await tronWeb.trx.getTransactionInfo(txId)
        return (receipt.receipt.net_fee || 0) + (receipt.receipt.energy_fee || 0)
    } catch (error) {
        console.log("get tx fee error", txId, error)
        return 0
    }
}

export async function getTokenBalance(address: string, tokenMint: string, tronWeb: TronWeb) {
    while (true) {
        try {
            // Create a contract instance
            const contract = tronWeb.contract(TRC20_ABI, tokenMint);
            const balance = await contract.balanceOf(address).call();
            return BigInt(balance)
        } catch (error) {
            console.log("get token balance error", error)
            await sleep(1000)
        }
    }
}

export async function getPairAddress(tokenMint: string, tronWeb: TronWeb) {
    try {
        console.log("get pair address", tokenMint)
        const sunSwapFactoryContract = tronWeb.contract(SUNSWAP_FACTORY_ABI as any, SUNSWAP_FACTORY_ADDRESS)
        const encodedPairAddress = await sunSwapFactoryContract.getPair(tokenMint, WTRX_ADDRESS).call()
        if (
            !encodedPairAddress ||
            encodedPairAddress === "410000000000000000000000000000000000000000"
        ) { return null; }
        const address = getAddressFromHex(encodedPairAddress, tronWeb)
        console.log("pool address for token", tokenMint, address)
        return address
    } catch (error) {
        console.log("pool address error", tokenMint, error)
        return null
    }
}

export async function buyToken(tokenAddress: string, amountInSun: number, privateKey: string, tronWeb: TronWeb, threadNumber: number, fileName: string) {
    let count = 0
    while (true) {
        try {

            const deadline = getDeadLine();
            const wrtxAddressInHEX = getAddressInHex(WTRX_ADDRESS, true, tronWeb);
            const tokenAddressInHEX = getAddressInHex(tokenAddress, true, tronWeb);
            const routerAddressInHEX = getAddressInHex(
                SUNSWAP_ROUTER_ADDRESS,
                false,
                tronWeb
            );
            const fromAddress = tronWeb.address.fromPrivateKey(privateKey) as string
            const walletAddressInHEX = getAddressInHex(fromAddress, false, tronWeb);

            if (!tokenAddressInHEX || !wrtxAddressInHEX)
                throw new Error("No address found");
            const options: TriggerConstantContractOptions = {
                callValue: amountInSun,
            };
            const parameter = [
                { type: "uint256", value: 0 },
                { type: "address[]", value: [wrtxAddressInHEX, tokenAddressInHEX] },
                { type: "address", value: fromAddress },
                { type: "uint256", value: deadline },
            ];

            const { transaction } =
                await tronWeb.transactionBuilder.triggerSmartContract(
                    SUNSWAP_ROUTER_ADDRESS,
                    "swapExactETHForTokens(uint256,address[],address,uint256)",
                    options,
                    parameter,
                    fromAddress
                );
            if (!transaction) throw new Error("No transaction found");

            const signedTransaction = await tronWeb.trx.sign(
                transaction,
                privateKey
            );
            if (!signedTransaction) throw new Error("No signed transaction found");

            const broadcast = await tronWeb.trx.sendRawTransaction(
                signedTransaction
            );

            if (!broadcast) throw new Error("No broadcast found");
            const result = broadcast.result;
            const tx = broadcast.transaction;
            if (!result || !tx) throw new Error("No result or transaction found");
            await waitForConfirmation(broadcast.transaction.txID, tronWeb)
            return { txid: tx.txID, count }

        } catch (error) {
            printToFile(fileName, threadNumber, "buy token error", error)
            count++
            await sleep(1000)
        }
    }
}


export async function sellToken(tokenAddress: string, amountToSell: bigint, privateKey: string, tronWeb: TronWeb, threadNumber: number, fileName: string) {
    let count = 0
    while (true) {
        try {

            const deadline = getDeadLine();
            const wrtxAddressInHEX = getAddressInHex(WTRX_ADDRESS, true, tronWeb);
            const tokenAddressInHEX = getAddressInHex(tokenAddress, true, tronWeb);
            const routerAddressInHEX = getAddressInHex(
                SUNSWAP_ROUTER_ADDRESS,
                false,
                tronWeb
            );
            const fromAddress = tronWeb.address.fromPrivateKey(privateKey) as string
            const walletAddressInHEX = getAddressInHex(fromAddress, false, tronWeb);
            if (!tokenAddressInHEX || !wrtxAddressInHEX)
                throw new Error("No address found");
            const options: TriggerConstantContractOptions = {
            };

            const parameter = [
                { type: "uint256", value: amountToSell.toString() },
                { type: "uint256", value: 0 },
                { type: "address[]", value: [tokenAddressInHEX, wrtxAddressInHEX] },
                { type: "address", value: fromAddress },
                { type: "uint256", value: deadline },
            ];

            const { transaction } =
                await tronWeb.transactionBuilder.triggerSmartContract(
                    SUNSWAP_ROUTER_ADDRESS,
                    "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
                    options,
                    parameter,
                    fromAddress
                );
            if (!transaction) throw new Error("No transaction found");

            const signedTransaction = await tronWeb.trx.sign(
                transaction,
                privateKey
            );
            if (!signedTransaction) throw new Error("No signed transaction found");

            const broadcast = await tronWeb.trx.sendRawTransaction(
                signedTransaction
            );

            if (!broadcast) throw new Error("No broadcast found");
            const result = broadcast.result;
            const tx = broadcast.transaction;
            if (!result || !tx) throw new Error("No result or transaction found");
            await waitForConfirmation(broadcast.transaction.txID, tronWeb)
            return { txid: tx.txID, count }

        } catch (error) {
            printToFile(fileName, threadNumber, "buy token error", error)
            count++
            await sleep(1000)
        }
    }
}

export async function approveToken(tokenContractAddress: string, spenderAddress: string, privateKey: string, tronWeb: TronWeb, threadNumber: number, fileName: string) {
    let count = 0
    while (true) {
        try {
            const fromAddress = tronWeb.address.fromPrivateKey(privateKey) as string

            const functionSelector = 'approve(address,uint256)';
            const parameter = [
                { type: 'address', value: spenderAddress },
                { type: 'uint256', value: "115792089237316195423570985008687907853269984665640564039457584007913129639935" }
            ];

            const options: TriggerConstantContractOptions = {
            };

            // Call triggerSmartContract
            const tx = await tronWeb.transactionBuilder.triggerSmartContract(
                tokenContractAddress,           // Contract address
                functionSelector,               // Function name with signature
                options,                        // Options with fee limit
                parameter,                      // List of parameters
                fromAddress   // Caller address
            );
            if (!tx || !tx.transaction) {
                throw new Error('Failed to create transaction');
            }

            // Sign the transaction
            const signedTx = await tronWeb.trx.sign(tx.transaction, privateKey);

            // Broadcast the transaction
            const receipt = await tronWeb.trx.sendRawTransaction(signedTx);
            await waitForConfirmation(receipt.transaction.txID, tronWeb)
            return { txid: receipt.transaction.txID, count }
        } catch (error) {
            printToFile(fileName, threadNumber, 'Error approving tokens:', error);
            count++
            await sleep(1000)
        }
    }
}

export function getDeadLine() {
    return Math.floor(Date.now() / 1000) + 60 * 2;
}

export function getAddressInHex(address: string, withPrefix: boolean, tronWeb: TronWeb) {
    const addressInHex = tronWeb.address.toHex(address);
    return withPrefix ? addressInHex : addressInHex.slice(2);
}

export async function sendToken(privateKey: string, toAddress: string, tokenMint: string, amountToSend: bigint, tronWeb: TronWeb, fileName: string, threadNumber: number) {
    while (true) {

        try {
            const fromAddress = tronWeb.address.fromPrivateKey(privateKey) as string
            // Encode the parameters for the transfer function
            const functionSelector = 'transfer(address,uint256)';
            const options = { feeLimit: 100000000 }; // Set fee limit
            const parameter = [
                { type: 'address', value: toAddress },
                { type: 'uint256', value: amountToSend.toString() }
            ];

            // Trigger the smart contract function
            const tx = await tronWeb.transactionBuilder.triggerSmartContract(
                tokenMint,           // Contract address
                functionSelector,               // Function name with signature
                options,                        // Options with fee limit
                parameter,                      // List of parameters
                fromAddress   // Caller address
            );

            if (!tx || !tx.transaction) {
                throw new Error('Failed to create transaction');
            }

            // Sign the transaction
            const signedTx = await tronWeb.trx.sign(tx.transaction, privateKey);

            // Broadcast the transaction
            const receipt = await tronWeb.trx.sendRawTransaction(signedTx);
            await waitForConfirmation(receipt.transaction.txID, tronWeb)
            console.log('send token tx', receipt.transaction.txID);
            return receipt.transaction.txID
        } catch (error) {
            console.error('Error transferring tokens:', error);
        }
    }
}

export async function waitForConfirmation(txId: string, tronWeb: TronWeb, interval: number = 3000, timeout: number = 200000) {
    const startTime = Date.now();

    while (true) {
        try {
            const receipt = await tronWeb.trx.getConfirmedTransaction(txId);

            if (receipt) {
                return receipt;
            }

            if (Date.now() - startTime >= timeout) {
                throw new Error('Transaction confirmation timed out');
            }

        } catch (error) {
        }
        await sleep(interval);

    }
}
