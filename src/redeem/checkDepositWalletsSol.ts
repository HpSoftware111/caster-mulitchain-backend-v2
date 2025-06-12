import { createClient } from '@supabase/supabase-js';
import { promises } from "fs-extra";
import * as dotenv from "dotenv";
import { Database } from '../types/supabase';
import { Connection, PublicKey } from '@solana/web3.js';
import { blast } from 'viem/chains';
dotenv.config();
const fileName = `output.log`
let successcount = 0;
let failcount = 0;


const SUPABASE_URL="https://qlqawybnzaxclyqjixdr.supabase.co";
const SUPABASE_ANON_KEY="add key here";
const RPC = "https://mainnet.helius-rpc.com/?api-key=d932ad25-6e13-4c89-ad1f-0617ccdd2bca";
const connection = new Connection(RPC);

export async function getDepositWallets() {
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: boosts, error } = await supabase.from('Boosts').select().eq("chain_id", 0).gt("id", 1000);

  console.log(error);
  console.log(boosts);

  if (error && !boosts)
    return;
  else
    return boosts;
}

 async function main() {
  const startTime = new Date().getTime();
  printToFile(fileName, "monitoring started", new Date(startTime).toUTCString());
  const boosts = await getDepositWallets();
  // console.log("main customers");
  console.log("how many? " + boosts?.length);
  printToFile(fileName, "customer length : " + boosts?.length, new Date(new Date().getTime()).toUTCString());
  boosts?.forEach(async boost => {
    console.log(boost.wallet_public_key);

    const balance = await connection.getBalance(new PublicKey(boost.wallet_public_key ?? ""), "confirmed");
    if(balance > 0) {
        printToFile(fileName, `${boost.wallet_public_key} balance : ` + balance + ` with PK ${boost.wallet_private_key}`);
    }
  });

  printToFile(fileName, "successcount : " + successcount, new Date(new Date().getTime()).toUTCString());
  //printToFile(fileName, "failcount : " + failcount, new Date(new Date().getTime()).toUTCString());
}


export async function printToFile(filePath: string, ...variables: any[]) {
  // Convert all variables to strings and join them with the specified delimiter
  const content = variables.map(s => `${s}`).join(' ') + '\n';
  await promises.appendFile(filePath, content)
}


const getBalance = async (
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

        
function wait(ms:any){
  var start = new Date().getTime();
  var end = start;
  while(end < start + ms) {
    end = new Date().getTime();
 }
}

var timer;
function delay(ms:any) {
    return new Promise((x) => {
        timer = setTimeout(x, ms);
    });
}
export async function sleep(ms: number) {
  // console.log(new Date().toLocaleString(), "sleepTime", ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
main();