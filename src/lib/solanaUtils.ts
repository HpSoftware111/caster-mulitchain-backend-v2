import { AccountInfo, AddressLookupTableAccount, Commitment, ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction, sendAndConfirmTransaction, sendAndConfirmRawTransaction } from "@solana/web3.js";
import { solanaConfig } from "../config";
import { printToFile, sleep } from "./utils";
import { Account, TOKEN_PROGRAM_ID, createCloseAccountInstruction, getAccount, getAssociatedTokenAddressSync, getAssociatedTokenAddress, getTokenMetadata, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountInstruction, getMint, createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction } from "@solana/spl-token";

import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { PumpFun } from "./solana/idl/pump-fun";
import IDL from "./solana/idl/pump-fun.json";
import getBondingCurvePDA from "./solana/getBondingCurvePDA";
import tokenDataFromBondingCurveTokenAccBuffer from "./solana/tokenDataFromBondingCurveTokenAccBuffer";
import getBuyPrice from "./solana/getBuyPrice";
import getSellPrice from "./solana/getSellPrice";
import getBondingCurveTokenAccountWithRetry from "./solana/getBondingCurveTokenAccountWithRetry";
import { BN } from "bn.js";
import { GlobalAccount } from "./solana/globalAccount";

import {
    ApiPoolInfoV4,
    LIQUIDITY_STATE_LAYOUT_V4,
    Liquidity,
    LiquidityPoolKeys,
    MAINNET_PROGRAM_ID,
    MARKET_STATE_LAYOUT_V3,
    Market,
    Percent,
    RAYDIUM_MAINNET,
    SPL_ACCOUNT_LAYOUT,
    SPL_MINT_LAYOUT,
    Token,
    TokenAmount,
    jsonInfo2PoolKeys,
    swapInstruction,
} from "@raydium-io/raydium-sdk";

import base58 from "bs58";

export const GLOBAL_ACCOUNT_SEED = "global";
export const DEFAULT_COMMITMENT: Commitment = "finalized";
const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

export const getConnection = async () => {
    while (true) {
        try {
            const connection = new Connection(solanaConfig.rpc)
            return connection
        } catch (error) {
            await sleep(1000)
        }
    }
}

export const isNewPool = async (tokenMint: string, poolType: string) => {
    while (true) {

        try {
            const quoteName = poolType

            const req = `${solanaConfig.jupiterLink}/quote?inputMint=${solanaConfig.wsol}&outputMint=${tokenMint}&amount=${1000000000}&dexes=${quoteName}&api_key=43dc53bb-6134-44ff-8b6c-7ee4d9a595bb`
            const quoteResponse = await (
                await fetch(req
                )
            ).json();
            // console.log("poolExist", tokenMint, quoteResponse)
            if (quoteResponse.error) {
                const poolExist = await poolExistsPublic(tokenMint, poolType)
                return poolExist
            }
            else {
                return false
            }
        } catch (error) {
            await sleep(1000)
        }
    }
}


export const poolExistsPublic = async (tokenMint: string, poolType: string) => {
    // raydium
    while (true) {

        try {
            const quoteName = poolType

            const req = `${solanaConfig.jupiterPublicLink}/quote?inputMint=${solanaConfig.wsol}&outputMint=${tokenMint}&amount=${1000000000}&dexes=${quoteName}`
            const quoteResponse = await (
                await fetch(req
                )
            ).json();
            console.log("poolExistPublic", tokenMint, quoteResponse)
            if (quoteResponse.error) {
                return false
            }
            else {
                const pairAddress = quoteResponse.routePlan[0].swapInfo.ammKey;
                console.log("new pair", tokenMint, pairAddress)
                const res = await fetch(`${solanaConfig.jupiterLink}/markets?api_key=43dc53bb-6134-44ff-8b6c-7ee4d9a595bb`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        poolAddress: quoteResponse.routePlan[0].swapInfo.ammKey
                    }),
                    redirect: "follow"
                })
                if (res.status == 200) {
                    console.log("added new pair", tokenMint, pairAddress, res)
                    return true
                } else {
                    console.log("add new pair error", tokenMint, pairAddress, res)
                    return false
                }
            }
        } catch (error) {
            await sleep(1000)
        }
    }
}


export const poolExistsSol = async (tokenMint: string, poolType: string) => {
    const isToken2022 = await validateToken2022(tokenMint);

    if (isToken2022) return false;

    if (poolType != "pump") {
        // raydium
        let retryCount = 0
        while (true) {

            try {
                const quoteName = poolType

                let req = `${solanaConfig.jupiterLink}/quote?inputMint=${solanaConfig.wsol}&outputMint=${tokenMint}&amount=${1000000000}&dexes=${quoteName}&api_key=43dc53bb-6134-44ff-8b6c-7ee4d9a595bb`
                const qnMarketCache = "&useQNMarketCache=true"
                if (quoteName.indexOf("Raydium") >= 0) {
                    req += qnMarketCache
                }
                const quoteResponse = await (
                    await fetch(req
                    )
                ).json();
                console.log("poolExist", tokenMint, quoteResponse)
                if (quoteResponse.error) {
                    if (retryCount > 0) {
                        return false
                    }
                    const publicExists = await poolExistsPublic(tokenMint, poolType)
                    if (publicExists) {
                        retryCount++
                        await sleep(1000)
                        continue
                    }
                    else {
                        return false
                    }
                }
                else {
                    return true
                }
            } catch (error) {
                await sleep(1000)
            }
        }
    } else {
        //pumpfun
        let count = 0;
        while (true) {
            await sleep(100)
            if (count > 3) {
                return false
            }
            try {
                const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        "publicKey": "9k2XAfLBFpWWcCP6kYtyzFejzu7y7YsnxZN1bbZe8NpA",  // Your wallet public key
                        "action": "buy",    // "buy" or "sell"
                        "mint": tokenMint,         // contract address of the token you want to trade
                        "denominatedInSol": "true",     // "true" if amount is amount of SOL, "false" if amount is number of tokens
                        "amount": 0.1,                  // amount of SOL or tokens
                        "slippage": 5,                  // percent slippage allowed
                        "priorityFee": 0.0001,          // priority fee
                        "pool": "pump"                   // exchange to trade on. "pump" or "raydium"
                    })
                });
                if (response.status === 200) { // successfully generated transaction
                    return true
                } else {
                    count++
                }
            } catch (error) {
                count++
            }
        }
    }
}


