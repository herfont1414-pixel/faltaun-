import { supabase } from "@/lib/supabase/client";
import { sampleMenu } from "@/lib/data/sample-menu";
import type { MenuItem } from "@/lib/types";

export async function getMenuItems(): Promise<MenuItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return sampleMenu;
  }

  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .order("category", { ascending: true });

  if (error || !data) {
    return sampleMenu;
  }

  return data as MenuItem[];
}
