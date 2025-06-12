import * as express from "express";
import { getSupabase } from "../lib/authUtil";
import { generateReferralCode } from "../lib/utils";
import base58 from "bs58";
import { Package } from "../types";
import {
  chainNames,
  config,
  tronConfig,
  web3Config,
  solanaConfig,
  suiConfig,
} from "../config";
import { getCusomterByRefCode } from "../lib/getCustomerByRefCode";
import { formatEther, Wallet } from "ethers";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { startMonitorAndBotSol } from "../lib/solanaMain";
import { poolExists } from "../lib/allChainUtils";
import { TronWeb } from "tronweb";
import { startMonitorAndBotTron } from "../lib/tronMain";
import { TRON_EXAMPLE_PRIVATEKEY } from "../lib/tronConfig";
import { startMonitorAndBotSushi } from "../lib/sushiMain";
import { startMonitorAndBotSui } from "../lib/suiMain";
import { validateToken2022 } from "../lib/solanaUtils";
import { MIST_PER_SUI } from "@mysten/sui/utils";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { startMonitorAndBotBera } from "../lib/beraMain";
export const mainRouter = express.Router();
mainRouter.use(express.json());
const supabase = getSupabase();

mainRouter.post("/createCustomer", async (req, res) => {
  console.log("/createCustomer");
  const { telegramId, referrer_code, ad_code } = req.body;
  try {
    let referrerCustomer;

    if (referrer_code != "") {
      //Look up to see if this referrer code is affiiate
      referrerCustomer = await getCusomterByRefCode(referrer_code);
    }
    const refCode = generateReferralCode(6);
    const { data: oldData } = await supabase
      .from("Customers")
      .select("*")
      .eq("telegram_id", telegramId);

    // Check if customer already exists
    if (oldData?.length) {
      if (referrer_code != "") {
        const { data, error } = await supabase
          .from("Customers")
          .update({
            has_affiliate:
              referrerCustomer && referrerCustomer.is_affiliate == true
                ? true
                : false,
            referrer_customer_id: referrerCustomer?.id,
          })
          .eq("telegram_id", telegramId)
          .select("*")
          .single();

        if (error) throw new Error();

        // send the updated record
        res.status(200).send({
          id: data.id,
          telegram_id: data.telegram_id,
          referral_code: data.referral_code,
          has_affiliate: data.has_affiliate,
          referrer_customer_id: data.referrer_customer_id,
        });
      } else {
        res.status(200).send({
          id: oldData[0].id,
          telegram_id: oldData[0].telegram_id,
          referral_code: oldData[0].referral_code,
          has_affiliate: oldData[0].has_affiliate,
          referrer_customer_id: oldData[0].referrer_customer_id,
        });
      }
    } else {
      // Customer does not exist so insert new
      const { data, error } = await supabase
        .from("Customers")
        .insert({
          telegram_id: telegramId,
          referral_code: refCode,
          ad_code: ad_code,
          has_affiliate:
            referrerCustomer && referrerCustomer.is_affiliate == true
              ? true
              : false,
          referrer_customer_id: referrerCustomer?.id,
        })
        .select()
        .single();
      if (error) {
        res.status(400).send({ ...error });
      } else {
        res.status(200).send({
          ...data,
        });
      }
    }
  } catch (error) {
    res.status(500).send({ message: error });
  }
});

mainRouter.get("/poolExists", async (req, res) => {
  console.log("/poolExists", new Date().toUTCString(), req.body);

  const { tokenAddress, chainId, poolTypeId, poolAddress, quoteToken } =
    req.body;
  try {
    const poolExist = await poolExists(
      tokenAddress,
      chainId,
      poolTypeId,
      poolAddress,
      quoteToken
    );
    res.status(200).send({ poolExists: poolExist });
  } catch (error) {
    res.status(400).send({ message: "Error!" });
  }
});

