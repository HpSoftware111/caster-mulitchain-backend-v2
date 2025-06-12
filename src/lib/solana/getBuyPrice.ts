function getBuyPrice(amount: bigint, tokenData: any): bigint {
  if (amount <= BigInt(0)) {
    return BigInt(0);
  }

  // Calculate the product of virtual reserves
  let n = tokenData.virtualSolReserves * tokenData.virtualTokenReserves;

  // Calculate the new virtual sol reserves after the purchase
  let i = tokenData.virtualSolReserves + amount;

  // Calculate the new virtual token reserves after the purchase
  let r = BigInt(n / i) + BigInt(1);

  // Calculate the amount of tokens to be purchased
  let s = tokenData.virtualTokenReserves - r;

  // Return the minimum of the calculated tokens and real token reserves
  return s < tokenData.realTokenReserves ? s : tokenData.realTokenReserves;
}

export default getBuyPrice;
