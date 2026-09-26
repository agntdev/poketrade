import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, paginate, registerMainMenuItem, type InlineButton } from "../toolkit/index.js";
import { db, listingText, type Listing } from "../market.js";

registerMainMenuItem({ label: "🔎 Browse listings", data: "listing:browse", order: 20 });
const composer = new Composer<Ctx>();
function keyboard(items: Listing[], page: number, filter = "all") {
  const p = paginate(items, { page, perPage: 5, callbackPrefix: `listing:page:${filter}` });
  const rows: InlineButton[][] = p.pageItems.map((l) => [inlineButton(`${l.title.slice(0, 22)} · ${l.amount} ${l.currency}`, `listing:view:${l.id}`)]);
  rows.push([inlineButton("Any price", "listing:filter:all"), inlineButton("Mint", "listing:filter:Mint")]);
  rows.push([inlineButton("Near mint", "listing:filter:Near%20mint"), inlineButton("Played", "listing:filter:Played")]);
  if (p.controls.inline_keyboard.length) rows.push(...p.controls.inline_keyboard);
  return inlineKeyboard(rows);
}
async function show(ctx: Ctx, page = 0, filter = "all", edit = false) {
  let items = db(ctx).listings.filter((l) => l.status === "active");
  if (filter !== "all") items = items.filter((l) => l.condition.toLowerCase() === decodeURIComponent(filter).toLowerCase());
  const text = items.length ? "Here are the latest cards for sale." : "No listings yet — tap 🃏 Create listing to add one.";
  if (edit) await ctx.editMessageText(text, { reply_markup: keyboard(items, page, filter) });
  else await ctx.reply(text, { reply_markup: keyboard(items, page, filter) });
}
composer.callbackQuery("listing:browse", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
composer.callbackQuery(/^listing:filter:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx, 0, ctx.match[1], true); });
composer.callbackQuery(/^listing:page:(.+):(prev|next):(\d+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx, Number(ctx.match[3]), ctx.match[1], true); });
composer.callbackQuery(/^listing:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const l = db(ctx).listings.find((x) => x.id === ctx.match[1]);
  if (!l || l.status !== "active") { await ctx.reply("That listing is no longer available."); return; }
  await ctx.editMessageText(listingText(l), { reply_markup: inlineKeyboard([[inlineButton("Contact seller", `thread:start:${l.id}`), inlineButton("Report", `report:start:${l.id}`)], [inlineButton("Back to listings", "listing:browse")]]) });
});
export default composer;