export const sendAllSol = async (
    connection: Connection,
    from: Keypair,
    to: PublicKey,
    fileName: string
) => {
    await sleep(1000)
    let maxLamports = solanaConfig.maxLamportsNormal;
    let count = 0;
    while (true) {
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: maxLamports,
        });
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 500,
        });
        try {
            const balance = await connection.getBalance(from.publicKey, "confirmed")
            if (balance == 0) return;
            const initialSolAmount =
                (balance) -
                (maxLamports == solanaConfig.maxLamportsHigh
                    ? solanaConfig.gasFeeSendSolHigh
                    : solanaConfig.gasFeeSendSolNormal);

            const transaction = new Transaction()
                .add(addPriorityFee)
                .add(modifyComputeUnits)
                .add(
                    SystemProgram.transfer({
                        fromPubkey: from.publicKey,
                        toPubkey: to,
                        lamports: initialSolAmount,
                    })
                );
            const latestBlockhash = await connection.getLatestBlockhashAndContext();
            transaction.recentBlockhash = latestBlockhash.value.blockhash;
            transaction.lastValidBlockHeight = latestBlockhash.context.slot + 150

            const signature = await sendAndConfirmTransaction(
                connection,
                transaction,
                [from],
                {
                    skipPreflight: true,
                    maxRetries: solanaConfig.maxRetries,
                    commitment: "confirmed",
                }
            );
            return { txid: signature, count };

        } catch (error) {
            await sleep(1000);
            printToFile(fileName, "send all sol error", error);
            count++;
            if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh;
            continue;
        }
    }
};

export const sendAllSolToSignWallet = async (
    connection: Connection,
    from: Keypair,
    to: PublicKey,
    fileName: string,
    threadNumber: number
) => {
    await sleep(1000)
    let maxLamports = solanaConfig.maxLamportsNormal;
    let count = 0;
    while (true) {
        if (count > 10)
            break;
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: maxLamports,
        });
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 500,
        });
        try {
            const balance = await connection.getBalance(from.publicKey, "confirmed")
            if (balance == 0) {
                count++;
                await sleep(1000);
                continue;
            }
            const initialSolAmount =
                (balance) -
                (maxLamports == solanaConfig.maxLamportsHigh
                    ? solanaConfig.gasFeeSendSolHigh
                    : solanaConfig.gasFeeSendSolNormal);

            const transaction = new Transaction()
                .add(addPriorityFee)
                .add(modifyComputeUnits)
                .add(
                    SystemProgram.transfer({
                        fromPubkey: from.publicKey,
                        toPubkey: to,
                        lamports: initialSolAmount,
                    })
                );
            const latestBlockhash = await connection.getLatestBlockhashAndContext();
            transaction.recentBlockhash = latestBlockhash.value.blockhash;
            transaction.lastValidBlockHeight = latestBlockhash.context.slot + 150

            const signature = await sendAndConfirmTransaction(
                connection,
                transaction,
                [from],
                {
                    skipPreflight: true,
                    maxRetries: solanaConfig.maxRetries,
                    commitment: "confirmed",
                }
            );
            printToFile(fileName, threadNumber, "send all sol sign wallet");
            return { txid: signature, count };

        } catch (error) {
            await sleep(1000);
            printToFile(fileName, "send all sol error", error);
            count++;
            if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh;
            continue;
        }
    }
};

export const sendSol = async (
    connection: Connection,
    from: Keypair,
    to: PublicKey,
    amount: number,
    fileName: string,
    threadNumber: number
) => {
    let maxLamports = solanaConfig.maxLamportsNormal;
    let count = 0;
    let initialSolAmount = Math.floor(amount * LAMPORTS_PER_SOL);
    while (true) {
        await sleep(1000);
        const balance = await connection.getBalance(from.publicKey, "confirmed")

        if (balance == 0) return;
        if (balance < LAMPORTS_PER_SOL * amount) {
            initialSolAmount =
                (balance) -
                (maxLamports == solanaConfig.maxLamportsHigh
                    ? solanaConfig.gasFeeSendSolHigh
                    : solanaConfig.gasFeeSendSolNormal);
        }
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: maxLamports,
        });
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 500,
        });
        const transaction = new Transaction()
            .add(addPriorityFee)
            .add(modifyComputeUnits)
            .add(
                SystemProgram.transfer({
                    fromPubkey: from.publicKey,
                    toPubkey: to,
                    lamports: initialSolAmount,
                })
            );
        try {
            const latestBlockhash = await connection.getLatestBlockhashAndContext();
            transaction.recentBlockhash = latestBlockhash.value.blockhash;
            transaction.lastValidBlockHeight = latestBlockhash.context.slot + 150

            const signature = await sendAndConfirmTransaction(
                connection,
                transaction,
                [from],
                {
                    skipPreflight: true,
                    maxRetries: solanaConfig.maxRetries,
                    commitment: "confirmed",
                }
            );

            return { txid: signature, count };
        } catch (error) {
            await sleep(1000);
            printToFile(fileName, threadNumber, "send sol error", error);
            count++;
            if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh;
            if (count > 10) break
            continue;
        }
    }
};


