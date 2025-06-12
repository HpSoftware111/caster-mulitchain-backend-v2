import { suiConfig } from "../config";
import { printToFile, sleep } from "./utils";

import { SuiClient, CoinStruct } from '@mysten/sui/client';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { HopApi, HopApiOptions } from "@hop.ag/sdk";
import { getQuote, SourceDex, buildTx } from "@7kprotocol/sdk-ts";

import { AggregatorQuoter, TradeBuilder, Protocol } from "@flowx-finance/sdk";


import base58 from "bs58";

export const getHopSDK = async (address: string) => {
    while (true) {
        try {
            const hopApioptions: HopApiOptions = {
                api_key: suiConfig.hopApikey,
                fee_bps: 0,
                fee_wallet: address,
                charge_fees_in_sui: false,
            };
            const sdk = new HopApi(suiConfig.rpc, hopApioptions);
            return sdk;
        } catch (error) {
            await sleep(1000)
        }
    }
}

export const getClient = async () => {
    while (true) {
        try {
            const client = new SuiClient({ url: suiConfig.rpc });
            return client;
        } catch (error) {
            await sleep(1000)
        }
    }
}

export const poolExistsSui = async (tokenMint: string) => {
    try {
        const hopSDK = await getHopSDK('');
        const quote = await hopSDK.fetchQuote({
            token_in: suiConfig.wsui,
            token_out: tokenMint,
            amount_in: BigInt(100000000),
        });
        return true
    } catch (error) {
        return false;
    }

}

export const sendAllSui = async (
    client: SuiClient,
    from: Ed25519Keypair,
    to: string,
    fileName: string,
    threadNumber: number,
) => {
    let balance = BigInt(0);
    let count = 0;
    let gasBudget = BigInt(suiConfig.gasFee * Number(MIST_PER_SUI));
    let amountToSend = BigInt(0);
    while (true) {
        try {
            balance = await getBalance(from.toSuiAddress(), client)
            let transaction = { txid: '', count: 0, txFee: BigInt(0) };
            if (balance <= gasBudget) {
                printToFile(fileName, threadNumber, "insufficient sui", balance, gasBudget);
                return
            }
            const tx = new Transaction();
            amountToSend = balance - gasBudget;
            const [coin] = tx.splitCoins(tx.gas, [amountToSend]);
            tx.transferObjects([coin], to);
            tx.setGasBudget(gasBudget);

            await client.signAndExecuteTransaction({
                signer: from,
                transaction: tx,
                requestType: 'WaitForLocalExecution',
                options: {
                    showEffects: true,
                }
            })
                .then((txRes) => {
                    const status = txRes.effects?.status?.status;
                    if (status !== 'success') {
                        throw new Error(`Could not split coin! ${txRes.effects?.status?.error}`);
                    }

                    transaction = { txid: txRes.digest, count, txFee: BigInt(0) };
                })
            return transaction;
            break;
        } catch (error) {
            await sleep(1000);
            printToFile(fileName, threadNumber, "send all sui error", balance, amountToSend, from.toSuiAddress(), from.getSecretKey(), error);
            count++;
        }
    }
};

export const sendSui = async (
    client: SuiClient,
    from: Ed25519Keypair,
    to: string,
    amount: bigint,
    fileName: string
) => {
    let count = 0;
    let gasBudget = BigInt(2 * suiConfig.gasFee * Number(MIST_PER_SUI));
    while (true) {
        try {
            const balance = await getBalance(from.toSuiAddress(), client)
            let sendAmount = amount;
            let transaction = { txid: '', count: 0, txFee: BigInt(0) };
            if (balance == BigInt(0)) {
                printToFile(fileName, "insufficient balance 0 sui error");
                return
            }
            if (balance < gasBudget + amount) {
                printToFile(fileName, "insufficient balance sui error", balance, gasBudget, amount);
                sendAmount = balance - gasBudget;
            }
            const tx = new Transaction();
            const [coin] = tx.splitCoins(tx.gas, [sendAmount]);
            tx.transferObjects([coin], to);
            tx.setGasBudget(gasBudget);
            await client.signAndExecuteTransaction({
                signer: from,
                transaction: tx,
                requestType: 'WaitForLocalExecution',
                options: {
                    showEffects: true,
                }
            }).then((txRes) => {
                const status = txRes.effects?.status?.status;
                if (status !== 'success') {
                    throw new Error(`Could not split coin! ${txRes.effects?.status?.error}`);
                }

                transaction = { txid: txRes.digest, count, txFee: BigInt(0) };
            })
            return transaction;

        } catch (error) {
            await sleep(1000);
            printToFile(fileName, "send sui error", error);
            count++;

        }
    }
};

