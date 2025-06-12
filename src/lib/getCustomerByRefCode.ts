import { getSupabase } from "./authUtil";

export async function getCusomterByRefCode(redCode: string) {
  const supabase = getSupabase()
  try {
    const { data, error } = await supabase
      .from("Customers")
      .select("*")
      .eq("referral_code", redCode)
      .single();

    if (error) throw new Error();

    return data;
  } catch (error) {
    console.error("Error getting getCusomterByRefCode");
    return null;
  }
}