export const closeTokenAccount = async (
    connection: Connection,
    mint: PublicKey,
    wallet: Keypair,
    fileName: string,
    threadNumber: number
) => {
    const thisAta = getAssociatedTokenAddressSync(mint, wallet.publicKey, true);

    let receiverTokenAccount: Account;
    try {
        receiverTokenAccount = await getAccount(connection, thisAta, "confirmed");
    } catch (e) {
        // If the account does not exist, add the create account instruction to the transaction
        return;
    }

    // close token account
    let maxLamports = solanaConfig.maxLamportsNormal;
    let count = 0;
    while (true) {
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: maxLamports,
        });
        try {
            const transaction = new Transaction();
            transaction.add(addPriorityFee);
            transaction.add(
                createCloseAccountInstruction(
                    thisAta,
                    wallet.publicKey,
                    wallet.publicKey,
                    [wallet.publicKey]
                )
            );
            transaction.feePayer = wallet.publicKey;
            const latestBlockhash = await connection.getLatestBlockhashAndContext();
            transaction.recentBlockhash = latestBlockhash.value.blockhash;
            transaction.lastValidBlockHeight = latestBlockhash.context.slot + 150

            const txid = await sendAndConfirmTransaction(
                connection,
                transaction,
                [wallet],
                { skipPreflight: true, maxRetries: solanaConfig.maxRetries, commitment: "confirmed" }
            );
            return { txid, count };

        } catch (error) {
            printToFile(fileName, threadNumber, "close token account error", error);
            count++;
            if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh;
            await sleep(1000);
        }
    }
};



export function generateRandomValues(sum: number, count: number) {
    // Generate 999 random values in the interval [0, sum)
    const randomPoints = Array.from(
        { length: count - 1 },
        () => Math.random() * sum
    );

    // Add the start (0) and end (sum) points
    randomPoints.push(0);
    randomPoints.push(sum);

    // Sort the points
    randomPoints.sort((a, b) => a - b);

    // Calculate the differences (i.e., the lengths of the segments)
    const randomValues = [];
    for (let i = 1; i < randomPoints.length; i++) {
        randomValues.push(randomPoints[i] - randomPoints[i - 1]);
    }

    return randomValues;
}

export function generateRandomOrder(count: number) {
    let numbers = Array.from({ length: count }, (_, i) => i);
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]]; // Swap elements
    }
    return numbers;
}

export const generateRandomNumber = (min: number, max: number) => {
    return Math.random() * (max - min) + min;
};

export const getBalance = async (
    address: PublicKey,
    connection: Connection
) => {
    while (true) {
        try {
            return await connection.getBalance(address, "confirmed");
            break;
        } catch (error) {
            await sleep(1000);
        }
    }
};

export async function getPumpfunSwapTransaction(address: PublicKey, tokenMint: string, isBuy: boolean, amount: number | string, pool: "pump" | "raydium", fileName: string, threadNumber: number, recentBlockhash: string) {
    while (true) {
        await sleep(600)
        try {
            const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "publicKey": address.toBase58(),  // Your wallet public key
                    "action": isBuy ? "buy" : "sell",                 // "buy" or "sell"
                    "mint": tokenMint,         // contract address of the token you want to trade
                    "denominatedInSol": isBuy ? "true" : "false",     // "true" if amount is amount of SOL, "false" if amount is number of tokens
                    "amount": amount,                  // amount of SOL or tokens
                    "slippage": 5,                  // percent slippage allowed
                    "priorityFee": 0.0001,          // priority fee
                    "pool": pool                   // exchange to trade on. "pump" or "raydium"
                })
            });
            if (response.status === 200) { // successfully generated transaction
                const data = await response.arrayBuffer();
                const tx = VersionedTransaction.deserialize(new Uint8Array(data));
                return { transaction: tx };
            } else {
                printToFile(fileName, threadNumber, response.statusText); // log error
            }
        } catch (error) {
            printToFile(fileName, threadNumber, error); // log error
        }
    }
}