mainRouter.get("/packages", async (req, res) => {
  console.log("/packages", new Date().toUTCString(), req.body);
  const { chainId, poolTypeId, volumeMode } = req.body;
  const dex = await supabase
    .from("Dexes")
    .select("*")
    .eq("id", poolTypeId)
    .single();
  if (!dex.data?.param_text) {
    return false;
  }
  const dexParam = dex.data?.param_text as string;
  console.log("chainId", chainId, "poolTypeId", poolTypeId);
  const { data: chainData }: any = await supabase
    .from("Chains")
    .select("*")
    .eq("id", chainId)
    .single();
  try {
    let data: any, error: any;
    let result;
    let query = supabase.from("Packages").select("*").eq("chain_id", chainId);
    if (dexParam == "pump") {
      query.eq("is_trending", false).eq("is_custom", false);
    } else {
      switch (volumeMode) {
        case 0:
          query
            .eq("is_jito", false)
            .eq("is_trending", false)
            .eq("is_custom", false)
            .eq("is_holders", false);
          break;
        case 1:
          query
            .eq("is_jito", true)
            .eq("is_trending", false)
            .eq("is_custom", false)
            .eq("is_holders", false);
          break;
        case 2:
          query
            .eq("is_jito", true)
            .eq("is_trending", true)
            .eq("is_custom", false)
            .eq("is_holders", false);
          break;
        case 3:
          query
            .eq("is_jito", false)
            .eq("is_trending", false)
            .eq("is_custom", true)
            .eq("is_holders", false);
          break;
        case 4:
          query
            .eq("is_jito", false)
            .eq("is_trending", true)
            .eq("is_custom", false)
            .eq("is_holders", false);
          break;
        case 5: //Temporary Holder boost hack, should add database columns
          query.eq("is_holders", true);
          break;
        default:
          query
            .eq("chain_id", chainId)
            .eq("is_jito", false)
            .eq("is_trending", false)
            .eq("is_custom", false)
            .eq("is_holders", false);
          break;
      }
    }

    if (config.IS_PUBLIC) {
      query = query.eq("is_pubic", true);
    }

    if (dexParam == "pump" && chainData.name.toLowerCase() == "solana") {
      query = query.eq("poolType", 1);
    } else {
      query = query.neq("poolType", 1);
    }

    result = await query.order("order", { ascending: true });
    data = result.data;
    error = result.error;
    if (error) {
      res.status(400).send({ ...error });
    } else {
      res.status(200).send({
        packages: data,
      });
    }
  } catch (error) {
    res.status(400).send({ message: "Error!" });
  }
});

