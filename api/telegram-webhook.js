import { createHash, timingSafeEqual } from "node:crypto";

const TELEGRAM_API = "https://api.telegram.org/bot";
const TELEGRAM_CHANNEL = "@mossyaps";
const SUBSCRIBED_STATUSES = new Set(["member", "administrator", "creator"]);

function json(status, body) {
  return Response.json(body, { status });
}

function digest(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest();
}

function secretMatches(request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  const got = request.headers.get("x-telegram-bot-api-secret-token") || "";
  return timingSafeEqual(digest(got), digest(expected));
}

async function tg(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(TELEGRAM_API + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json().catch(function () {
    return {};
  });
}

async function isSubscribed(userId) {
  const data = await tg("getChatMember", { chat_id: TELEGRAM_CHANNEL, user_id: userId });
  const status = data && data.result && data.result.status;
  return SUBSCRIBED_STATUSES.has(status);
}

function channelUrl() {
  return "https://t.me/" + TELEGRAM_CHANNEL.replace(/^@/, "");
}

function notSubscribedMessage() {
  return {
    text:
      "Чтобы получить код к демо ЕГЭ 2027, сначала подпишись на канал 👇\n\n" +
      "Потом нажми «Я подписался(-ась)» — код придёт сразу.",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Подписаться", url: channelUrl() }],
        [{ text: "✅ Я подписался(-ась)", callback_data: "check_subscription" }],
      ],
    },
  };
}

function welcomeMessage(code) {
  return {
    text:
      "Готово! Вот твой код: `" + code + "`\n\n" +
      "Как проходит демо ЕГЭ 2027:\n" +
      "• Это полный официальный демо-вариант — задания 1–42 (чтение, грамматика, аудирование, письмо, говорение).\n" +
      "• Письменная часть идёт на таймере — 190 минут, засчитываются с момента старта.\n" +
      "• Устная часть (говорение) — сразу после письменной, по заданиям, с собственным временем на подготовку и ответ на каждое.\n" +
      "• Прогресс сохраняется автоматически, можно перезагрузить страницу без потерь. Полностью выйти можно только через кнопку выхода на экране экзамена.\n" +
      "• Лучше проходить в одну сессию, как на настоящем экзамене — так будет честная тренировка.\n\n" +
      "Введи код на сайте и начинай, когда будет 3+ часа свободного времени 🍀",
    parse_mode: "Markdown",
  };
}

export async function POST(request) {
  if (!secretMatches(request)) return json(401, { ok: false });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const code = process.env.TELEGRAM_UNLOCK_CODE;
  if (!token || !code) {
    console.error("Telegram bot env vars are not fully set");
    return json(200, { ok: true });
  }

  let update = {};
  try {
    update = await request.json();
  } catch (err) {
    return json(400, { ok: false });
  }

  try {
    if (update.callback_query && update.callback_query.data === "check_subscription") {
      const cq = update.callback_query;
      const chatId = cq.message && cq.message.chat && cq.message.chat.id;
      const userId = cq.from && cq.from.id;
      const subscribed = userId != null && (await isSubscribed(userId));

      if (subscribed) {
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Готово! 🎉" });
        await tg("sendMessage", Object.assign({ chat_id: chatId }, welcomeMessage(code)));
      } else {
        await tg("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "Пока не вижу подписку. Попробуй ещё раз через пару секунд.",
          show_alert: true,
        });
      }
      return json(200, { ok: true });
    }

    if (update.message && typeof update.message.text === "string" && update.message.text.indexOf("/start") === 0) {
      const chatId = update.message.chat.id;
      const userId = update.message.from && update.message.from.id;
      const subscribed = userId != null && (await isSubscribed(userId));

      if (subscribed) {
        await tg("sendMessage", Object.assign({ chat_id: chatId }, welcomeMessage(code)));
      } else {
        await tg("sendMessage", Object.assign({ chat_id: chatId }, notSubscribedMessage()));
      }
      return json(200, { ok: true });
    }
  } catch (err) {
    console.error("telegram-webhook error", err);
  }

  return json(200, { ok: true });
}
