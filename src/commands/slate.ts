import { SlashCommandBuilder } from "discord.js";
import { fetchOdds } from "../lib/odds.js";
import { openai } from "../lib/openai.js";
import { ENV } from "../lib/env.js";

export const data = new SlashCommandBuilder()
  .setName("slate")
  .setDescription("Today's NBA bets");

export async function execute(i:any){
  await i.deferReply();
  const odds = await fetchOdds();
  const r = await openai.responses.create({
    model: ENV.OPENAI_MODEL,
    input: `Rank best NBA bets + props using this data:\n${JSON.stringify(odds)}`
  });
  await i.editReply(r.output_text || "No slate");
}