mainRouter.post("/createBoost", async (req, res) => {
  console.log("/createBoost", new Date().toUTCString(), req.body);
  const {
    customerId,
    packageId,
    token,
    chainId,
    botName,
    poolTypeId,
    swapAmount,
    poolAddress,
  } = req.body;
  let { refCode } = req.body;

  if (!refCode || refCode === undefined || refCode === "") {
    refCode = "titanbotteam";
  }

  console.log(`Creating boost with refcode ${refCode} for token ${token}`);
  console.log(`customer id ${customerId}, bot name ${botName}`);
  const chainName = chainNames[chainId];
  const tronWeb = new TronWeb({
    fullHost: tronConfig.rpc,
    solidityNode: tronConfig.rpc,
    eventServer: tronConfig.rpc,
    privateKey: TRON_EXAMPLE_PRIVATEKEY,
  });
  const { data: chainData }: any = await supabase
    .from("Chains")
    .select("*")
    .eq("id", chainId)
    .single();
  try {
    let privateKey: string = "";
    let publicKey: string = "";
    let treasuryWallet: string = "";
    let isRent = false;

    const rent = await supabase
      .from("Rents")
      .select("*")
      .eq("bot_name", botName)
      .eq("is_active", true)
      .single();

    if (rent.data) isRent = true;

    console.log(`isRent ${isRent}`);

    switch (chainData.name.toLowerCase()) {
      case "solana":
        const newSolKeypair = Keypair.generate();
        privateKey = base58.encode(newSolKeypair.secretKey);
        publicKey = newSolKeypair.publicKey.toBase58();
        if (rent.data) {
          treasuryWallet = rent.data.sol_treasury_wallet;
        } else {
          treasuryWallet = solanaConfig.treasuryPubkey;
        }
        break;
      case 'bsc':
        const bscKeyPair = Wallet.createRandom();
        privateKey = bscKeyPair.privateKey;
        publicKey = bscKeyPair.address;
        if (rent.data) {
          treasuryWallet = rent.data.base_treasury_wallet;
        } else {
          treasuryWallet = web3Config.bsc.treasuryPubkey;
        }
        break;
      case "base":
        const newEvmKeypair = Wallet.createRandom();
        privateKey = newEvmKeypair.privateKey;
        publicKey = newEvmKeypair.address;
        if (rent.data) {
          treasuryWallet = rent.data.base_treasury_wallet;
        } else {
          treasuryWallet = web3Config.base.treasuryPubkey;
        }
        break;
      case "avax":
        const newAvaxKeypair = Wallet.createRandom();
        privateKey = newAvaxKeypair.privateKey;
        publicKey = newAvaxKeypair.address;
        treasuryWallet = web3Config.avax.treasuryPubkey;
        // if (rent.data) {
        //   treasuryWallet = rent.data.;
        // } else {
        //   treasuryWallet = web3Config.avax.treasuryPubkey;
        // }
        break;
      case "bera":
        const newBeraKeypair = Wallet.createRandom();
        privateKey = newBeraKeypair.privateKey;
        publicKey = newBeraKeypair.address;
        if (rent.data) {
          treasuryWallet = rent.data.base_treasury_wallet;
        } else {
          treasuryWallet = web3Config.bera.treasuryPubkey;
        }
        break;
      case "tron":
        privateKey = (await tronWeb.createAccount()).privateKey;
        publicKey = tronWeb.address.fromPrivateKey(privateKey) as string;
        break;
      case "sui":
        const keypair = new Ed25519Keypair();
        privateKey = keypair.getSecretKey();
        publicKey = keypair.toSuiAddress();
        if (rent.data) {
          treasuryWallet = rent.data.sui_treasury_wallet;
        } else {
          treasuryWallet = suiConfig.treasuryPubkey;
        }
        break;
      default:
        break;
    }

    const { data, error } = await supabase
      .from("Boosts")
      .insert({
        customer_id: customerId,
        package_id: packageId,
        wallet_public_key: publicKey,
        wallet_private_key: btoa(privateKey),
        token: token,
        bot_name: botName,
        chain_id: chainId,
        poolTypeId: poolTypeId,
        swap_amount: swapAmount,
        pool_address: poolAddress,
      })
      .select()
      .single();
    if (error) {
      res.status(400).send({ ...error });
    } else {
      let referralWallet = "";
      let referralId = 0;
      const { data: referrerData, error } = await supabase
        .from("Customers")
        .select("*")
        .eq("referral_code", refCode);

      console.log(`Creating boost with refcode ${refCode} for token ${token} for boost id ${data.id} and  referrerData ${referrerData?.length}`);
      
      const { data: chainData } : any = await supabase.from("Chains").select("*").eq("id", chainId).single()
      if (refCode != "" && referrerData?.length) {
        const result = await supabase
          .from("Referrals")
          .insert({
            referree_id: customerId,
            referrer_id: referrerData[0].id,
            fund_earned: "0",
            boost_id: data.id,
            chain_id: chainId,
          })
          .select("*")
          .single();

        const resultOutput = JSON.stringify(result);
        console.log(`Result from creating referral ${resultOutput}`);

        const { data: customerWallet, error } = await supabase
          .from("CustomerWallets")
          .select("*")
          .eq("customer_id", referrerData[0].id)
          .eq("chain_id", chainId)
          .single();
        switch (chainData.name.toLowerCase()) {
          case "solana":
            referralWallet = customerWallet
              ? customerWallet.referral_wallet!
              : solanaConfig.treasuryPubkey;
            break;
          case "bsc":
            referralWallet = customerWallet
              ? customerWallet.referral_wallet!
              : web3Config.bsc.treasuryPubkey;
            break;
          case "base":
            referralWallet = customerWallet
              ? customerWallet.referral_wallet!
              : web3Config.base.treasuryPubkey;
            break;
          case "tron":
            referralWallet = customerWallet
              ? customerWallet.referral_wallet!
              : tronConfig.treasuryPubkey;
            break;
          case "sui":
            referralWallet = customerWallet
              ? customerWallet.referral_wallet!
              : suiConfig.treasuryPubkey;
            break;
          case "avax":
            referralWallet = customerWallet
              ? customerWallet.referral_wallet!
              : web3Config.avax.treasuryPubkey;
            break;
          case "bera":
            referralWallet = customerWallet
              ? customerWallet.referral_wallet!
              : web3Config.bera.treasuryPubkey;
            break;
          default:
            break;
        }

        referralId = result.data?.id || 0;
      } else {
        const result = await supabase
          .from("Referrals")
          .insert({
            referree_id: customerId,
            referrer_id: 0,
            fund_earned: "0",
            boost_id: data.id,
            chain_id: chainId,
          })
          .select("*")
          .single();

        switch (chainData.name.toLowerCase()) {
          case "solana":
            referralWallet = solanaConfig.treasuryPubkey;
            break;
          case "bsc":
            referralWallet = web3Config.bsc.treasuryPubkey;
            break;
          case "base":
            referralWallet = web3Config.base.treasuryPubkey;
            break;
          case "tron":
            referralWallet = tronConfig.treasuryPubkey;
            break;
          case "sui":
            referralWallet = suiConfig.treasuryPubkey;
          case "avax":
            referralWallet = web3Config.avax.treasuryPubkey;
            break;
          case "bera":
            referralWallet = web3Config.bera.treasuryPubkey;
            break;
          default:
            break;
        }
        referralId = result.data?.id || 0;
      }

      const packagesResult = await supabase
        .from("Packages")
        .select("*")
        .eq("id", packageId)
        .single();
      if (packagesResult.error) {
        return res.status(400).send({ ...packagesResult.error });
      } else {
        const {
          product_json,
          buy_only,
          is_trending,
          poolType,
          is_jito,
          is_custom,
          is_holders,
        } = packagesResult.data;
        const product_config = product_json as Package;
        const dex = await supabase
          .from("Dexes")
          .select("*")
          .eq("id", poolTypeId)
          .single();
        if (!dex.data?.param_text) {
          return false;
        }
        const dexParam = dex.data?.param_text as string;
        const { data: chainData }: any = await supabase
          .from("Chains")
          .select("*")
          .eq("id", chainId)
          .single();
        if (chainData.name.toLowerCase() == "solana") {
          startMonitorAndBotSol(
            botName,
            data.id,
            token!,
            product_config,
            atob(data.wallet_private_key!),
            referralWallet,
            referralId,
            dexParam,
            is_trending,
            false,
            is_jito,
            is_holders,
            isRent,
            treasuryWallet
          );
        }
        if (
          chainData.name.toLowerCase() == "bsc" ||
          chainData.name.toLowerCase() == "base" ||
          chainData.name.toLowerCase() == "avax"
        ) {
          let preferSushi = "false";

          if (chainData.name.toLowerCase() == 'bsc' || dexParam === "BASE_SUSHI_V2") {
            preferSushi = "true";
          }

          startMonitorAndBotSushi(
            botName,
            data.id,
            token!,
            product_config,
            atob(data.wallet_private_key!),
            referralWallet,
            referralId,
            chainName,
            dexParam,
            preferSushi,
            is_trending,
            is_custom,
            buy_only,
            isRent,
            treasuryWallet
          );
        }
        if (chainData.name.toLowerCase() == "bera") {
          startMonitorAndBotBera(
            botName,
            data.id,
            token!,
            product_config,
            atob(data.wallet_private_key!),
            referralWallet,
            referralId,
            chainName,
            dexParam,
            is_trending,
            is_custom,
            buy_only,
            isRent,
            treasuryWallet
          );
        }
        if (chainData.name.toLowerCase() == "tron") {
          startMonitorAndBotTron(
            data.id,
            token!,
            product_config,
            atob(data.wallet_private_key!),
            referralWallet,
            referralId,
            isRent,
            treasuryWallet
          );
        }
        if (chainData.name.toLowerCase() == "sui") {
          startMonitorAndBotSui(
            botName,
            data.id,
            token!,
            product_config,
            atob(data.wallet_private_key!),
            referralWallet,
            referralId,
            dexParam,
            is_trending,
            is_custom,
            buy_only,
            is_holders,
            isRent,
            treasuryWallet
          );
        }
        res.status(200).send({
          ...data,
          wallet_private_key: undefined,
        });
      }
    }
  } catch (error) {
    res.status(400).send({ message: "Error!" });
  }
});