export const sendSuiDivideWallt = async (
    client: SuiClient,
    from: Ed25519Keypair,
    transfers: any,
    fileName: string
) => {
    let count = 0;
    let gasBudget = BigInt(suiConfig.gasFee * Number(MIST_PER_SUI) * transfers.length);
    while (true) {
        try {
            let transaction = { txid: '', count: 0, txFee: BigInt(0) };
            const tx = new Transaction();
            const coins = tx.splitCoins(
                tx.gas,
                transfers.map((transfer: any) => transfer.amount),
            );
            transfers.forEach((transfer: any, index: number) => {
                tx.transferObjects([coins[index]], transfer.to);
            });
            tx.setGasBudget(gasBudget);
            await client.signAndExecuteTransaction({
                signer: from,
                transaction: tx,
                requestType: 'WaitForLocalExecution',
                options: {
                    showEffects: true,
                }
            }).then((txRes) => {
                const status = txRes.effects?.status?.status;
                if (status !== 'success') {
                    throw new Error(`Could not split coin! ${txRes.effects?.status?.error}`);
                }
                transaction = { txid: txRes.digest, count, txFee: BigInt(0) };
            })
            return transaction;

        } catch (error) {
            await sleep(1000);
            printToFile(fileName, "send sui divide error", error);
            count++;

        }
    }
};

export const sendToken = async (
    client: SuiClient,
    from: Ed25519Keypair,
    to: string,
    coinAddress: string,
    amountToSend: bigint,
    fileName: string,
    threadNumber: number
) => {
    let count = 0

    let coins: CoinStruct[] = [];
    let cursor: any = null;
    let hasNextPage = true;

    do {
        const response = await client.getCoins({
            owner: from.toSuiAddress(),
            coinType: coinAddress,
            cursor: cursor,
        });
        coins = coins.concat(response.data);
        cursor = response.nextCursor;
        hasNextPage = response.hasNextPage;
    } while (hasNextPage);

    if (coins.length == 0) {
        return {
            txid: "unknown",
            txFee: BigInt(0),
            count
        }
    }

    while (true) {
        try {
            let transaction;
            const tx = new Transaction();
            const coinObjects = coins.map((coin) => { return tx.object(coin.coinObjectId) });
            const coinToTransfer = coinObjects[0];
            if (coinObjects.length > 1) {
                tx.mergeCoins(coinToTransfer, [...coinObjects.slice(1)]);
            }

            const [coin] = tx.splitCoins(coinToTransfer, [amountToSend]);
            tx.transferObjects([coin], to);
            await client.signAndExecuteTransaction({
                signer: from,
                transaction: tx,
                requestType: 'WaitForLocalExecution',
                options: {
                    showEffects: true,
                }
            }).then((txRes) => {
                const status = txRes.effects?.status?.status;
                if (status !== 'success') {
                    throw new Error(`Could not split coin! ${txRes.effects?.status?.error}`);
                }
                const txFee = BigInt(0)
                transaction = { txid: txRes.digest, txFee, count };
            })
            return transaction;
            break;
        } catch (error) {
            console.log(error);
            await sleep(1000)
            count++
            printToFile(fileName, threadNumber, "send token error", error);
        }
    }
}

export const getBalance = async (
    address: string,
    client: SuiClient
) => {
    while (true) {
        try {
            const balance = await client.getBalance({
                owner: address,
            });
            return BigInt(balance.totalBalance);
            break;
        } catch (error) {
            await sleep(1000);
        }
    }
};

export const getTokenBalance = async (client: SuiClient, address: string, token: string, fileName: string, threadNumber: number) => {
    while (true) {
        try {
            const coinBalance = await client.getBalance({
                owner: address,
                coinType: token
            });
            return BigInt(coinBalance.totalBalance);
        } catch (error) {
            await sleep(1000)
            printToFile(fileName, threadNumber, "token balance error", error);
        }
    }
}

export const getSwapTransaction = async (address: string, inputToken: string, outputToken: string, amount: bigint, fileName: string, threadNumber: number) => {
    while (true) {
        try {
            const hopSDK = await getHopSDK(address);

            const quote = await hopSDK.fetchQuote({
                token_in: inputToken,
                token_out: outputToken,
                amount_in: amount,
            });

            const resJson = await hopSDK.fetchTx({
                trade: quote.trade,
                sui_address: address,
                max_slippage_bps: 50,
                return_output_coin_argument: false,
            });

            return resJson.transaction;
        } catch (error) {
            console.log(error);
            await sleep(1000)
            printToFile(fileName, threadNumber, "get swap instruction error", error)
        }
    }
}

