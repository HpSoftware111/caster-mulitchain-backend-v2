import { promises } from "fs-extra";
import { getSupabase } from "./authUtil";
import { solanaConfig } from "../config"
import prependFile  from "prepend-file";
const fs = require('fs')

export function generateReferralCode(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let referralCode = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        referralCode += characters[randomIndex];
    }
    return referralCode;
}
export async function sleep(ms: number) {
    console.log(new Date().toLocaleString(), "sleepTime", ms);
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function printToFile(filePath: string, ...variables: any[]) {
    // Convert all variables to strings and join them with the specified delimiter
    let content = '';
    if(filePath.indexOf('tempwallet') == -1)
        content = variables.map(s => `${s}`).join(' ') + ' ' + (new Date().toISOString()) + '\n';
    else content = variables.map(s => `${s}`).join(' ') + '\n';
    await promises.appendFile(filePath, content)
}

export async function printPrependToFile(filePath: string, ...variables: any[]) {
    // Convert all variables to strings and join them with the specified delimiter
    const content = variables.map(s => `${s}`).join(' ') + '\n';
    await prependFile(filePath, content)
}


export async function insertOrUpdatePrivateKeys(boostId: number, threadNumber: number, currentPk: string, nextPk: string) {
    const supabase = getSupabase()
    const { data, error } = await supabase.from("Logs").select("*").eq("boost_id", boostId).eq("thread_number", threadNumber)
    if (data?.length) {
        await supabase.from("Logs").update({
            current_wallet: currentPk,
            next_wallet: nextPk
        }).eq("id", data[0].id)
    }
    else {
        await supabase.from("Logs").insert({
            boost_id: boostId,
            thread_number: threadNumber,
            current_wallet: currentPk,
            next_wallet: nextPk
        })
    }
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

export const getRandomAmountForJito = (baseAmount: number) => {
    const range = baseAmount * 0.25;

    const randomAdjustment = (Math.random() * 2 - 1) * range;

    return baseAmount + randomAdjustment;
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


export async function writeSolanaTempWallets(boostId: number) {
    const fileName = solanaConfig.logPath + `${boostId}.log`
    const fileNameTempWallet = solanaConfig.logPath + `tempwallet_${boostId}.log`

    const file = await promises.readFile(fileName);
    file.toString().split('\n').forEach((line: string) => {
        if(line.indexOf('next wallet') != -1 || line.indexOf('next wallet1') != -1 || line.indexOf('next wallet2') != -1 || line.indexOf('next wallet3') != -1) {
            const lineArray = line.split(" ");
            const pvKey = lineArray[3].substring(0, lineArray[3].length - 1);
            printToFile(fileNameTempWallet, `"${pvKey}",`)
        }
    });
}