mainRouter.get("/boost", async (req, res) => {
  console.log("/boost", new Date().toUTCString(), req.body);
  const { boostId } = req.body;

  try {
    const boost = await supabase
      .from("Boosts")
      .select("*")
      .eq("id", boostId)
      .single();
    if (boost.error) {
      return res.status(400).send({ ...boost.error });
    } else {
      return res.status(200).send({
        boost: {
          ...boost.data,
          wallet_private_key: undefined,
        },
      });
    }
  } catch (error) {
    res.status(400).send({ message: "Error!" });
  }
});

mainRouter.post("/createReferral", async (req, res) => {
  console.log("/createReferral", new Date().toUTCString(), req.body);
  const { customerId, refCode } = req.body;
  try {
    const { data: referrerData, error } = await supabase
      .from("Customers")
      .select("*")
      .eq("referral_code", refCode);
    // console.log(oldData)

    const { data: oldReferralData } = await supabase
      .from("Referrals")
      .select("*")
      .eq("referree_id", customerId);
    // console.log(oldData)
    if (oldReferralData?.length) {
      res.status(200).send({
        referral: oldReferralData[0],
      });
    } else {
      if (referrerData?.length) {
        const { data, error: insertError } = await supabase
          .from("Referrals")
          .insert({
            referree_id: customerId,
            referrer_id: referrerData[0].id,
            solana_earned: 0,
          })
          .select()
          .single();
        if (insertError) {
          res.status(400).send({ ...insertError });
        } else {
          res.status(200).send({
            referral: data,
          });
        }
      } else {
        res.status(400).send({ ...error });
      }
    }
  } catch (error) {
    res.status(400).send({ message: "Error!" });
  }
});

