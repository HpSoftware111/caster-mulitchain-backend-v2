export type Package = {
    totalDay: number,
    totalFund: number,
    txCountPerMin: number,
    minSwap: number,
    maxSwap: number,
}

export type TempWallets = {
    currentWallet: string,
    nextWallet: string
}

export type Chain = 'bsc' | 'base'| 'avax' | 'bera';

export type Boost ={
    boost_status: number | null
    bot_name: string | null
    chain_id: number | null
    created_at: string
    customer_id: number
    id: number
    package_id: number
    payment_status: number | null
    poolTypeId: number | null
    token: string | null
    wallet_private_key: string | null
    wallet_public_key: string | null
    swap_amount: number | null,
    deposit_amount: number | null,
    start_time: string | null,
    finish_time: string | null,
    remaining_amount: number | null
    pause: number | null
    pool_address: string | null
    }