export async function getPumpfunSwapTransactionWithSDK(connection: any, feePayer: PublicKey, wallet: any, tokenMint: string, isBuy: boolean, amount: number, maxLamports: number, recentBlockhash: string, isSendSol: boolean, createTokenAccount: boolean, fileName: string, threadNumber: number) {
    const slippage = 5;
    while (true) {
        await sleep(600)
        try {
            let instructions: any = [];
            const mint = new PublicKey(tokenMint);
            // Load Pumpfun provider
            const provider = new AnchorProvider(connection, new Wallet(wallet), {
                commitment: "finalized",
            });
            const program = new Program<PumpFun>(IDL as PumpFun, provider);

            // Get/Create token account
            const associatedUser = await getAssociatedTokenAddress(mint, wallet.publicKey, false);

            if (isBuy) {
                try {
                    await getAccount(connection, associatedUser, "finalized");
                } catch (e) {
                    if (createTokenAccount)
                        instructions.push(createAssociatedTokenAccountInstruction(wallet.publicKey, associatedUser, wallet.publicKey, mint));
                }
            }

            const programId = new PublicKey(solanaConfig.PUMPFUN_PROGRAM_ID!);

            const bondingCurve = getBondingCurvePDA(mint, programId);
            const associatedBondingCurve = await getAssociatedTokenAddress(mint, bondingCurve, true);
            // let BondingCurveTokenAccount: web3.AccountInfo<Buffer> | null = null;

            const bondingCurveTokenAccount = await getBondingCurveTokenAccountWithRetry(
                connection,
                bondingCurve,
                solanaConfig.BOANDING_CURVE_ACC_RETRY_AMOUNT,
                solanaConfig.BOANDING_CURVE_ACC_RETRY_DELAY
            );

            if (bondingCurveTokenAccount === null) {
                printToFile(fileName, threadNumber, "Bonding curve account not found");
                return { transaction: undefined };
            }
            const tokenData = tokenDataFromBondingCurveTokenAccBuffer(bondingCurveTokenAccount!.data);
            if (tokenData.complete) {
                printToFile(fileName, threadNumber, "Bonding curve already completed");
                return { transaction: undefined };
            }

            const FEE_RECEIPT = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");

            // request a specific compute unit budget
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
                units: 1000000,
            });

            // set the desired priority fee
            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: maxLamports,
            });

            instructions.push(modifyComputeUnits);
            instructions.push(addPriorityFee);
            let buyAmountToken = BigInt(0);
            const SLIPAGE_POINTS = BigInt(slippage * 100);
            if (isBuy) {
                const solAmountLamp = BigInt(Math.floor(amount * LAMPORTS_PER_SOL));
                buyAmountToken = getBuyPrice(solAmountLamp, tokenData);
                const buyAmountSolWithSlippage = solAmountLamp + (solAmountLamp * SLIPAGE_POINTS) / BigInt(10000);

                const swapInstruction = await program.methods
                    .buy(new BN(buyAmountToken.toString()), new BN(buyAmountSolWithSlippage.toString()))
                    .accounts({
                        feeRecipient: FEE_RECEIPT,
                        mint: mint,
                        associatedBondingCurve: associatedBondingCurve,
                        associatedUser: associatedUser,
                        user: wallet.publicKey,
                    })
                    .transaction();
                instructions.push(swapInstruction.instructions[0]);
            } else {
                const globalAccount = await getGlobalAccount(DEFAULT_COMMITMENT);
                let minSolOutput = getSellPrice(BigInt(amount), tokenData, globalAccount.feeBasisPoints);
                let sellAmountWithSlippage = minSolOutput - (minSolOutput * SLIPAGE_POINTS) / BigInt(10000);
                const swapInstruction = await program.methods
                    .sell(new BN(amount), new BN(sellAmountWithSlippage.toString()))
                    .accounts({
                        feeRecipient: FEE_RECEIPT,
                        mint: mint,
                        associatedBondingCurve: associatedBondingCurve,
                        associatedUser: associatedUser,
                        user: wallet.publicKey,
                    })
                    .transaction();
                instructions.push(swapInstruction.instructions[0]);
                const thisAta = getAssociatedTokenAddressSync(new PublicKey(tokenMint), wallet.publicKey, true)
                const closeInstruction = createCloseAccountInstruction(thisAta, wallet.publicKey, wallet.publicKey)
                //instructions.push(closeInstruction);
            }

            if (isSendSol) {
                instructions.push(
                    SystemProgram.transfer({
                        fromPubkey: feePayer,
                        toPubkey: wallet.publicKey,
                        lamports: (0.01108 * LAMPORTS_PER_SOL)
                    }))
            }

            const messageV0 = new TransactionMessage({
                payerKey: feePayer,
                recentBlockhash: recentBlockhash,
                instructions: instructions,
            }).compileToV0Message();
            const transaction = new VersionedTransaction(messageV0);

            return { transaction, buyAmountToken: Number(buyAmountToken) };
        } catch (error) {
            printToFile(fileName, threadNumber, error); // log error
        }
    }
}