mainRouter.post("/updateReferralWallet", async (req, res) => {
  console.log("/updateReferralWallet", new Date().toUTCString(), req.body);
  const { customerId, wallet, chainId } = req.body;
  let walletObj = {
    referral_wallet: wallet,
    customer_id: customerId,
    chain_id: chainId,
  };

  try {
    const { data: referralWallets } = await supabase
      .from("CustomerWallets")
      .select()
      .eq("customer_id", customerId)
      .eq("chain_id", chainId)
      .single();

    if (referralWallets) {
      const { data: referrerData, error } = await supabase
        .from("CustomerWallets")
        .update(walletObj!)
        .eq("customer_id", customerId)
        .eq("chain_id", chainId)
        .select()
        .single();

      if (referrerData) {
        res.status(200).send({
          ...referrerData,
        });
      } else {
        res.status(400).send({ error });
      }
    } else {
      const { data: referrerData, error } = await supabase
        .from("CustomerWallets")
        .insert(walletObj!)
        .select()
        .single();

      if (referrerData) {
        res.status(200).send({
          ...referrerData,
        });
      } else {
        res.status(400).send({ error });
      }
    }
  } catch (error) {
    res.status(400).send({ message: "Error!" });
  }
});

mainRouter.get("/referralInfo", async (req, res) => {
  console.log("/referralInfo", new Date().toUTCString(), req.body);
  const { customerId } = req.body;

  try {
    const customer = await supabase
      .from("Customers")
      .select("*")
      .eq("id", customerId)
      .single();
    if (customer.error) {
      return res.status(400).send({ ...customer.error });
    } else {
      const referrals = await supabase
        .from("Referrals")
        .select("*")
        .eq("referrer_id", customerId);

      if (!referrals.data?.length) {
        let baseWallet = "",
          solanaWallet = "",
          suiWallet = "";
        const { data: chains, error: chainsError }: any = await supabase
          .from("Chains")
          .select("*")
          .eq("is_active", 1);

        for (let i = 0; i < chains?.length; i++) {
          const { data: customerWallet, error } = await supabase
            .from("CustomerWallets")
            .select("*")
            .eq("customer_id", customerId)
            .eq("chain_id", chains[i].id)
            .single();

          switch (chains[i].id) {
            case 0:
              solanaWallet = customerWallet
                ? customerWallet.referral_wallet!
                : "";
              break;
            case 2:
              baseWallet = customerWallet
                ? customerWallet.referral_wallet!
                : "";
              break;
            case 4:
              suiWallet = customerWallet ? customerWallet.referral_wallet! : "";
              break;
          }
        }

        res.status(200).send({
          referralInfo: {
            fundEarnedBase: "0",
            fundEarnedSolana: "0",
            fundEarnedSui: "0",
            count: 0,
            baseWallet,
            solanaWallet,
            suiWallet,
            refCode: customer.data.referral_code,
          },
        });
      } else {
        let fund_earned_base_eth = BigInt(0);
        let fund_earned_solana = 0;
        let fund_earned_sui = 0;
        let referralCount = 0;
        for (let index = 0; index < referrals.data.length; index++) {
          const element = referrals.data[index];
          if (element.fund_earned != "0") {
            referralCount++;
          }
          if (element.chain_id == 0) {
            fund_earned_solana +=
              parseInt(element.fund_earned || "0") / LAMPORTS_PER_SOL;
          }
          if (element.chain_id == 2) {
            fund_earned_base_eth +=
              BigInt(element.fund_earned || "0") || BigInt(0);
          }
          if (element.chain_id == 4) {
            fund_earned_sui +=
              parseInt(element.fund_earned || "0") / Number(MIST_PER_SUI);
          }
        }
        res.status(200).send({
          referralInfo: {
            fundEarnedBase: formatEther(fund_earned_base_eth),
            fundEarnedSolana: fund_earned_solana.toFixed(3),
            fundEarnedSui: fund_earned_sui.toFixed(3),
            count: referralCount,
            baseWallet: customer.data.base_referral_wallet || "Not initialized",
            solanaWallet:
              customer.data.sol_referral_wallet || "Not initialized",
            suiWallet: customer.data.sui_referral_wallet || "Not initialized",
            refCode: customer.data.referral_code,
          },
        });
      }
    }
  } catch (error) {
    res.status(400).send({ message: "Error!" });
  }
});

