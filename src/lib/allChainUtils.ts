import { TronWeb } from "tronweb";
import {
  chainNames,
  tronConfig,
  web3Config,
  solanaConfig,
  suiConfig,
} from "../config";
import { getProvider } from "./evmUtils";
import { poolExistsSol } from "./solanaUtils";
import { poolExistsTron } from "./tronUtils";
import { TRON_EXAMPLE_PRIVATEKEY } from "./tronConfig";
import { getSupabase } from "./authUtil";
import { Chain, Package, TempWallets } from "../types";
import { resumeBoostBera } from "./beraMain";
//import { resumeBoostSolana } from "./solanaMain"
import { resumeBoostSolana } from "./solanaMain";
import { poolExistsSushi } from "./sushiMainUtils";
import { resumeBoostSushi } from "./sushiMain";
import { poolExistsSuiWith7K, poolExistsSuiWithFlow } from "./suiUtils";
import { resumeBoostSui } from "./suiMain";
import { poolExistsBera } from "./beraUtils";

export const poolExists = async (
  tokenMint: string,
  chainId: number,
  poolTypeId: number,
  poolAddress: string,
  quoteToken?: string
) => {
  console.log("poolExists", chainId);

  const supabase = getSupabase();
  const dex = await supabase
    .from("Dexes")
    .select("*")
    .eq("id", poolTypeId)
    .single();

  if (!dex.data?.param_text) {
    return false;
  }
  const dexParam = dex.data?.param_text as string;
  const chainName = chainNames[chainId];
  const { data: chainData }: any = await supabase
    .from("Chains")
    .select("*")
    .eq("id", chainId)
    .single();
  console.log("chainData.name.toLowerCase():", chainData.name.toLowerCase());
  console.log("chainName:", chainName);

  if (chainData.name.toLowerCase() == "solana") {
    return poolExistsSol(tokenMint, dexParam);
  }
  if (
    chainData.name.toLowerCase() == "bsc" ||
    chainData.name.toLowerCase() == "base" ||
    chainData.name.toLowerCase() == "avax"
  ) {
    console.log("poolExistsSushi", chainId);

    let preferSushi = "false";

    if (
      dexParam === "BASE_SUSHI_V2" ||
      dexParam === "traderjoe" ||
      dexParam === "pharoah"
    ) {
      preferSushi = "true";
    }
    const evmConfig = web3Config[chainName];

    //console.log("evmConfig", evmConfig.chainId);

    const provider = getProvider(evmConfig.rpc);

    console.log("dexParam", dexParam);

    return poolExistsSushi(
      tokenMint,
      chainName,
      provider,
      preferSushi
    );
  }
  if (chainData.name.toLowerCase() == "bera") {
    const evmConfig = web3Config[chainName];
   // console.log("evmConfig", evmConfig.chainId);
    const provider = getProvider(evmConfig.rpc);
    //console.log("provider", provider);

    return poolExistsBera(tokenMint, chainName, dexParam, provider);
  }
  if (chainData.name.toLowerCase() == "tron") {
    const tronWeb = new TronWeb({
      fullHost: tronConfig.rpc,
      solidityNode: tronConfig.rpc,
      eventServer: tronConfig.rpc,
      privateKey: TRON_EXAMPLE_PRIVATEKEY,
    });
    return poolExistsTron(tokenMint, tronWeb);
  }
  if (chainData.name.toLowerCase() == "sui") {
    return poolExistsSuiWith7K(tokenMint, dexParam, poolAddress, quoteToken);
  }
  return false;
};

