import { SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import axios from "axios";
import { solanaConfig } from "../../config";

// Jito Tip Accounts: https://jito-labs.gitbook.io/mev/searcher-resources/json-rpc-api-reference/bundles/gettipaccounts
const tipAccounts = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"
];

export async function sendBundle(transactions: Array<string>) {
    const bundleData = {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [transactions],
    };
    try {
        const response = await axios.post(
            solanaConfig.jitoLink,
            bundleData,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        )
        return response.data;
    } catch (error: any) {
        if (error?.response.data.error) {
            throw new Error(JSON.stringify(error?.response.data.error));
        }

        throw new Error("Failed to send bundle.");
    }
}

export const createTipInstruction = (wallet: PublicKey, tip: number) => {
    return SystemProgram.transfer({
        fromPubkey: wallet,
        toPubkey: new PublicKey(
            tipAccounts[Math.floor(Math.random() * tipAccounts.length)]
        ),
        lamports: Math.floor(tip * LAMPORTS_PER_SOL),
    })
}

export async function getBundleStatuses(bundleIds: string[]) {
    const bundleData = {
        jsonrpc: "2.0",
        id: 1,
        method: "getBundleStatuses",
        params: [bundleIds],
    };
    try {
        const response = await axios.post(
            `https://mainnet.block-engine.jito.wtf/api/v1/bundles`,
            bundleData,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return response.data;
    } catch (error: any) {
        if (error?.response?.data?.error) {
            throw new Error(JSON.stringify(error.response.data.error));
        }
        throw new Error("Failed to get bundle statuses.");
    }
}

export async function checkBundleStatus(
    bundleId: string,
    maxRetries: number = 10,
    commitmentLevel: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
    retryInterval: number = 5000
): Promise<'success' | 'not_included' | 'max_retries_reached' | 'error'> {
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const response = await getBundleStatuses([bundleId]);
            const bundleInfo = response.result.value.find(
                (bundle: any) => bundle.bundle_id === bundleId
            );

            if (!bundleInfo) {
                await new Promise(resolve => setTimeout(resolve, retryInterval));
            }

            const status = bundleInfo.confirmation_status;

            const isStatusSufficient =
                (commitmentLevel === 'processed' && ['processed', 'confirmed', 'finalized'].includes(status)) ||
                (commitmentLevel === 'confirmed' && ['confirmed', 'finalized'].includes(status)) ||
                (commitmentLevel === 'finalized' && status === 'finalized');

            if (isStatusSufficient) {
                if (bundleInfo.err.Ok === null) {
                    //return bundleInfo.transactions[0]
                    return 'success';
                } else {
                    return 'error';
                    //throw new Error('Jito Bundle Error:' + JSON.stringify(bundleInfo.err));
                }
            }

            await new Promise(resolve => setTimeout(resolve, retryInterval));
            retries++;
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, retryInterval));
            retries++;
        }
    }
    return 'max_retries_reached';
    //throw new Error('Max retries reached while checking bundle status.');
}


export async function getJitoTip() {
    try {
        const response = await axios.get(solanaConfig.jitoTipFloorLink)
        const jitoTip = response.data[0]?.landed_tips_75th_percentile || solanaConfig.jitoTip;
        return jitoTip;
    } catch (error: any) {
        return solanaConfig.jitoTip;
    }
}