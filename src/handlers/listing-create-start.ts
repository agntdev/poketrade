import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { db, displayName, id, listingText, now, replyPrompt, userId, type Listing } from "../market.js";

registerMainMenuItem({ label: "🃏 Create listing", data: "listing:create:start", order: 10 });
const composer = new Composer<Ctx>();

composer.callbackQuery("listing:create:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "photos";
  ctx.session.draft = { photoIds: [], createdAt: now() };
  await ctx.reply("Send 1–6 card photos, one at a time. When you’re done, tap Finish photos.", {
    reply_markup: inlineKeyboard([[inlineButton("Finish photos", "listing:create:photos-done"), inlineButton("Cancel", "listing:create:cancel")]]),
  });
});

composer.callbackQuery("listing:create:photos-done", async (ctx) => {
  await ctx.answerCallbackQuery();
  const photos = (ctx.session.draft?.photoIds as string[] | undefined) ?? [];
  const createdAt = Number(ctx.session.draft?.createdAt ?? now());
  if (now() - createdAt > 30 * 60 * 1000) { ctx.session.step = undefined; ctx.session.draft = undefined; await ctx.reply("That draft expired, so I cleared it. You can start a fresh listing anytime."); return; }
  if (photos.length === 0) { await ctx.reply("Add at least one photo so buyers can see the card."); return; }
  ctx.session.step = "title";
  await replyPrompt(ctx, "What’s the card title?", "Card title");
});

composer.on("message:photo", async (ctx) => {
  if (ctx.session.step !== "photos") return;
  const photos = (ctx.session.draft?.photoIds as string[] | undefined) ?? [];
  if (photos.length >= 6) { await ctx.reply("You can add up to 6 photos. Tap Finish photos when you’re ready."); return; }
  const photo = ctx.message.photo.at(-1);
  if (!photo) { await ctx.reply("I couldn’t read that photo. Try sending it again."); return; }
  photos.push(photo.file_id);
  ctx.session.draft = { ...(ctx.session.draft ?? {}), photoIds: photos };
  await ctx.reply(`${photos.length} photo${photos.length === 1 ? "" : "s"} added. Send another or tap Finish photos.`);
});

composer.callbackQuery("listing:create:cancel", async (ctx) => {
  await ctx.answerCallbackQuery(); ctx.session.step = undefined; ctx.session.draft = undefined;
  await ctx.editMessageText("No worries — your draft was discarded.");
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  const text = ctx.message.text.trim();
  if (!step || text.startsWith("/")) return next();
  if (step === "title") {
    if (text.length < 2 || text.length > 80) { await ctx.reply("Keep the title between 2 and 80 characters."); return; }
    ctx.session.draft = { ...(ctx.session.draft ?? {}), title: text }; ctx.session.step = "description";
    await replyPrompt(ctx, "Add a short description, or type skip.", "Description or skip"); return;
  }
  if (step === "description") {
    ctx.session.draft = { ...(ctx.session.draft ?? {}), description: text.toLowerCase() === "skip" ? "" : text }; ctx.session.step = "set";
    await replyPrompt(ctx, "Which set is it from?", "Set name"); return;
  }
  if (step === "set") {
    ctx.session.draft = { ...(ctx.session.draft ?? {}), set: text }; ctx.session.step = "grade";
    await replyPrompt(ctx, "Add the grade, or type skip.", "Grade or skip"); return;
  }
  if (step === "grade") {
    ctx.session.draft = { ...(ctx.session.draft ?? {}), grade: text.toLowerCase() === "skip" ? undefined : text }; ctx.session.step = "condition";
    await ctx.reply("Choose the condition.", { reply_markup: inlineKeyboard([[inlineButton("Mint", "listing:condition:Mint"), inlineButton("Near mint", "listing:condition:Near mint")], [inlineButton("Played", "listing:condition:Played")]]) }); return;
  }
  if (step === "price") {
    const m = /^(\d+(?:\.\d{1,2})?)\s*([A-Za-z]{3})?$/.exec(text);
    if (!m || Number(m[1]) <= 0) { await ctx.reply("Enter a positive price, like 25 USD."); return; }
    ctx.session.draft = { ...(ctx.session.draft ?? {}), amount: Number(m[1]), currency: (m[2] ?? "USD").toUpperCase() }; ctx.session.step = "location";
    await replyPrompt(ctx, "Where are you located? Type skip if you’d rather not say.", "Location or skip"); return;
  }
  if (step === "location") {
    ctx.session.draft = { ...(ctx.session.draft ?? {}), location: text.toLowerCase() === "skip" ? undefined : text }; ctx.session.step = "confirm";
    const d = ctx.session.draft as Partial<Listing>;
    await ctx.reply(`Here’s your listing:\n\n${listingText({ ...d, id: "", ownerId: 0, photoIds: d.photoIds ?? [], title: d.title ?? "", description: d.description ?? "", set: d.set ?? "", condition: d.condition ?? "", amount: d.amount ?? 0, currency: d.currency ?? "USD", createdAt: 0, status: "active", reports: 0 })}`, { reply_markup: inlineKeyboard([[inlineButton("Publish listing", "listing:create:confirm"), inlineButton("Cancel", "listing:create:cancel")]]) }); return;
  }
  return next();
});

composer.callbackQuery(/^listing:condition:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.session.step !== "condition") return;
  ctx.session.draft = { ...(ctx.session.draft ?? {}), condition: ctx.match[1] }; ctx.session.step = "price";
  await replyPrompt(ctx, "What price and currency? For example: 25 USD.", "Price and currency");
});

composer.callbackQuery("listing:create:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.session.step !== "confirm") { await ctx.reply("That draft has expired. Start a new listing from the menu."); return; }
  const d = ctx.session.draft as Partial<Listing>; const l: Listing = { id: id("card"), ownerId: userId(ctx), photoIds: d.photoIds ?? [], title: d.title ?? "Card", description: d.description ?? "", set: d.set ?? "Unknown set", grade: d.grade, condition: d.condition ?? "Not specified", amount: d.amount ?? 0, currency: d.currency ?? "USD", location: d.location, createdAt: now(), status: "active", reports: 0 };
  db(ctx).listings.push(l); ctx.session.step = undefined; ctx.session.draft = undefined;
  const admin = adminChatId(ctx as never);
  if (admin) { try { await ctx.api.sendMessage(admin, `🃏 New listing: ${l.title}\n${l.amount.toFixed(2)} ${l.currency}\nSeller: ${displayName(ctx)}`, { reply_markup: inlineKeyboard([[inlineButton("Mark sold", `admin:sold:${l.id}`), inlineButton("Remove", `admin:remove:${l.id}`)]]) }); } catch { /* delivery is best effort */ } }
  await ctx.editMessageText(`Your listing is live!\n\n${listingText(l)}`, { reply_markup: inlineKeyboard([[inlineButton("Browse listings", "listing:browse"), inlineButton("My listings", "listing:mine")]]) });
});

export default composer;
