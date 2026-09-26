import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { db, displayName, id, now, replyPrompt, userId } from "../market.js";
const composer = new Composer<Ctx>();

composer.callbackQuery(/^thread:start:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const listing = db(ctx).listings.find((l) => l.id === ctx.match[1]);
  if (!listing || listing.status !== "active") { await ctx.reply("That listing is no longer available."); return; }
  if (listing.ownerId === userId(ctx)) { await ctx.reply("You can’t contact yourself about your own listing."); return; }
  const thread = db(ctx).threads.find((t) => t.listingId === listing.id && t.buyerId === userId(ctx));
  const t = thread ?? { id: id("thread"), listingId: listing.id, buyerId: userId(ctx), sellerId: listing.ownerId, messages: [], status: "open" as const };
  if (!thread) db(ctx).threads.push(t);
  ctx.session.step = `thread:${t.id}`;
  await ctx.reply("Your private thread is open. Send a message for the seller.", { reply_markup: inlineKeyboard([[inlineButton("Close thread", `thread:close:${t.id}`), inlineButton("Report", `report:start:${listing.id}`)]]) });
  if (listing.ownerId !== userId(ctx)) { try { await ctx.api.sendMessage(listing.ownerId, `A buyer started a conversation about “${listing.title}”.`); } catch { /* seller may have blocked the bot */ } }
});
composer.callbackQuery(/^thread:close:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const t = db(ctx).threads.find((x) => x.id === ctx.match[1]); if (t) t.status = "closed"; ctx.session.step = undefined; await ctx.editMessageText("This thread is closed. You can browse other listings anytime."); });
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step; if (!step?.startsWith("thread:")) return next();
  const t = db(ctx).threads.find((x) => x.id === step.slice(7)); if (!t || t.status !== "open") { ctx.session.step = undefined; await ctx.reply("That thread is closed."); return; }
  const text = ctx.message.text.trim(); if (!text) { await ctx.reply("Send a message with a little more detail."); return; }
  t.messages.push({ senderId: userId(ctx), text, at: now() }); await ctx.reply("Your message was saved in the thread.");
});

composer.callbackQuery(/^report:start:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = `report:${ctx.match[1]}`; await replyPrompt(ctx, "What should the owner know? Type a reason or skip.", "Reason or skip"); });
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step; if (!step?.startsWith("report:")) return next();
  const listing = db(ctx).listings.find((l) => l.id === step.slice(7)); if (!listing) { ctx.session.step = undefined; await ctx.reply("That listing is no longer available."); return; }
  const reason = ctx.message.text.trim().toLowerCase() === "skip" ? "No reason provided" : ctx.message.text.trim();
  const report = { id: id("report"), listingId: listing.id, reporterId: userId(ctx), reason, at: now(), status: "open" as const }; db(ctx).reports.push(report); listing.reports += 1; ctx.session.step = undefined;
  await ctx.reply("Thanks for flagging this. Reports aren’t anonymous, and the owner will review it.");
  const admin = adminChatId(ctx as never); if (admin) { try { await ctx.api.sendMessage(admin, `🚩 Listing reported: ${listing.title}\nReason: ${reason}\nReporter: ${userId(ctx)}`, { reply_markup: inlineKeyboard([[inlineButton("Remove listing", `admin:remove:${listing.id}`), inlineButton("Mark sold", `admin:sold:${listing.id}`)]]) }); } catch { /* delivery is best effort */ } }
});

composer.callbackQuery(/^admin:(remove|sold):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx as never))) return;
  const listing = db(ctx).listings.find((l) => l.id === ctx.match[2]); if (!listing) { await ctx.reply("That listing can’t be found."); return; }
  listing.status = ctx.match[1] === "remove" ? "removed" : "sold";
  await ctx.editMessageText(ctx.match[1] === "remove" ? "Listing removed from the marketplace." : "Listing marked as sold.");
});
composer.callbackQuery("admin:desk", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx as never))) return; await ctx.reply("Owner desk is ready. Use the controls on listing and report notifications."); });
export default composer;
