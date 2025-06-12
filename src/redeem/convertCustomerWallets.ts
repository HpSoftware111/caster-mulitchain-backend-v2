import { getSupabase } from "../lib/authUtil"

async function main() {
    const supabase = getSupabase()
    const { data: customers, error }: any = await supabase
        .from("Customers")
        .select("*")
        .order("id")
    console.log('Customers: ', customers.length);



    for (let i = 0; i < customers.length; i++) {
        console.log('Start: ', customers[i].id);
        const { data: solanaWallet }: any = await supabase
            .from("CustomerWallets")
            .select("*")
            .eq('customer_id', customers[i].id)
            .eq('chain_id', 0)

        if (solanaWallet.length == 0 && customers[i].sol_referral_wallet != '' && customers[i].sol_referral_wallet != null) {
            const { data, error: insertError } = await supabase
                .from("CustomerWallets")
                .insert({
                    customer_id: customers[i].id,
                    chain_id: 0,
                    referral_wallet: customers[i].sol_referral_wallet,
                })
        }

        const { data: baseWallet }: any = await supabase
            .from("CustomerWallets")
            .select("*")
            .eq('customer_id', customers[i].id)
            .eq('chain_id', 2) 
            
        if (baseWallet.length == 0 && customers[i].base_referral_wallet != '' && customers[i].base_referral_wallet != null) {
            const { data, error: insertError } = await supabase
                .from("CustomerWallets")
                .insert({
                    customer_id: customers[i].id,
                    chain_id: 2,
                    referral_wallet: customers[i].base_referral_wallet,
                })
        }

        const { data: suiWallet }: any = await supabase
            .from("CustomerWallets")
            .select("*")
            .eq('customer_id', customers[i].id)
            .eq('chain_id', 4) 

        if (suiWallet.length == 0 && customers[i].sui_referral_wallet != '' && customers[i].sui_referral_wallet != null) {
            const { data, error: insertError } = await supabase
                .from("CustomerWallets")
                .insert({
                    customer_id: customers[i].id,
                    chain_id: 4,
                    referral_wallet: customers[i].sui_referral_wallet,
                })
        }
        console.log('End: ', customers[i].id);
    }
}


main()