export const resumeAllUnfinishedBoosts = async () => {
  const supabase = getSupabase();
  console.log("resuming unfinished boosts");
  const { data: boosts, error } = await supabase
    .from("Boosts")
    .select("*")
    .eq("payment_status", 1)
    .eq("boost_status", 0);
  if (boosts?.length) {
    for (let index = 0; index < boosts.length; index++) {
      const boost: any = boosts[index];
      console.log("found unfinished boost", boost);
      const packagesResult = await supabase
        .from("Packages")
        .select("*")
        .eq("id", boost.package_id)
        .single();

      if (packagesResult.data) {
        const { data: logs, error: logsError } = await supabase
          .from("Logs")
          .select("current_wallet, next_wallet, created_at")
          .eq("boost_id", boost.id);
        if (logs?.length) {
          const wallets: TempWallets[] = [];
          logs.forEach((v) => {
            wallets.push({
              currentWallet: v.current_wallet!,
              nextWallet: v.next_wallet!,
            });
          });
          const {
            product_json,
            poolType,
            chain_id,
            buy_only,
            is_trending,
            is_jito,
            is_custom,
            is_holders,
          } = packagesResult.data;
          const product_config = product_json as Package;

          const dex = await supabase
            .from("Dexes")
            .select("*")
            .eq("id", boost.poolTypeId!)
            .single();
          if (!dex.data?.param_text) {
            continue;
          }
          const dexParam = dex.data?.param_text as string;

          const { data: chainData }: any = await supabase
            .from("Chains")
            .select("*")
            .eq("id", chain_id)
            .single();

          let treasuryWallet: string = "";
          const rent = await supabase
            .from("Rents")
            .select("*")
            .eq("bot_name", boost.bot_name)
            .single();

          if (chainData.name.toLowerCase() == "solana") {
            if (rent.data) {
              treasuryWallet = rent.data.sol_treasury_wallet;
            } else {
              treasuryWallet = solanaConfig.treasuryPubkey;
            }
            resumeBoostSolana(
              boost.id,
              boost.token!,
              product_config,
              atob(boost.wallet_private_key!),
              dexParam,
              wallets,
              is_trending,
              new Date(logs[0].created_at!).getTime(),
              is_jito,
              is_holders,
              treasuryWallet
            );
          }
          if (
            chainData.name.toLowerCase() == "bsc" ||
            chainData.name.toLowerCase() == "base"
          ) {
            if (rent.data) {
              treasuryWallet = rent.data.base_treasury_wallet;
            } else {
              treasuryWallet = web3Config.base.treasuryPubkey;
            }
            const chainName: Chain = chain_id == 2 ? "base" : "bsc";
            let preferSushi = "false";

            if (dexParam === "BASE_SUSHI_V2") {
              preferSushi = "true";
            }

            const dexVersion = dex.data?.param_text;

            resumeBoostSushi(
              boost.id,
              boost.token!,
              product_config,
              atob(boost.wallet_private_key!),
              wallets,
              new Date(logs[0].created_at!).getTime(),
              chainName,
              dexVersion,
              preferSushi,
              is_jito,
              is_custom,
              buy_only,
              treasuryWallet
            );
          }
          if (chainData.name.toLowerCase() == "bera") {
            if (rent.data) {
              treasuryWallet = rent.data.base_treasury_wallet;
            } else {
              treasuryWallet = web3Config.bera.treasuryPubkey;
            }
            resumeBoostBera(
              boost.id,
              boost.token!,
              product_config,
              atob(boost.wallet_private_key!),
              wallets,
              new Date(logs[0].created_at!).getTime(),
              "bera",
              dexParam,
              is_trending,
              is_custom,
              buy_only,
              treasuryWallet
            );
          }
          if (chainData.name.toLowerCase() == "tron") {
          }
          if (chainData.name.toLowerCase() == "sui") {
            if (rent.data) {
              treasuryWallet = rent.data.sui_treasury_wallet;
            } else {
              treasuryWallet = suiConfig.treasuryPubkey;
            }
            resumeBoostSui(
              boost.id,
              boost.token!,
              product_config,
              atob(boost.wallet_private_key!),
              wallets,
              new Date(logs[0].created_at!).getTime(),
              dexParam,
              is_trending,
              is_custom,
              buy_only,
              is_holders,
              treasuryWallet
            );
          }
        }
      }
    }
  }
};