export const getSwapTransaction = async (connection: Connection, address: PublicKey, inputMint: string, outputMint: string, amount: number, maxLamports: number, fileName: string, threadNumber: number, recentBlockhash: string, poolType: string, instructionToAdd: TransactionInstruction | undefined) => {
    while (true) {
        await sleep(500)
        const tokenMint = inputMint == solanaConfig.wsol ? outputMint : inputMint
        // const newPool = await isNewPool(tokenMint, poolType)
        // const jupiterLink = newPool ? solanaConfig.jupiterPublicLink : solanaConfig.jupiterLink
        const jupiterLink = solanaConfig.jupiterLink;
        const quoteName = poolType;

        console.log("getSwapTransaction");

        try {
            let req = `${jupiterLink}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&autoSlippage=true&maxAutoSlippageBps=1000&dexes=${quoteName}&api_key=43dc53bb-6134-44ff-8b6c-7ee4d9a595bb`
            const qnMarketCache = "&useQNMarketCache=true"
            if (quoteName.indexOf("Raydium") >= 0) {
                req += qnMarketCache
            }
            const quoteResponse = await (
                await fetch(req
                )
            ).json();
            const response = await fetch(`${jupiterLink}/swap-instructions?api_key=43dc53bb-6134-44ff-8b6c-7ee4d9a595bb`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    // quoteResponse from /quote api
                    quoteResponse,
                    // user public key to be used for the swap
                    userPublicKey: address.toBase58(),
                    // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
                    // feeAccount: "fee_account_public_key"
                    dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
                    // custom priority fee
                    // prioritizationFeeLamports: maxLamports == solanaConfig.maxLamportsNormal ? 'auto' : solanaConfig.maxLamportsHigh, // or custom lamports: 1000
                    prioritizationFeeLamports: maxLamports, // or custom lamports: 1000
                    asLegacyTransaction: false,
                    useQNMarketCache: true
                })
            })
            const instructions = await response.json();
            if (instructions.error) {
                throw new Error("Failed to get swap instructions: " + instructions.error);
            }

            const {
                tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
                computeBudgetInstructions, // The necessary instructions to setup the compute budget.
                setupInstructions, // Setup missing ATA for the users.
                swapInstruction: swapInstructionPayload, // The actual swap instruction.
                cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
                addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
            } = instructions;

            const deserializeInstruction = (instruction: any) => {
                return new TransactionInstruction({
                    programId: new PublicKey(instruction.programId),
                    keys: instruction.accounts.map((key: any) => ({
                        pubkey: new PublicKey(key.pubkey),
                        isSigner: key.isSigner,
                        isWritable: key.isWritable,
                    })),
                    data: Buffer.from(instruction.data, "base64"),
                });
            };

            const getAddressLookupTableAccounts = async (
                keys: string[]
            ): Promise<AddressLookupTableAccount[]> => {
                const addressLookupTableAccountInfos =
                    await connection.getMultipleAccountsInfo(
                        keys.map((key) => new PublicKey(key))
                    );

                return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
                    const addressLookupTableAddress = keys[index];
                    if (accountInfo) {
                        const addressLookupTableAccount = new AddressLookupTableAccount({
                            key: new PublicKey(addressLookupTableAddress),
                            state: AddressLookupTableAccount.deserialize(accountInfo.data),
                        });
                        acc.push(addressLookupTableAccount);
                    }

                    return acc;
                }, new Array<AddressLookupTableAccount>());
            };

            const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

            addressLookupTableAccounts.push(
                ...(await getAddressLookupTableAccounts(addressLookupTableAddresses))
            );

            const ixs = [
                ...computeBudgetInstructions.map(deserializeInstruction), // The necessary instructions to setup the compute budget.
                ...setupInstructions.map(deserializeInstruction),
                deserializeInstruction(swapInstructionPayload),
                deserializeInstruction(cleanupInstruction)
            ]
            if (instructionToAdd) {
                ixs.push(instructionToAdd)
            }
            const messageV0 = new TransactionMessage({
                payerKey: address,
                recentBlockhash: recentBlockhash,
                instructions: ixs,
            }).compileToV0Message(addressLookupTableAccounts);
            const transaction = new VersionedTransaction(messageV0);
            return transaction
        } catch (error) {
            printToFile(fileName, threadNumber, "get swap instruction error", error)
        }
    }
}


export const getSwapTransactionWithJito = async (connection: Connection, feePayerAddress: PublicKey, address: PublicKey, inputMint: string, outputMint: string, amount: number, maxLamports: number, fileName: string, threadNumber: number, recentBlockhash: string, poolType: string, swapMode: "ExactIn" | "ExactOut", instructionToAdd: TransactionInstruction | undefined) => {

    while (true) {
        await sleep(500);
        const t0 = performance.now();
        const tokenMint = inputMint == solanaConfig.wsol ? outputMint : inputMint
        // const newPool = await isNewPool(tokenMint, poolType)
        // const jupiterLink = newPool ? solanaConfig.jupiterPublicLink : solanaConfig.jupiterLink
        const jupiterLink = solanaConfig.jupiterLink
        const quoteName = poolType
        try {
            let req = `${jupiterLink}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&autoSlippage=true&maxAutoSlippageBps=4500&dexes=${quoteName}&swapMode=${swapMode}&api_key=43dc53bb-6134-44ff-8b6c-7ee4d9a595bb`
            const qnMarketCache = "&useQNMarketCache=true"
            if (poolType == "0") {
                req += qnMarketCache
            }
            const quoteResponse = await (
                await fetch(req
                )
            ).json();

            printToFile(fileName, threadNumber, "Jupiter quote response", JSON.stringify(quoteResponse))

            const response = await fetch(`${jupiterLink}/swap-instructions?api_key=43dc53bb-6134-44ff-8b6c-7ee4d9a595bb`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    // quoteResponse from /quote api
                    quoteResponse,
                    // user public key to be used for the swap
                    userPublicKey: address.toBase58(),
                    // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
                    // feeAccount: "fee_account_public_key"
                    dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
                    // custom priority fee
                    // prioritizationFeeLamports: maxLamports == solanaConfig.maxLamportsNormal ? 'auto' : solanaConfig.maxLamportsHigh, // or custom lamports: 1000
                    prioritizationFeeLamports: maxLamports, // or custom lamports: 1000
                    asLegacyTransaction: false,
                    useQNMarketCache: true
                })
            })
            if (response.status != 200) {
                console.log(response)
            }
            const instructions = await response.json();
            if (instructions.error) {
                throw new Error("Failed to get swap instructions: " + instructions.error);
            }

            const {
                tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
                computeBudgetInstructions, // The necessary instructions to setup the compute budget.
                setupInstructions, // Setup missing ATA for the users.
                swapInstruction: swapInstructionPayload, // The actual swap instruction.
                cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
                addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
            } = instructions;

            const deserializeInstruction = (instruction: any) => {
                return new TransactionInstruction({
                    programId: new PublicKey(instruction.programId),
                    keys: instruction.accounts.map((key: any) => ({
                        pubkey: new PublicKey(key.pubkey),
                        isSigner: key.isSigner,
                        isWritable: key.isWritable,
                    })),
                    data: Buffer.from(instruction.data, "base64"),
                });
            };

            const getAddressLookupTableAccounts = async (
                keys: string[]
            ): Promise<AddressLookupTableAccount[]> => {
                const addressLookupTableAccountInfos =
                    await connection.getMultipleAccountsInfo(
                        keys.map((key) => new PublicKey(key))
                    );

                return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
                    const addressLookupTableAddress = keys[index];
                    if (accountInfo) {
                        const addressLookupTableAccount = new AddressLookupTableAccount({
                            key: new PublicKey(addressLookupTableAddress),
                            state: AddressLookupTableAccount.deserialize(accountInfo.data),
                        });
                        acc.push(addressLookupTableAccount);
                    }

                    return acc;
                }, new Array<AddressLookupTableAccount>());
            };

            const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

            addressLookupTableAccounts.push(
                ...(await getAddressLookupTableAccounts(addressLookupTableAddresses))
            );

            const ixs = [
                ...computeBudgetInstructions.map(deserializeInstruction), // The necessary instructions to setup the compute budget.
                ...setupInstructions.map(deserializeInstruction),
                deserializeInstruction(swapInstructionPayload),
                deserializeInstruction(cleanupInstruction)
            ]
            if (instructionToAdd) {
                ixs.push(instructionToAdd)
            }
            const messageV0 = new TransactionMessage({
                payerKey: feePayerAddress,
                recentBlockhash: recentBlockhash,
                instructions: ixs,
            }).compileToV0Message(addressLookupTableAccounts);
            const transaction = new VersionedTransaction(messageV0);

            const t1 = performance.now();
            printToFile(fileName, threadNumber, `Juipter took ${t1 - t0} milliseconds.`)
            return { transaction, quoteResponse }
        } catch (error) {
            printToFile(fileName, threadNumber, "get swap instruction error", error)
        }
    }
}


