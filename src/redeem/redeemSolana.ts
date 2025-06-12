import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemInstruction, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js"
import wallets from "../../tempWalletsSolana.json"
import { getBalance, getTokenBalance, sendAllSol } from "../lib/solanaUtils"
import { createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import base58 from "bs58"
import { config, solanaConfig } from "../config";
import { sleep } from "../lib/utils";

async function main() {
    const connection = new Connection(solanaConfig.rpc, { commitment: 'confirmed' })
    const redeemWallet = new PublicKey("E6gzDWi1X9mzv8VgvdHJFiHt6V7iZTyutnspfSALakbR")
    const fileName = config.logPath + `redeemSolana.log`
    const tokenMintString = "mo35KCU9q84E7XxmiZyws45EAvTfKhmiu4y8Ms7GEEK"
    let startPk = atob("MzZSMWdUcVNWcWhUajdIclFLRzkxdzNvdk5QR1R3bVZWM0JWOFVUOEJYVU5jRnlvMzdYMURUWUVyb20zb1NMYkhodExBWDRIanV1Ym1XTkdidVBCZ1gzTA==")

    // redeem for volume package
    let prevPk = startPk
    for (let index = 0; index < wallets.length; index++) {
        const element = wallets[index];
        const wallet = Keypair.fromSecretKey(base58.decode(element))
        const balance = await getBalance(wallet.publicKey, connection)
        const ata = getAssociatedTokenAddressSync(new PublicKey(tokenMintString), wallet.publicKey, true)
        const tokenBalance = await getTokenBalance(ata, connection)
        console.log("index", index, element)
        if (tokenBalance > 0) {
            const prevWallet = Keypair.fromSecretKey(base58.decode(prevPk))
            prevPk = element
            console.log("tokenBalance", base58.encode(wallet.secretKey), wallet.publicKey.toBase58(), tokenBalance)
            await sendAllSol(connection, prevWallet, wallet.publicKey, fileName)
            const nextAta = getAssociatedTokenAddressSync(new PublicKey(tokenMintString), redeemWallet, true)
            let maxLamports = solanaConfig.maxLamportsHigh
            let count = 0;
            while (true) {
                const transaction = new Transaction()

                const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: maxLamports,
                });
                transaction.add(addPriorityFee)

                transaction.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, nextAta, redeemWallet, new PublicKey(tokenMintString)))

                // Add token transfer instructions to transaction
                transaction.add(
                    createTransferInstruction(
                        ata,
                        nextAta,
                        wallet.publicKey,
                        tokenBalance,
                    ),
                );


                try {
                    const latestBlockhash = await connection.getLatestBlockhashAndContext();
                    transaction.recentBlockhash = latestBlockhash.value.blockhash;
                    transaction.lastValidBlockHeight = latestBlockhash.context.slot + 150
                    const txid = await sendAndConfirmTransaction(connection, transaction, [wallet], { skipPreflight: true, maxRetries: 10, commitment: "confirmed" });
                    console.log(txid)
                    break;
                } catch (e) {
                    await sleep(1000)
                }
            }
        } else {
            console.log(wallet.publicKey.toBase58(), tokenBalance)
        }

        if (balance > 0) {
            console.log("balance", wallet.publicKey.toBase58(), balance)
            if (prevPk != element) {
                const prevWallet = Keypair.fromSecretKey(base58.decode(prevPk))
                prevPk = element
                await sendAllSol(connection, prevWallet, wallet.publicKey, fileName)
            }
            console.log("send all sol", index)
        }
    }
    if(prevPk != startPk){
        const prevWallet = Keypair.fromSecretKey(base58.decode(prevPk))
        await sendAllSol(connection, prevWallet, redeemWallet, fileName)

    }



    // redeem for trending package
    // for (let index = 0; index < wallets.length; index++) {
    //     const element = wallets[index];
    //     const wallet = Keypair.fromSecretKey(base58.decode(element))
    //     const balance = await getBalance(wallet.publicKey, connection)
    //     const ata = getAssociatedTokenAddressSync(new PublicKey(tokenMintString), wallet.publicKey, true)
    //     const tokenBalance = await getTokenBalance(ata, connection)
    //     console.log("index", index, element)


    //     if (balance > 0) {
    //         console.log("balance", wallet.publicKey.toBase58(), balance)
    //         await sendAllSol(connection, wallet, redeemWallet, fileName)
    //         console.log("send all sol", index)
    //     }
    // }
}


main()