export const signAndSendTransaction = async (tx: any, wallet: any, fileName: string, threadNumber: number) => {
    let failCount = 0
    while (true) {

        try {
            let transaction;
            const client = await getClient();
            await client.signAndExecuteTransaction({
                signer: wallet,
                transaction: tx,
                requestType: 'WaitForLocalExecution',
                options: {
                    showEffects: true,
                }
            }).then((txRes) => {
                const status = txRes.effects?.status?.status;
                if (status !== 'success') {
                    throw new Error(`Could not split coin! ${txRes.effects?.status?.error}`);
                }
                const txFee = BigInt(0)
                transaction = { txid: txRes.digest, txFee, count: failCount };
            })
            return transaction;
        } catch (error) {
            await sleep(1000)
            printToFile(fileName, threadNumber, "send tx error", error)
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

export const poolExistsSuiWith7K = async (tokenMint: string, poolType: any, poolAddress: string, quoteToken?: string) => {
    try {

        if(quoteToken === undefined || quoteToken === "" ) {
            quoteToken = suiConfig.wsui;
        }

        let pools = [poolAddress]
        if(tokenMint === "0xaa228b0e90f6e7748795bf2e2c0f219aafe95af7b0ce55e9c5bbff0f6e1bfb11::beth::BETH") {
            pools = []
        }

        const quoteResponse = await getQuote({
            tokenIn: quoteToken,
            tokenOut: tokenMint,
            amountIn: "1000000000",
            sources: [poolType],
            targetPools: pools
        });

        // console.log("targetPools", pools);
        // console.log("quoteToken", quoteToken);
        // console.log("tokenMint", tokenMint);
        // console.log("poolType", poolType);
        // console.log("poolAddress",poolAddress);
        // console.log("quoteResponse",quoteResponse);

        if (quoteResponse.routes?.length == 0) {
            return false;
        }

        return true
    } catch (error) {
        return false;
    }

}

export const getSwapTransactionWith7K = async (address: string, inputToken: string, outputToken: string, amount: bigint, poolType: SourceDex, poolAddress: string, fileName: string, threadNumber: number) => {
    let failCount = 0;
    while (true) {
        try {

            let pools = [poolAddress]
            if(inputToken === "0xaa228b0e90f6e7748795bf2e2c0f219aafe95af7b0ce55e9c5bbff0f6e1bfb11::beth::BETH" || outputToken === "0xaa228b0e90f6e7748795bf2e2c0f219aafe95af7b0ce55e9c5bbff0f6e1bfb11::beth::BETH") {
                pools = []
            }

            const quoteResponse = await getQuote({
                tokenIn: inputToken,
                tokenOut: outputToken,
                amountIn: amount.toString(),
                sources: [poolType],
                targetPools: pools
            });

            // console.log("targetPools", pools);
            // console.log("inputToken", inputToken);
            // console.log("outputToken", outputToken);
            // console.log("poolType", poolType);
            // console.log("targetPools",pools);
            // console.log("quoteResponse",quoteResponse);

            const result = await buildTx({
                quoteResponse,
                accountAddress: address,
                slippage: 0.5,
                commission: {
                    partner: suiConfig.partnerAddress,
                    commissionBps: 0,
                },
            });
            const { tx, coinOut } = result || {};

            return tx;
        } catch (error) {
            if(failCount > 100)
                return null;
            await sleep(1000)
            printToFile(fileName, threadNumber, "get swap instruction error", error)
            failCount++;
        }
    }
}

export const isSuiAddress = (address: string) => {

}

export const exchangeSuiBalance = (balance: bigint) => {
    return Number(balance) / Number(MIST_PER_SUI)
}


export const poolExistsSuiWithFlow = async (tokenMint: string, poolType: any) => {
    try {
        const quoter = new AggregatorQuoter('mainnet');

        let includeSources: Protocol[] = getIncludeSources(poolType);

        const params = {
            tokenIn: suiConfig.wsui,
            tokenOut: tokenMint,
            amountIn: '1000000000',
            includeSources
        };

        const quoteResponse = await quoter.getRoutes(params);
        const routes = quoteResponse.routes;
        return true;
    } catch (error) {
        return false;
    }

}

export const getSwapTransactionWithFlow = async (address: string, inputToken: string, outputToken: string, amount: bigint, poolType: any, fileName: string, threadNumber: number) => {
    while (true) {
        try {
            const quoter = new AggregatorQuoter('mainnet');

            let includeSources: Protocol[] = getIncludeSources(poolType);

            const params = {
                tokenIn: inputToken,
                tokenOut: outputToken,
                amountIn: amount.toString(),
                includeSources
            };

            const quoteResponse: any = await quoter.getRoutes(params);
            const routes = quoteResponse.routes;
            const tradeBuilder = new TradeBuilder('mainnet', routes);

            const trade = tradeBuilder
                .sender(address)
                .amountIn(quoteResponse.amountIn)
                .amountOut(quoteResponse.amountOut)
                .slippage((5 / 100) * 1e6) // Slippage 1%
                .deadline(Date.now() + 3600) // 1 hour from now
                .build();

            const client: any = await getClient();
            const tx = await trade.buildTransaction({client});

            return tx;
        } catch (error) {
            console.log(error);
            await sleep(1000)
            printToFile(fileName, threadNumber, "get swap instruction error", error)
        }
    }
}


const getIncludeSources = (poolType: any) => {
    let includeSources: Protocol[];

    switch (poolType) {
        case 'cetus':
            includeSources = [Protocol.CETUS];
            break;
        case 'turbos':
            includeSources = [Protocol.TURBOS_FIANCE];
            break;
        case 'bluemove':
            includeSources = [Protocol.BLUEMOVE];
            break;
        case 'flowx':
            includeSources = [Protocol.FLOWX_V2, Protocol.FLOWX_V3];
            break;
        default:
            includeSources = [Protocol.CETUS];
            break;
    }

    return includeSources;
}