mainRouter.get("/getCustomerById", async (req, res) => {
  console.log("/getCustomerById", new Date().toUTCString(), req.body);
  const { customerId } = req.body;

  try {
    const customer = await supabase
      .from("Customers")
      .select("*")
      .eq("id", customerId)
      .single();
    if (customer.error) {
      return res.status(400).send({ ...customer.error });
    } else {
      return res.status(200).send({
        customer: {
          ...customer.data,
        },
      });
    }
  } catch (error) {
    res.status(500).send({ message: error });
  }
});

mainRouter.get("/getChains", async (req, res) => {
  console.log("/getChains", new Date().toUTCString(), req.body);

  try {
    const chains = await supabase.from("Chains").select("*").eq("is_active", 1);
    console.log(chains.data);
    if (chains.error) {
      return res.status(400).send({ ...chains.error });
    } else {
      return res.status(200).send({
        chains: chains.data,
      });
    }
  } catch (error) {
    res.status(500).send({ message: error });
  }
});
mainRouter.get("/getPoolTypes", async (req, res) => {
  console.log("/getPoolTypes", new Date().toUTCString(), req.body);
  const { chainId } = req.body;

  try {
    const dexes = await supabase
      .from("Dexes")
      .select("*")
      .eq("chain_id", chainId)
      .eq("is_active", 1)
      .order("order", { ascending: true });
    if (dexes.error) {
      return res.status(400).send({ ...dexes.error });
    } else {
      console.log(dexes.data);
      return res.status(200).send({
        dexes: dexes.data,
      });
    }
  } catch (error) {
    res.status(500).send({ message: error });
  }
});

