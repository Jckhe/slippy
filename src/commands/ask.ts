import { SlashCommandBuilder } from "discord.js";
import { openai } from "../lib/openai.js";
import { ENV } from "../lib/env.js";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask anything")
  .addStringOption(o => o.setName("question").setDescription("Question").setRequired(true));

export async function execute(i:any){
  await i.deferReply();
  const q = i.options.getString("question", true);
  const r = await openai.responses.create({
    model: ENV.OPENAI_MODEL,
    input: q
  });
  await i.editReply(r.output_text || "No response");
}
