import type { Ctx } from "./bot.js";
export type Listing = { id: string; ownerId: number; photoIds: string[]; title: string; description: string; set: string; grade?: string; condition: string; amount: number; currency: string; location?: string; createdAt: number; status: "active" | "sold" | "removed"; reports: number };
export type Thread = { id: string; listingId: string; buyerId: number; sellerId: number; messages: { senderId: number; text: string; at: number }[]; status: "open" | "closed" };
export type Report = { id: string; listingId: string; reporterId: number; reason: string; at: number; status: "open" | "reviewed" | "dismissed" };
type Db = { listings: Listing[]; threads: Thread[]; reports: Report[]; users: { id: number; displayName: string; contactHandle?: string }[] };
export function now(): number { return Date.now(); }
export function db(ctx: Ctx): Db { const value = ctx.session.db as unknown as Db | undefined; if (value) return value; const fresh: Db = { listings: [], threads: [], reports: [], users: [] }; ctx.session.db = fresh as unknown as typeof ctx.session.db; return fresh; }
export function id(prefix: string): string { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`; }
export function userId(ctx: Ctx): number { return ctx.from?.id ?? ctx.chat?.id ?? 0; }
export function displayName(ctx: Ctx): string { return ctx.session.profile?.displayName ?? ctx.from?.first_name ?? "Collector"; }
export function replyPrompt(ctx: Ctx, text: string, placeholder: string): Promise<unknown> { return ctx.reply(text, { reply_markup: { force_reply: true, input_field_placeholder: placeholder } }); }
export function listingText(l: Listing): string { const grade = l.grade ? ` · Grade ${l.grade}` : ""; const place = l.location ? `\n📍 ${l.location}` : ""; return `🃏 ${l.title}\n${l.set} · ${l.condition}${grade}\n${l.amount.toFixed(2)} ${l.currency}${place}\n\n${l.description || "No description yet."}`; }
