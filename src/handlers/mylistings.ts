import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { db, listingText, userId } from "../market.js";
const composer = new Composer<Ctx>();
async function show(ctx: Ctx) {
  const mine = db(ctx).listings.filter((l) => l.ownerId === userId(ctx));
  if (!mine.length) { await ctx.reply("You haven’t listed anything yet — tap 🃏 Create listing to get started.", { reply_markup: inlineKeyboard([[inlineButton("Create listing", "listing:create:start")]]) }); return; }
  for (const l of mine) await ctx.reply(`${listingText(l)}\n\nStatus: ${l.status}`, { reply_markup: inlineKeyboard([[inlineButton("Edit", `listing:edit:${l.id}`), inlineButton("Mark sold", `listing:sold:${l.id}`), inlineButton("Remove", `listing:remove:${l.id}`)]]) });
}
composer.command("mylistings", show);
composer.callbackQuery("listing:mine", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^listing:(sold|remove):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const l = db(ctx).listings.find((x) => x.id === ctx.match[2]);
  if (!l || l.ownerId !== userId(ctx)) { await ctx.reply("That listing isn’t yours."); return; }
  l.status = ctx.match[1] === "sold" ? "sold" : "removed";
  await ctx.editMessageText(ctx.match[1] === "sold" ? "Marked as sold. Nice work!" : "Your listing was removed.");
});
composer.callbackQuery(/^listing:edit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const l = db(ctx).listings.find((x) => x.id === ctx.match[1]);
  if (!l || l.ownerId !== userId(ctx)) { await ctx.reply("That listing isn’t yours."); return; }
  ctx.session.step = `edit-title:${l.id}`; await ctx.reply("What title should the listing use now?", { reply_markup: { force_reply: true, input_field_placeholder: "New title" } });
});
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step; if (!step?.startsWith("edit-title:")) return next();
  const l = db(ctx).listings.find((x) => x.id === step.slice(11)); if (!l) { ctx.session.step = undefined; await ctx.reply("That listing can’t be found."); return; }
  const title = ctx.message.text.trim(); if (title.length < 2 || title.length > 80) { await ctx.reply("Keep the title between 2 and 80 characters."); return; }
  l.title = title; ctx.session.step = undefined; await ctx.reply("Your listing was updated.");
});
export default composer;