export const getTokenBalance = async (ata: PublicKey, connection: Connection) => {
    let tokenAmount
    let receiverTokenAccount
    try {
        receiverTokenAccount = await getAccount(
            connection,
            ata,
            "confirmed",
            TOKEN_PROGRAM_ID
        )
        while (true) {
            try {
                const tokenAmountObj = await connection.getTokenAccountBalance(ata, "confirmed")
                tokenAmount = parseInt(tokenAmountObj.value.amount)
                break
            } catch (error) {
                await sleep(1000)
            }
        }
    } catch (e) {
        tokenAmount = 0
    }

    return tokenAmount
}


export const getTxFee = async (connection: Connection, txid: string) => {
    while (true) {
        try {
            await sleep(500)
            const txData = await connection.getTransaction(txid, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
            if (!txData?.meta?.fee) continue
            return txData?.meta?.fee
        } catch (error) {

        }
    }
}



export function isBase58SolanaWalletAddress(address: string) {
    try {
        // Decode the base58 string
        const decoded = base58.decode(address);

        // Check if the decoded length is 32 bytes
        if (decoded.length !== 32) {
            return false;
        }

        // Construct a PublicKey object to further validate
        const publicKey = new PublicKey(address);

        // Check if it is a valid PublicKey
        return true;
    } catch (error) {
        // If any error occurs during decoding or PublicKey construction, it's invalid
        return false;
    }
}

const getAddressLookupTableAccounts = async (
    connection: Connection,
    keys: PublicKey[]
): Promise<AddressLookupTableAccount[]> => {
    const addressLookupTableAccountInfos =
        await connection.getMultipleAccountsInfo(keys);

    return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
        const addressLookupTableAddress = keys[index];
        if (accountInfo) {
            const addressLookupTableAccount = new AddressLookupTableAccount({
                key: addressLookupTableAddress,
                state: AddressLookupTableAccount.deserialize(accountInfo.data),
            });
            acc.push(addressLookupTableAccount);
        }

        return acc;
    }, new Array<AddressLookupTableAccount>());
};

export const validateToken2022 = async (tokenMint: string) => {
    const connection = await getConnection();
    try {
        const metadata = await getTokenMetadata(
            connection, // Connection instance
            new PublicKey(tokenMint), // PubKey of the Mint Account
            'confirmed', // Commitment, can use undefined to use default
            TOKEN_2022_PROGRAM_ID,
        )
        return true;
    } catch (error) {
        return false;
    }
}

export const swapAllToken = async (
    connection: Connection,
    tokenMint: string,
    wallet: Keypair,
    poolType: string,
    fileName: string,
    threadNumber: number
) => {

    const thisAta = getAssociatedTokenAddressSync(new PublicKey(tokenMint), wallet.publicKey, true)
    let maxLamports = solanaConfig.maxLamportsNormal;
    let count = 0;
    while (true) {
        try {
            const tokenAmount = await getTokenBalance(thisAta, connection)
            if (tokenAmount == 0) {
                break;
            }
            printToFile(fileName, threadNumber, "token balance", wallet.publicKey.toBase58(), tokenAmount)

            const closeInstruction = createCloseAccountInstruction(thisAta, wallet.publicKey, wallet.publicKey)
            const latestBlockhash = await connection.getLatestBlockhash();
            let transaction: VersionedTransaction;
            if (poolType == 'pump') {
                const pumpFunRes: any = await getPumpfunSwapTransactionWithSDK(connection, wallet.publicKey, wallet, tokenMint, false, tokenAmount, solanaConfig.maxLamportsNormal, latestBlockhash.blockhash, false, true, fileName, threadNumber);
                transaction = pumpFunRes.transaction;
                if (!transaction) break;
            }

            else transaction = await getSwapTransaction(connection, wallet.publicKey, tokenMint, solanaConfig.wsol, Math.floor(tokenAmount), maxLamports, fileName, threadNumber, latestBlockhash.blockhash, poolType, closeInstruction)

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

            break;
        } catch (error) {
            await sleep(1000)
            printToFile(fileName, threadNumber, "sell token error", error)
            count++
            if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh
            continue
        }
    }

};

