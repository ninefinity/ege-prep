(function () {
  "use strict";

  if (document.querySelector(".site-author")) return;

  const footer = document.createElement("footer");
  footer.className = "site-author";
  footer.setAttribute("role", "contentinfo");
  footer.innerHTML =
    "<p>&copy; 2026 <span class=\"site-author__name\">Julia Moss</span>. Интерактивный пробный экзамен на основе демонстрационного варианта от ФИПИ 2027.</p>" +
    "<p class=\"site-author__promo\">" +
    "Contact: " +
    "<a href=\"mailto:ninefinity@yandex.ru\">ninefinity@yandex.ru</a>" +
    "<span aria-hidden=\"true\"> · </span>" +
    "<a href=\"https://t.me/mosssblue\" target=\"_blank\" rel=\"noopener noreferrer\">Telegram</a>" +
    "</p>";

  document.body.appendChild(footer);
})();
