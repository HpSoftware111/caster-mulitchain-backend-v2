function getSellPrice(amount: bigint, tokenData: any, feeBasisPoints: bigint): bigint {
    if (amount <= BigInt(0)) {
      return BigInt(0);
    }
  
    // Calculate the proportional amount of virtual sol reserves to be received
    let n = (amount * tokenData.virtualSolReserves) / (tokenData.virtualTokenReserves + amount);
   
    // Calculate the fee amount in the same 
    
    let a = (n * feeBasisPoints) / BigInt(10000);
   
    // Return the net amount after deducting the fee
    return n - a;
  }
  
  export default getSellPrice;
  