export async function getRaydiumSwapTransaction(
    connection: Connection,
    feePayerAddress: PublicKey,
    fromAddress: PublicKey,
    toToken: string,
    fromToken: string,
    amount: number,
    poolKeys: LiquidityPoolKeys,
    solTransferAmount: number,
    maxLamports: number = 10000,
    useVersionedTransaction = true,
    fixedSide: 'in' | 'out' = 'in',

) {
    const directionIn = poolKeys.quoteMint.toString() == toToken

    if (fixedSide == 'out') {
        const mintInfo = await getMint(connection, new PublicKey(fromToken));
        amount = amount / Math.pow(10, mintInfo.decimals)
    }
    const { minAmountOut, amountIn } = await calcAmountOut(connection, poolKeys, amount, directionIn)
    const userTokenAccounts = await getOwnerTokenAccounts(connection, fromAddress)
    const swapTransaction = await Liquidity.makeSwapInstructionSimple({
        connection: connection,
        makeTxVersion: useVersionedTransaction ? 0 : 1,
        poolKeys: {
            ...poolKeys,
        },
        userKeys: {
            tokenAccounts: userTokenAccounts,
            owner: fromAddress,
        },
        amountIn: amountIn,
        amountOut: minAmountOut,
        fixedSide: 'in',
        config: {
            bypassAssociatedCheck: false,
        },
        computeBudgetConfig: {
            microLamports: maxLamports,
        },
    })

    const recentBlockhashForSwap = await connection.getLatestBlockhash()
    const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean)
    if (solTransferAmount > 0) {
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: feePayerAddress,
                toPubkey: fromAddress,
                lamports: solTransferAmount
            }))
    }

    if (useVersionedTransaction) {
        const versionedTransaction: any = new VersionedTransaction(
            new TransactionMessage({
                payerKey: feePayerAddress,
                recentBlockhash: recentBlockhashForSwap.blockhash,
                instructions: instructions,
            }).compileToV0Message()
        )
        return { transaction: versionedTransaction, buyAmountToken: minAmountOut.numerator.toNumber() }
    }

    const legacyTransaction = new Transaction({
        blockhash: recentBlockhashForSwap.blockhash,
        lastValidBlockHeight: recentBlockhashForSwap.lastValidBlockHeight,
        feePayer: feePayerAddress,
    })

    legacyTransaction.add(...instructions)

    return legacyTransaction
}

export async function calcAmountOut(connection: Connection, poolKeys: LiquidityPoolKeys, rawAmountIn: number, swapInDirection: boolean) {
    const poolInfo = await Liquidity.fetchInfo({ connection: connection, poolKeys })

    let currencyInMint = poolKeys.baseMint
    let currencyInDecimals = poolInfo.baseDecimals
    let currencyOutMint = poolKeys.quoteMint
    let currencyOutDecimals = poolInfo.quoteDecimals

    if (!swapInDirection) {
        currencyInMint = poolKeys.quoteMint
        currencyInDecimals = poolInfo.quoteDecimals
        currencyOutMint = poolKeys.baseMint
        currencyOutDecimals = poolInfo.baseDecimals
    }

    const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals)
    const amountIn = new TokenAmount(currencyIn, rawAmountIn, false)
    const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals)
    const slippage = new Percent(5, 100) // 5% slippage

    const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn,
        currencyOut,
        slippage,
    })

    return {
        amountIn,
        amountOut,
        minAmountOut,
        currentPrice,
        executionPrice,
        priceImpact,
        fee,
    }
}

export async function getOwnerTokenAccounts(connection: Connection, publicKey: PublicKey) {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
    })

    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }))
}

