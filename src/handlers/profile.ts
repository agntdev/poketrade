import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { db, displayName, userId } from "../market.js";
const composer = new Composer<Ctx>();
composer.command("start", async (ctx, next) => {
  const users = db(ctx).users; if (!users.some((u) => u.id === userId(ctx))) users.push({ id: userId(ctx), displayName: ctx.from?.first_name ?? "Collector" });
  if (!ctx.session.profile) ctx.session.profile = { displayName: ctx.from?.first_name ?? "Collector" };
  return next();
});
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "profile-name") return next();
  const name = ctx.message.text.trim().toLowerCase() === "skip" ? (ctx.from?.first_name ?? "Collector") : ctx.message.text.trim();
  ctx.session.profile = { displayName: name }; ctx.session.step = undefined;
  await ctx.reply(`Nice to meet you, ${displayName(ctx)}. Your profile is ready.`, { reply_markup: inlineKeyboard([[inlineButton("Open menu", "menu:main")]]) });
});
export default composer;