mainRouter.get("/getSwapAmounts", async (req, res) => {
  console.log("/getSwapAmounts", new Date().toUTCString(), req.body);
  const { chainId } = req.body;
  const { data: chainData }: any = await supabase
    .from("Chains")
    .select("*")
    .eq("id", chainId)
    .single();
  let swapAmounts = [];
  switch (chainData.name.toLowerCase()) {
    case "solana":
      swapAmounts = solanaConfig.swapSolAmounts;
      break;
    case "base":
      swapAmounts = web3Config.base.swapAmounts;
      break;
    case "sui":
      swapAmounts = suiConfig.swapSuiAmounts;
      break;
    case "bera":
      swapAmounts = web3Config.bera.swapAmounts;
      break;
    case 'bsc':
      swapAmounts = web3Config.bsc.swapAmounts
      break;
    default:
      swapAmounts = solanaConfig.swapSolAmounts;
      break;
  }

  return res.status(200).send({
    swapAmounts,
  });
});

mainRouter.get("/validateToken", async (req, res) => {
  console.log("/validateToken", new Date().toUTCString(), req.body);

  const { tokenAddress, chainId, poolTypeId } = req.body;
  try {
    const isToken2022 = await validateToken2022(tokenAddress);
    res.status(200).send({ isValidateToken: !isToken2022 });
  } catch (error) {
    res.status(400).send({ message: "Error!" });
  }
});

mainRouter.get("/checkRent", async (req, res) => {
  console.log("/checkRent", new Date().toUTCString(), req.body);
  const { botName } = req.body;

  try {
    const { data, error } = await supabase
      .from("Rents")
      .select("*")
      .eq("bot_name", botName)
      .single();

    if (data) {
      if (!data.is_active) res.status(200).send({ status: 1 });
      else res.status(200).send({ status: 0 });
    } else {
      res.status(200).send({ status: 1 });
    }
  } catch (error) {
    res.status(500).send({ message: error });
  }
});

mainRouter.get("/getBoostsByBot", async (req, res) => {
  console.log("/getBoostsByBot", new Date().toUTCString(), req.body);
  const { botName, customer_id } = req.body;
  try {
    const boosts = await supabase
      .from("Boosts")
      .select(
        `
        id,
        pause,
        deposit_amount,
        Packages (
          id,
          name
        )
      `
      )
      .eq("bot_name", botName)
      .eq("customer_id", customer_id)
      .eq("payment_status", 1)
      .eq("boost_status", 0);
    if (boosts.error) {
      return res.status(400).send({ ...boosts.error });
    } else {
      return res.status(200).send({
        boosts: boosts.data,
      });
    }
  } catch (error) {
    res.status(500).send({ message: error });
  }
});

mainRouter.get("/setPauseBoost", async (req, res) => {
  console.log("/setPauseBoost", new Date().toUTCString(), req.body);
  const { boostId, customer_id } = req.body;
  try {
    const { data: boost, error: boostError } = await supabase
      .from("Boosts")
      .select("*")
      .eq("id", boostId)
      .eq("customer_id", customer_id)
      .single();

    if (boost) {
      const pause = boost.pause == 1 ? 0 : 1;
      const { data: updatedBoost, error: updatedBoostError } = await supabase
        .from("Boosts")
        .update({ pause })
        .eq("id", boostId)
        .eq("customer_id", customer_id)
        .select()
        .single();

      if (updatedBoost) {
        res.status(200).send({ updateStatus: 1 });
      } else {
        res.status(200).send({ updateStatus: 0 });
      }
    } else {
      res.status(200).send({ updateStatus: 0 });
    }
  } catch (error) {
    res.status(200).send({ updateStatus: 0 });
  }
});