// Define a function to fetch and decode Market accounts
export async function fetchMarketAccounts(
    connection: Connection,
    base: string,
    quote: string,
    commitment: Commitment
) {
    let allAccounts: {
        account: AccountInfo<Buffer>;
        /** the account Pubkey as base-58 encoded string */
        pubkey: PublicKey;
    }[] = [];
    try {
        const accounts = await connection.getProgramAccounts(
            MAINNET_PROGRAM_ID.AmmV4,
            {
                commitment,
                filters: [
                    { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
                    {
                        memcmp: {
                            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
                            bytes: base,
                        },
                    },
                    {
                        memcmp: {
                            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
                            bytes: quote,
                        },
                    },
                ],
            }
        );
        const reverseAccounts = await connection.getProgramAccounts(
            MAINNET_PROGRAM_ID.AmmV4,
            {
                commitment,
                filters: [
                    { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
                    {
                        memcmp: {
                            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
                            bytes: quote,
                        },
                    },
                    {
                        memcmp: {
                            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
                            bytes: base,
                        },
                    },
                ],
            }
        );
        allAccounts.push(...accounts);
        allAccounts.push(...reverseAccounts);
        if (allAccounts.length > 0) {
            return allAccounts[0].pubkey.toBase58();
        } else {
            return null;
        }
    } catch (error) {
        console.log("get pool info error", error)
        return null
    }
}

export async function formatAmmKeysById(
    connection: Connection,
    id: string
): Promise<ApiPoolInfoV4> {
    const account = await connection.getAccountInfo(new PublicKey(id));
    if (account === null) throw Error(" get id info error ");
    const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data);
    const marketId = info.marketId;
    const marketAccount = await connection.getAccountInfo(marketId);
    if (marketAccount === null) throw Error(" get market info error");
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
    const lpMint = info.lpMint;
    const lpMintAccount = await connection.getAccountInfo(lpMint);
    if (lpMintAccount === null) throw Error(" get lp mint info error");
    const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data);
    return {
        id,
        baseMint: info.baseMint.toString(),
        quoteMint: info.quoteMint.toString(),
        lpMint: info.lpMint.toString(),
        baseDecimals: info.baseDecimal.toNumber(),
        quoteDecimals: info.quoteDecimal.toNumber(),
        lpDecimals: lpMintInfo.decimals,
        version: 4,
        programId: account.owner.toString(),
        authority: Liquidity.getAssociatedAuthority({
            programId: account.owner,
        }).publicKey.toString(),
        openOrders: info.openOrders.toString(),
        targetOrders: info.targetOrders.toString(),
        baseVault: info.baseVault.toString(),
        quoteVault: info.quoteVault.toString(),
        withdrawQueue: info.withdrawQueue.toString(),
        lpVault: info.lpVault.toString(),
        marketVersion: 3,
        marketProgramId: info.marketProgramId.toString(),
        marketId: info.marketId.toString(),
        marketAuthority: Market.getAssociatedAuthority({
            programId: info.marketProgramId,
            marketId: info.marketId,
        }).publicKey.toString(),
        marketBaseVault: marketInfo.baseVault.toString(),
        marketQuoteVault: marketInfo.quoteVault.toString(),
        marketBids: marketInfo.bids.toString(),
        marketAsks: marketInfo.asks.toString(),
        marketEventQueue: marketInfo.eventQueue.toString(),
        lookupTableAccount: PublicKey.default.toString(),
    };
}

export const createTokenAccount = async (
    connection: Connection,
    mint: PublicKey,
    wallet: Keypair,
    fileName: string,
    threadNumber: number
) => {
    const thisAta = getAssociatedTokenAddressSync(mint, wallet.publicKey, true);

    let receiverTokenAccount: any;
    try {
        receiverTokenAccount = await getAccount(connection, thisAta, "confirmed");
    } catch (e) {

    }
    if (receiverTokenAccount) return;

    // close token account
    let maxLamports = solanaConfig.maxLamportsNormal;
    let count = 0;
    while (true) {
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: maxLamports,
        });
        try {
            const transaction = new Transaction();
            transaction.add(addPriorityFee);
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    wallet.publicKey,
                    thisAta,
                    wallet.publicKey,
                    mint
                )
            );
            transaction.feePayer = wallet.publicKey;
            const latestBlockhash = await connection.getLatestBlockhashAndContext();
            transaction.recentBlockhash = latestBlockhash.value.blockhash;
            transaction.lastValidBlockHeight = latestBlockhash.context.slot + 150

            const txid = await sendAndConfirmTransaction(
                connection,
                transaction,
                [wallet],
                { skipPreflight: true, maxRetries: solanaConfig.maxRetries, commitment: "confirmed" }
            );
            return { txid, count };

        } catch (error) {
            printToFile(fileName, threadNumber, "create token account error", error);
            count++;
            if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh;
            await sleep(1000);
        }
    }
};

export const getGlobalAccount = async (commitment: Commitment = DEFAULT_COMMITMENT) => {
    const [globalAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_ACCOUNT_SEED)],
        new PublicKey(PROGRAM_ID)
    );
    const connection = await getConnection();
    const tokenAccount = await connection.getAccountInfo(
        globalAccountPDA,
        commitment
    );

    return GlobalAccount.fromBuffer(tokenAccount!.data);
}


export const sendToken = async (
    connection: Connection,
    from: Keypair,
    to: PublicKey,
    tokenMint: string,
    amount: number,
    fileName: string,
    threadNumber: number
) => {
    const ata = getAssociatedTokenAddressSync(new PublicKey(tokenMint), from.publicKey, true)
    const nextAta = getAssociatedTokenAddressSync(new PublicKey(tokenMint), to, true)
    let maxLamports = solanaConfig.maxLamportsHigh;
    let count = 0;
    while (true) {
        const transaction = new Transaction()

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: maxLamports,
        });
        transaction.add(addPriorityFee)

        transaction.add(createAssociatedTokenAccountIdempotentInstruction(from.publicKey, nextAta, to, new PublicKey(tokenMint)))

        // Add token transfer instructions to transaction
        transaction.add(
            createTransferInstruction(
                ata,
                nextAta,
                from.publicKey,
                amount,
            ),
        );

        try {
            const latestBlockhash = await connection.getLatestBlockhashAndContext();
            transaction.recentBlockhash = latestBlockhash.value.blockhash;
            transaction.lastValidBlockHeight = latestBlockhash.context.slot + 150
            const txid = await sendAndConfirmTransaction(connection, transaction, [from], { skipPreflight: true, maxRetries: 10, commitment: "confirmed" });
            printToFile(fileName, threadNumber, "send token success", txid);
            break;
        } catch (error) {
            await sleep(1000);
            printToFile(fileName, threadNumber, "send token error", error);
            count++;
            if (count >= solanaConfig.normalFeeRetryCount) maxLamports = solanaConfig.maxLamportsHigh;
            if (count > 10) break;
        }
    }
}